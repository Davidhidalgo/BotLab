import type { BlockMessageCatalog, RobotBlockSet } from '@botlab/model';

const translations = {
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

export const stackChanBlockMessages: BlockMessageCatalog = {
  schemaVersion: 1,
  namespace: 'botlab.stackchan',
  revision: '1',
  sourceLocale: 'en',
  messages: translations.en,
  translations: { es: translations.es, ca: translations.ca },
};

const motionHelp = 'motionHelp';
const ledHelp = 'ledHelp';

/** StackChan editor blocks: bounded head yaw and side LEDs. */
export const stackChanBlockSet: RobotBlockSet = {
  messages: stackChanBlockMessages,
  blocks: [
    {
      type: 'botlab_stackchan_yaw',
      message: 'yaw',
      tooltip: motionHelp,
      shape: 'statement',
      style: 'motion',
      args: [
        {
          kind: 'number',
          name: 'ANGLE',
          value: 10,
          min: -20,
          max: 20,
          precision: 1,
          clampToInteger: true,
        },
      ],
    },
    {
      type: 'botlab_stackchan_center',
      message: 'center',
      tooltip: motionHelp,
      shape: 'statement',
      style: 'motion',
    },
    {
      type: 'botlab_stackchan_leds',
      message: 'leds',
      tooltip: ledHelp,
      shape: 'statement',
      style: 'more',
      args: [
        {
          kind: 'dropdown',
          name: 'SIDE',
          options: [
            ['both', 'both'],
            ['left', 'left'],
            ['right', 'right'],
          ],
        },
        {
          kind: 'dropdown',
          name: 'COLOR',
          options: [
            ['red', '#ff0000'],
            ['green', '#00ff00'],
            ['blue', '#0000ff'],
            ['amber', '#ff8000'],
            ['white', '#ffffff'],
          ],
        },
        {
          kind: 'number',
          name: 'BRIGHTNESS',
          value: 15,
          min: 0,
          max: 25,
          precision: 1,
          clampToInteger: true,
        },
      ],
    },
    {
      type: 'botlab_stackchan_leds_off',
      message: 'off',
      tooltip: ledHelp,
      shape: 'statement',
      style: 'more',
    },
  ],
  categories: [
    {
      name: { message: 'movement' },
      style: 'motion',
      blockTypes: ['botlab_stackchan_yaw', 'botlab_stackchan_center'],
      placement: 'before-events',
    },
    {
      name: { message: 'lights' },
      style: 'botlab',
      blockTypes: ['botlab_stackchan_leds', 'botlab_stackchan_leds_off'],
      placement: 'before-events',
    },
  ],
};
