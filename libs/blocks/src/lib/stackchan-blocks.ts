import type * as ScratchBlocks from 'scratch-blocks';
import type { BlocksLocale } from './block-messages';

const messages = {
  en: {
    movement: 'StackChan head',
    lights: 'StackChan LEDs',
    yaw: 'head horizontal position %1 °',
    center: 'head to center (0°)',
    leds: 'LED %1 color %2 brightness %3 %%',
    off: 'turn off both LEDs',
    both: 'both sides',
    left: 'left',
    right: 'right',
    red: 'red',
    green: 'green',
    blue: 'blue',
    amber: 'amber',
    white: 'white',
    motionHelp:
      'Absolute horizontal angle ±20°. Changes up to 10°, with a 1–3 s pause. Check the calibrated center first.',
    ledHelp:
      'Brightness 0–25%. Color transition 0.5 s; waits 1 s before the next block.',
  },
  es: {
    movement: 'Cabeza StackChan',
    lights: 'LED StackChan',
    yaw: 'posición horizontal de cabeza %1 °',
    center: 'cabeza al centro (0°)',
    leds: 'LED %1 color %2 brillo %3 %%',
    off: 'apagar ambos LED',
    both: 'ambos lados',
    left: 'izquierdo',
    right: 'derecho',
    red: 'rojo',
    green: 'verde',
    blue: 'azul',
    amber: 'ámbar',
    white: 'blanco',
    motionHelp:
      'Ángulo horizontal absoluto ±20°. Cambios de hasta 10°, con pausa de 1–3 s. Comprueba primero el centro calibrado.',
    ledHelp:
      'Brillo 0–25%. Transición de color de 0,5 s; espera 1 s antes del siguiente bloque.',
  },
  ca: {
    movement: 'Cap StackChan',
    lights: 'LED StackChan',
    yaw: 'posició horitzontal del cap %1 °',
    center: 'cap al centre (0°)',
    leds: 'LED %1 color %2 brillantor %3 %%',
    off: 'apaga els dos LED',
    both: 'els dos costats',
    left: 'esquerre',
    right: 'dret',
    red: 'vermell',
    green: 'verd',
    blue: 'blau',
    amber: 'ambre',
    white: 'blanc',
    motionHelp:
      'Angle horitzontal absolut ±20°. Canvis de fins a 10°, amb pausa d’1–3 s. Comprova primer el centre calibrat.',
    ledHelp:
      'Brillantor 0–25%. Transició de color de 0,5 s; espera 1 s abans del bloc següent.',
  },
};
export function applyStackChanLocale(
  api: typeof ScratchBlocks,
  locale: BlocksLocale,
) {
  for (const [key, value] of Object.entries(messages[locale]))
    api.Msg[`BOTLAB_STACKCHAN_${key.toUpperCase()}`] = value;
}
export function registerStackChanBlocks(api: typeof ScratchBlocks) {
  if (api.Blocks.botlab_stackchan_yaw) return;
  const msg = (key: string) => `%{BKY_BOTLAB_STACKCHAN_${key.toUpperCase()}}`;
  api.defineBlocksWithJsonArray([
    {
      type: 'botlab_stackchan_yaw',
      message0: msg('yaw'),
      args0: [
        {
          type: 'field_number',
          name: 'ANGLE',
          value: 10,
          min: -20,
          max: 20,
          precision: 1,
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: msg('motionHelp'),
    },
    {
      type: 'botlab_stackchan_center',
      message0: msg('center'),
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: msg('motionHelp'),
    },
    {
      type: 'botlab_stackchan_leds',
      message0: msg('leds'),
      args0: [
        {
          type: 'field_dropdown',
          name: 'SIDE',
          options: ['both', 'left', 'right'].map((side) => [msg(side), side]),
        },
        {
          type: 'field_dropdown',
          name: 'COLOR',
          options: [
            ['red', '#ff0000'],
            ['green', '#00ff00'],
            ['blue', '#0000ff'],
            ['amber', '#ff8000'],
            ['white', '#ffffff'],
          ].map(([label, value]) => [msg(label), value]),
        },
        {
          type: 'field_number',
          name: 'BRIGHTNESS',
          value: 15,
          min: 0,
          max: 25,
          precision: 1,
        },
      ],
      style: 'more',
      extensions: ['shape_statement'],
      tooltip: msg('ledHelp'),
    },
    {
      type: 'botlab_stackchan_leds_off',
      message0: msg('off'),
      style: 'more',
      extensions: ['shape_statement'],
      tooltip: msg('ledHelp'),
    },
  ]);
  // Scratch's field_number implementation does not enforce JSON min/max/precision.
  for (const [type, field, min, max, fallback] of [
    ['botlab_stackchan_yaw', 'ANGLE', -20, 20, 10],
    ['botlab_stackchan_leds', 'BRIGHTNESS', 0, 25, 15],
  ] as const) {
    const definition = api.Blocks[type];
    const init = definition.init;
    definition.init = function () {
      init.call(this);
      const bounded = this.getField(field);
      bounded.setValidator((value: string) => {
        const numeric = Number(value);
        return Number.isFinite(numeric)
          ? String(Math.max(min, Math.min(max, Math.round(numeric))))
          : null;
      });
      bounded.setValue(String(fallback));
    };
  }
}
