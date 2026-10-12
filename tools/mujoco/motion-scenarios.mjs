// Bounded commands accepted by the current controllers. No new capability is enabled.
const step = (label, forward, yaw, durationSeconds) => ({
  label,
  forward,
  yaw,
  durationSeconds,
});
const repeat = (count, steps) =>
  Array.from({ length: count }, (_, i) =>
    steps.map((s) => ({ ...s, label: `${i + 1}: ${s.label}` })),
  ).flat();
export const motionScenarios = {
  jumper: {
    targetId: 'jumper-web-walking',
    name: 'Jumper · marcha prolongada',
    minPathMeters: 10,
    steps: [
      step('Equilibrio inicial', 0, 0, 5),
      ...repeat(5, [
        step('Avance sostenido', 0.24, 0, 20),
        step('Parar', 0, 0, 3),
        step('Marcha lenta', 0.12, 0, 5),
        step('Acelerar', 0.24, 0, 5),
        step('Parar', 0, 0, 2),
      ]),
      step('Equilibrio final', 0, 0, 10),
    ],
  },
  microduck: {
    targetId: 'microduck-mujoco-web',
    name: 'MicroDuck · circuito de movimiento',
    minPathMeters: 3,
    steps: [
      step('Equilibrio inicial', 0, 0, 3),
      ...repeat(3, [
        step('Avanzar', 0.25, 0, 15),
        step('Parar', 0, 0, 2),
        step('Retroceder', -0.2, 0, 8),
        step('Parar', 0, 0, 2),
        step('Girar a la izquierda', 0, 1, 4),
        step('Girar a la derecha', 0, -1, 8),
        step('Girar a la izquierda', 0, 1, 4),
        step('Avanzar en curva izquierda', 0.25, 0.6, 8),
        step('Avanzar en curva derecha', 0.25, -0.6, 8),
        step('Parar', 0, 0, 1),
      ]),
      step('Equilibrio final', 0, 0, 12),
    ],
  },
};

export function scenarioWorkspace(robot) {
  const scenario = motionScenarios[robot];
  const id = `${robot}-mujoco-motion`;
  const chain = scenario.steps.reduceRight(
    (next, s, i) =>
      `<block type="botlab_web_velocity" id="motion-${i}"><field name="FORWARD">${s.forward}</field><field name="YAW">${s.yaw}</field><field name="SECONDS">${s.durationSeconds}</field>${next ? `<next>${next}</next>` : ''}</block>`,
    '',
  );
  return {
    schemaVersion: 1,
    locale: 'es',
    targetId: scenario.targetId,
    simulatorBackend: 'mujoco',
    workspace: {
      id,
      behaviorId: id,
      kind: 'blocks',
      engine: 'scratch-blocks',
      format: 'scratch-xml',
      label: scenario.name,
      status: 'loaded',
      validationErrors: [],
      createdAt: new Date(0).toISOString(),
      content: `<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="motion-start" x="20" y="20"><next>${chain}</next></block></xml>`,
    },
  };
}
