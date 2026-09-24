import { useMachine } from '@xstate/react';
import type { BlocksWorkspaceArtifact } from '@botlab/blocks';
import { stackChanExecutionMachine } from './stackchan-execution-machine';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@botlab/ui';
import {
  connectStackChanBluetooth,
  stackChanRobotModule,
  validateStackChanProgram,
  type StackChanBleConnection,
  type StackChanBluetooth,
} from '@botlab/adapters-stackchan';
import type { BotLabLocale } from './i18n';

const labels = {
  es: {
    setup: 'Abre DANCE en tu StackChan y mantenlo cerca del ordenador.',
    connect: 'Conectar Bluetooth',
    disconnect: 'Desconectar',
    unavailable:
      'Abre BotLab en Chrome con HTTPS o localhost para usar Bluetooth.',
    ready: 'Conectado',
    offline: 'Desconectado',
    connecting: 'Conectando…',
    sending: 'Enviando…',
    sent: 'Orden enviada. Comprueba el movimiento en el robot.',
    failed:
      'No se pudo completar la operación. Comprueba DANCE y vuelve a conectar.',
    pose: 'He comprobado que la cabeza está cerca de su centro calibrado.',
    angles:
      'Ángulos absolutos del servo horizontal. Velocidad baja. El robot no informa de la posición alcanzada.',
    go: 'Ir a',
    rest: 'Descanso del servo. Espera',
    note: 'Desconectar cierra Bluetooth; no detiene un movimiento ya enviado.',
    trial: 'Prueba manual de servos',
    run: 'Ejecutar programa',
    cancel: 'Cancelar secuencia',
    running: 'Ejecutando secuencia…',
    cancelled: 'Secuencia cancelada. No se enviarán más órdenes.',
    finished: 'Órdenes enviadas. Comprueba el resultado en el robot.',
    empty: 'No hay órdenes para el robot.',
    needPose: 'Comprueba el centro calibrado antes de ejecutar movimientos.',
    limits:
      'Giro horizontal ±20°, cambios de hasta 10° y pausas de 1–3 s según el recorrido. Descanso automático de 10 s cada 12 movimientos, sin reconectar. LED hasta 25% de brillo. Editar el programa cancela la secuencia.',
  },
  ca: {
    setup: 'Obre DANCE al teu StackChan i deixa’l a prop de l’ordinador.',
    connect: 'Connectar Bluetooth',
    disconnect: 'Desconnectar',
    unavailable:
      'Obre BotLab a Chrome amb HTTPS o localhost per fer servir Bluetooth.',
    ready: 'Connectat',
    offline: 'Desconnectat',
    connecting: 'Connectant…',
    sending: 'Enviant…',
    sent: 'Ordre enviada. Comprova el moviment al robot.',
    failed:
      'No s’ha pogut completar l’operació. Comprova DANCE i torna a connectar.',
    pose: 'He comprovat que el cap és a prop del seu centre calibrat.',
    angles:
      'Angles absoluts del servo horitzontal. Velocitat baixa. El robot no informa de la posició assolida.',
    go: 'Anar a',
    rest: 'Descans del servo. Espera',
    note: 'Desconnectar tanca Bluetooth; no atura un moviment ja enviat.',
    trial: 'Prova manual de servos',
    run: 'Executar programa',
    cancel: 'Cancel·lar seqüència',
    running: 'Executant seqüència…',
    cancelled: 'Seqüència cancel·lada. No s’enviaran més ordres.',
    finished: 'Ordres enviades. Comprova el resultat al robot.',
    empty: 'No hi ha ordres per al robot.',
    needPose: 'Comprova el centre calibrat abans d’executar moviments.',
    limits:
      'Gir horitzontal ±20°, canvis de fins a 10° i pauses d’1–3 s segons el recorregut. Descans automàtic de 10 s cada 12 moviments, sense reconnectar. LED fins al 25% de brillantor. Editar el programa cancel·la la seqüència.',
  },
  en: {
    setup: 'Open DANCE on StackChan and keep it near your computer.',
    connect: 'Connect Bluetooth',
    disconnect: 'Disconnect',
    unavailable:
      'Open BotLab in Chrome over HTTPS or localhost to use Bluetooth.',
    ready: 'Connected',
    offline: 'Disconnected',
    connecting: 'Connecting…',
    sending: 'Sending…',
    sent: 'Command sent. Check movement on the robot.',
    failed: 'The operation failed. Check DANCE and reconnect.',
    pose: 'I have checked that the head is near its calibrated center.',
    angles:
      'Absolute horizontal servo angles. Low speed. The robot does not report the reached position.',
    go: 'Go to',
    rest: 'Servo rest. Wait',
    note: 'Disconnect closes Bluetooth; it does not stop a movement already sent.',
    trial: 'Manual servo trial',
    run: 'Run program',
    cancel: 'Cancel sequence',
    running: 'Running sequence…',
    cancelled: 'Sequence cancelled. No more commands will be sent.',
    finished: 'Commands sent. Check the result on the robot.',
    empty: 'No robot commands.',
    needPose: 'Check the calibrated center before running movement.',
    limits:
      'Horizontal ±20°, changes up to 10° and 1–3 s pauses based on travel. Automatic 10 s rest every 12 moves, without reconnecting. LED brightness up to 25%. Editing the program cancels the sequence.',
  },
};

export function StackChanPanel({
  locale,
  onBusy,
  workspace,
  executionBlocked = false,
  onActiveBlock,
}: {
  workspace?: BlocksWorkspaceArtifact;
  executionBlocked?: boolean;
  onActiveBlock?: (id?: string) => void;
  locale: BotLabLocale;
  onBusy: (busy: boolean) => void;
}) {
  const copy = labels[locale];
  const [execution, sendExecution] = useMachine(stackChanExecutionMachine);
  const running = execution.matches('running');
  const [programError, setProgramError] = useState<string>();
  useEffect(() => {
    sendExecution({ type: 'source.changed' });
    setProgramError(undefined);
  }, [workspace?.content, sendExecution]);
  const [status, setStatus] = useState<
    'offline' | 'connecting' | 'ready' | 'sending' | 'sent' | 'failed'
  >('offline');
  const [poseChecked, setPoseChecked] = useState(false);
  const [name, setName] = useState('');
  const connection = useRef<StackChanBleConnection>();
  const attempt = useRef<AbortController>();
  const bluetooth = (
    navigator as Navigator & { bluetooth?: StackChanBluetooth }
  ).bluetooth;
  const busy = status === 'connecting' || status === 'sending' || running;
  const connected =
    status === 'ready' || status === 'sent' || status === 'sending';
  useEffect(() => {
    onBusy(busy);
    return () => onBusy(false);
  }, [busy, onBusy]);
  useEffect(
    () => () => {
      attempt.current?.abort();
      connection.current?.disconnect();
    },
    [],
  );

  function disconnect() {
    sendExecution({ type: 'cancel' });
    attempt.current?.abort();
    connection.current?.disconnect();
    connection.current = undefined;
    setPoseChecked(false);
    setStatus('offline');
  }
  async function connect() {
    if (!bluetooth || busy) return;
    disconnect();
    const controller = new AbortController();
    attempt.current = controller;
    setStatus('connecting');
    try {
      const result = await connectStackChanBluetooth(
        bluetooth,
        controller.signal,
        () => {
          if (controller.signal.aborted) return;
          sendExecution({ type: 'connection.lost' });
          connection.current = undefined;
          setPoseChecked(false);
          setStatus('offline');
        },
      );
      if (controller.signal.aborted) {
        result.disconnect();
        return;
      }
      connection.current = result;
      setName(result.deviceName);
      setStatus('ready');
    } catch {
      if (!controller.signal.aborted) setStatus('failed');
    }
  }
  async function move(degrees: number) {
    if (!connection.current || !poseChecked || busy) return;
    const remaining = connection.current.motionState.waitBeforeMotionMs ?? 0;
    if (remaining > 0) {
      setProgramError(`${copy.rest} ${Math.ceil(remaining / 1000)} s.`);
      return;
    }
    setProgramError(undefined);
    const controller = attempt.current;
    setStatus('sending');
    try {
      await connection.current.sendYaw(degrees);
      if (!controller?.signal.aborted) setStatus('sent');
    } catch (error) {
      disconnect();
      setProgramError(error instanceof Error ? error.message : String(error));
      setStatus('failed');
    }
  }
  function runProgram() {
    if (!workspace || !connection.current || busy || executionBlocked) return;
    setProgramError(undefined);
    try {
      const steps = stackChanRobotModule.readProgram(workspace);
      validateStackChanProgram(steps, connection.current.motionState);
      if (steps.some((step) => step.type === 'yaw') && !poseChecked)
        throw new Error(copy.needPose);
      sendExecution({
        type: 'run',
        request: {
          connection: connection.current,
          steps,
          programId: workspace.id,
          onBlock: (id) => onActiveBlock?.(id),
        },
      });
    } catch (error) {
      setProgramError(error instanceof Error ? error.message : String(error));
    }
  }
  return (
    <section className="space-y-4 p-6" aria-label="StackChan Bluetooth">
      <h2 className="text-lg font-semibold">StackChan</h2>
      <p className="text-sm text-muted-foreground">{copy.setup}</p>
      {!bluetooth ? (
        <p role="status" className="text-sm">
          {copy.unavailable}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void connect()}
          disabled={!bluetooth || busy || connected}
        >
          {copy.connect}
        </Button>
        <Button
          variant="secondary"
          onClick={disconnect}
          disabled={!connected && status !== 'connecting'}
        >
          {copy.disconnect}
        </Button>
      </div>
      <p role="status" className="text-sm">
        {connected ? `${name} · ` : ''}
        {copy[status]}
      </p>
      {workspace && (
        <>
          <p className="text-sm text-muted-foreground">{copy.limits}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!connected || busy || executionBlocked}
              onClick={runProgram}
            >
              {copy.run}
            </Button>
            <Button
              variant="secondary"
              disabled={!running}
              onClick={() => sendExecution({ type: 'cancel' })}
            >
              {copy.cancel}
            </Button>
          </div>
          <p role="status" className="text-sm">
            {running
              ? copy.running
              : execution.matches('cancelled')
                ? copy.cancelled
                : execution.matches('finished')
                  ? execution.context.result?.status === 'no-work'
                    ? copy.empty
                    : copy.finished
                  : ''}
          </p>
        </>
      )}
      {(programError || execution.context.error) && (
        <p role="alert" className="text-sm">
          {programError || execution.context.error}
        </p>
      )}
      <h3 className="font-medium">{copy.trial}</h3>
      <p className="text-sm text-muted-foreground">{copy.angles}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={poseChecked}
          disabled={!connected || busy}
          onChange={(event) => setPoseChecked(event.target.checked)}
        />
        {copy.pose}
      </label>
      <div className="flex flex-wrap gap-2">
        {[-10, 0, 10].map((degrees) => (
          <Button
            key={degrees}
            variant="secondary"
            disabled={!connected || !poseChecked || busy}
            onClick={() => void move(degrees)}
          >
            {copy.go} {degrees}°
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{copy.note}</p>
    </section>
  );
}
