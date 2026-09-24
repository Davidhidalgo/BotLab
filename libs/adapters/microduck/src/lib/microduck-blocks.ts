import type {
  BlockMessageCatalog,
  RobotBlockDefinition,
  RobotBlockSet,
} from '@botlab/model';

export const microDuckBlockMessages: BlockMessageCatalog = {
  schemaVersion: 1,
  namespace: 'botlab.microduck',
  revision: '1',
  sourceLocale: 'en',
  messages: {
    is_sit: 'is sitting?',
    is_stand: 'is standing?',
    is_transitioning: 'is changing posture?',
    conditionTooltip: 'Checks the observed posture when this condition runs.',
    sit: 'sit down',
    stand: 'stand up',
    postureTooltip:
      'Requires simulator posture support. Waits until the requested posture is stable.',
    leds: 'set MicroDuck LEDs %1',
    walk: 'move forward %1 m',
    movement: 'Movement',
    preciseMovement: 'Precise movement',
    forwardSteps: 'move forward %1 steps',
    backwardSteps: 'move backward %1 steps',
    backwardMeters: 'move backward %1 m',
    turnLeft: 'turn left',
    turnRight: 'turn right',
    turnAround: 'turn around',
    turnDegrees: 'turn %1 °',
    stepsTooltip: 'One BotLab step is 0.5 m, relative to the robot heading.',
    backwardTooltip: 'Moves backward for the requested distance in meters.',
    turnLeftTooltip: 'Turns 90 degrees to the left.',
    turnRightTooltip: 'Turns 90 degrees to the right.',
    turnAroundTooltip: 'Turns 180 degrees.',
    turnTooltip: 'Negative degrees turn left; positive degrees turn right.',
    ledsTooltip: 'Controls the MicroDuck robot LEDs.',
    walkTooltip:
      'Moves the MicroDuck simulator forward for the requested distance.',
    smile: 'smile',
    blink: 'blink',
    solid: 'solid',
    off: 'off',
  },
  translations: {
    ca: {
      is_sit: 'està assegut?',
      is_stand: 'està dret?',
      is_transitioning: 'està canviant de postura?',
      conditionTooltip:
        'Comprova la postura observada quan s’executa la condició.',
      sit: 'seu',
      stand: 'aixeca’t',
      postureTooltip:
        'Requereix suport de postures del simulador. Espera que la postura demanada sigui estable.',
      leds: 'LED MicroDuck: %1',
      walk: 'avança %1 m',
      movement: 'Moviment',
      preciseMovement: 'Moviment precís',
      forwardSteps: 'avança %1 passos',
      backwardSteps: 'retrocedeix %1 passos',
      backwardMeters: 'retrocedeix %1 m',
      turnLeft: 'gira a l’esquerra',
      turnRight: 'gira a la dreta',
      turnAround: 'fes mitja volta',
      turnDegrees: 'gira %1 °',
      stepsTooltip:
        'Un pas de BotLab equival a 0,5 m, segons l’orientació del robot.',
      backwardTooltip: 'Retrocedeix la distància indicada en metres.',
      turnLeftTooltip: 'Gira 90 graus a l’esquerra.',
      turnRightTooltip: 'Gira 90 graus a la dreta.',
      turnAroundTooltip: 'Gira 180 graus.',
      turnTooltip:
        'Els graus negatius giren a l’esquerra; els positius, a la dreta.',
      ledsTooltip: 'Controla els LED del robot MicroDuck.',
      walkTooltip:
        'Fa avançar el MicroDuck al simulador la distància indicada.',
      smile: 'somriure',
      blink: 'parpelleig',
      solid: 'fix',
      off: 'apagat',
    },
    es: {
      is_sit: '¿está sentado?',
      is_stand: '¿está de pie?',
      is_transitioning: '¿está cambiando de postura?',
      conditionTooltip:
        'Comprueba la postura observada al ejecutar la condición.',
      sit: 'siéntate',
      stand: 'levántate',
      postureTooltip:
        'Requiere soporte de posturas del simulador. Espera hasta que la postura solicitada sea estable.',
      leds: 'LED MicroDuck: %1',
      walk: 'avanza %1 m',
      movement: 'Movimiento',
      preciseMovement: 'Movimiento preciso',
      forwardSteps: 'avanza %1 pasos',
      backwardSteps: 'retrocede %1 pasos',
      backwardMeters: 'retrocede %1 m',
      turnLeft: 'gira a la izquierda',
      turnRight: 'gira a la derecha',
      turnAround: 'da media vuelta',
      turnDegrees: 'gira %1 °',
      stepsTooltip:
        'Un paso de BotLab equivale a 0,5 m, según la orientación del robot.',
      backwardTooltip: 'Retrocede la distancia indicada en metros.',
      turnLeftTooltip: 'Gira 90 grados a la izquierda.',
      turnRightTooltip: 'Gira 90 grados a la derecha.',
      turnAroundTooltip: 'Gira 180 grados.',
      turnTooltip:
        'Los grados negativos giran a la izquierda; los positivos, a la derecha.',
      ledsTooltip: 'Controla los LED del robot MicroDuck.',
      walkTooltip:
        'Hace avanzar MicroDuck en el simulador la distancia indicada.',
      smile: 'sonrisa',
      blink: 'parpadeo',
      solid: 'fijo',
      off: 'apagado',
    },
  },
};

const movementBlocks: RobotBlockDefinition[] = (
  [
    [
      'walk_steps',
      'forwardSteps',
      'stepsTooltip',
      'forward',
      ['STEPS', 1, 0, 40, 1],
    ],
    [
      'back_steps',
      'backwardSteps',
      'stepsTooltip',
      'backward',
      ['STEPS', 1, 0, 40, 1],
    ],
    ['turn_left', 'turnLeft', 'turnLeftTooltip', 'left'],
    ['turn_right', 'turnRight', 'turnRightTooltip', 'right'],
    ['turn_around', 'turnAround', 'turnAroundTooltip', 'around'],
    [
      'walk_distance',
      'walk',
      'walkTooltip',
      'forward',
      ['DISTANCE', 5, 0, 20, 0.1],
    ],
    [
      'back_distance',
      'backwardMeters',
      'backwardTooltip',
      'backward',
      ['DISTANCE', 1, 0, 20, 0.1],
    ],
    [
      'turn_degrees',
      'turnDegrees',
      'turnTooltip',
      'right',
      ['ANGLE', 90, -360, 360, 1],
    ],
  ] as const
).map(([type, message, tooltip, icon, field]) => ({
  type: `botlab_microduck_${type}`,
  message,
  tooltip,
  shape: 'statement',
  style: 'motion',
  args: [
    ...(field
      ? [
          {
            kind: 'number' as const,
            name: field[0],
            value: field[1],
            min: field[2],
            max: field[3],
            precision: field[4],
          },
        ]
      : []),
    {
      kind: 'icon' as const,
      name: 'DIRECTION',
      icon,
      alt: tooltip,
      // Signed turns point left for negative angles.
      ...(type === 'turn_degrees'
        ? {
            signOf: {
              field: 'ANGLE',
              negative: 'left' as const,
              positive: 'right' as const,
            },
          }
        : {}),
    },
  ],
}));

/** MicroDuck editor blocks: movement, posture, posture conditions and LEDs. */
export const microDuckBlockSet: RobotBlockSet = {
  messages: microDuckBlockMessages,
  blocks: [
    ...(['sit', 'stand', 'transitioning'] as const).map((posture) => ({
      type: `botlab_microduck_is_${posture}`,
      message: `is_${posture}`,
      tooltip: 'conditionTooltip',
      shape: 'boolean' as const,
      style: 'sensing' as const,
    })),
    ...(['sit', 'stand'] as const).map((posture) => ({
      type: `botlab_microduck_${posture}`,
      message: posture,
      tooltip: 'postureTooltip',
      shape: 'statement' as const,
      style: 'motion' as const,
    })),
    ...movementBlocks,
    {
      type: 'botlab_microduck_set_leds',
      message: 'leds',
      tooltip: 'ledsTooltip',
      shape: 'statement',
      style: 'more',
      args: [
        {
          kind: 'dropdown',
          name: 'PATTERN',
          options: [
            ['smile', 'smile'],
            ['blink', 'blink'],
            ['solid', 'solid'],
            ['off', 'off'],
          ],
        },
      ],
    },
  ],
  categories: [
    {
      name: { message: 'movement' },
      style: 'motion',
      blockTypes: [
        'walk_steps',
        'back_steps',
        'turn_left',
        'turn_right',
        'turn_around',
      ].map((type) => `botlab_microduck_${type}`),
    },
    {
      name: { message: 'preciseMovement' },
      style: 'motion',
      blockTypes: [
        'walk_distance',
        'back_distance',
        'turn_degrees',
        'sit',
        'stand',
      ].map((type) => `botlab_microduck_${type}`),
    },
    {
      name: { builtin: 'sensing' },
      style: 'sensing',
      blockTypes: ['sit', 'stand', 'transitioning'].map(
        (posture) => `botlab_microduck_is_${posture}`,
      ),
    },
    {
      name: { text: 'BotLab' },
      style: 'botlab',
      blockTypes: ['botlab_microduck_set_leds'],
    },
  ],
};
