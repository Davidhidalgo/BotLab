import type * as ScratchBlocks from 'scratch-blocks';
import {
  walkingProgramLimits,
  type WalkingCondition,
  type WalkingProgramStep,
} from '@botlab/model';
import type { BlocksWorkspaceArtifact } from './blocks-contract';
import type { BlocksLocale } from './block-messages';

export function applyWebWalkingLocale(
  api: typeof ScratchBlocks,
  locale: BlocksLocale,
) {
  const copy = {
    es: [
      'Avanzado',
      'marchar %1 m/s y girar %2 rad/s durante %3 s',
      'Control por velocidad y tiempo. La distancia y el giro reales pueden variar.',
      'avanzar %1 cm',
      '¿obstáculo delante a menos de %1 cm?',
      'esperar hasta %1 máximo %2 s',
      'mirar %1',
      'izquierda',
      'centro',
      'derecha',
    ],
    ca: [
      'Avançat',
      'camina a %1 m/s i gira a %2 rad/s durant %3 s',
      'Control per velocitat i temps. La distància i el gir reals poden variar.',
      'avançar %1 cm',
      'obstacle davant a menys de %1 cm?',
      'espera fins a %1 màxim %2 s',
      'mirar %1',
      'esquerra',
      'centre',
      'dreta',
    ],
    en: [
      'Advanced',
      'walk at %1 m/s and turn at %2 rad/s for %3 s',
      'Control by speed and time. Actual distance and turn can vary.',
      'advance %1 cm',
      'obstacle ahead closer than %1 cm?',
      'wait until %1 at most %2 s',
      'look %1',
      'left',
      'centre',
      'right',
    ],
  }[locale];
  for (const [i, key] of [
    'ADVANCED',
    'VELOCITY',
    'HELP',
    'CENTIMETRES',
    'PROXIMITY',
    'WAIT_UNTIL',
    'HEAD',
    'LEFT',
    'CENTRE',
    'RIGHT',
  ].entries())
    api.Msg[`BOTLAB_WEB_${key}`] = copy[i];
}
export function registerMicroduckMujocoBlocks(api: typeof ScratchBlocks) {
  if (api.Blocks['botlab_web_velocity']) return;
  api.defineBlocksWithJsonArray([
    {
      type: 'botlab_web_head_yaw',
      message0: '%{BKY_BOTLAB_WEB_HEAD}',
      args0: [
        {
          type: 'field_dropdown',
          name: 'DIRECTION',
          options: [
            ['%{BKY_BOTLAB_WEB_LEFT}', 'left'],
            ['%{BKY_BOTLAB_WEB_CENTRE}', 'centre'],
            ['%{BKY_BOTLAB_WEB_RIGHT}', 'right'],
          ],
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
    },
    {
      type: 'botlab_web_wait_until',
      message0: '%{BKY_BOTLAB_WEB_WAIT_UNTIL}',
      args0: [
        { type: 'input_value', name: 'CONDITION', check: 'Boolean' },
        {
          type: 'field_number',
          name: 'SECONDS',
          value: 5,
          min: 0.5,
          max: 30,
          precision: 0.5,
        },
      ],
      style: 'control',
      extensions: ['shape_statement'],
    },
    {
      type: 'botlab_web_advance_cm',
      message0: '%{BKY_BOTLAB_WEB_CENTIMETRES}',
      args0: [
        {
          type: 'field_number',
          name: 'CM',
          value: 15,
          text: '15',
          min: 0,
          max: 2000,
        },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
    },
    {
      type: 'botlab_web_obstacle',
      message0: '%{BKY_BOTLAB_WEB_PROXIMITY}',
      args0: [
        {
          type: 'field_number',
          name: 'CM',
          value: 30,
          text: '30',
          min: 5,
          max: 400,
        },
      ],
      style: 'sensing',
      extensions: ['output_boolean'],
    },
    {
      type: 'botlab_web_velocity',
      message0: '%{BKY_BOTLAB_WEB_VELOCITY}',
      args0: [
        { type: 'field_number', name: 'FORWARD', value: 0.24, text: '0.24' },
        { type: 'field_number', name: 'YAW', value: 0, text: '0' },
        { type: 'field_number', name: 'SECONDS', value: 3, text: '3' },
      ],
      style: 'motion',
      extensions: ['shape_statement'],
      tooltip: '%{BKY_BOTLAB_WEB_HELP}',
    },
  ]);
}
const commonWalkingBlockTypes = [
  'event_whenflagclicked',
  'botlab_microduck_walk_steps',
  'botlab_microduck_walk_distance',
  'control_wait',
  'control_repeat',
  'control_repeat_until',
  'botlab_web_wait_until',
  'control_if',
  'control_if_else',
  'botlab_web_advance_cm',
  'botlab_web_obstacle',
  'operator_and',
  'operator_or',
  'operator_not',
  'botlab_web_velocity',
];
export const jumperWalkingBlockTypes = [
  ...commonWalkingBlockTypes,
  'botlab_microduck_turn_left',
  'botlab_microduck_turn_right',
];
export const microduckWalkingBlockTypes = [
  'botlab_microduck_sit',
  'botlab_microduck_stand',
  'botlab_web_head_yaw',
  ...commonWalkingBlockTypes,
  'botlab_microduck_turn_left',
];
const wait = (id: string) =>
  `<block type="control_wait" id="${id}"><value name="DURATION"><shadow type="math_positive_number"><field name="NUM">1</field></shadow></value></block>`;
export const jumperWalkingExample: BlocksWorkspaceArtifact = {
  id: 'jumper-walking-workspace',
  behaviorId: 'jumper-web-walking',
  kind: 'blocks',
  label: 'Avanzar y esperar',
  format: 'scratch-xml',
  engine: 'scratch-blocks',
  status: 'loaded',
  validationErrors: [],
  createdAt: new Date(0).toISOString(),
  content: `<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="walking-start" x="20" y="20"><next><block type="botlab_microduck_walk_steps" id="walk"><field name="STEPS">1</field><next>${wait('wait')}</next></block></next></block></xml>`,
};
export const microduckWalkingExample: BlocksWorkspaceArtifact = {
  ...jumperWalkingExample,
  id: 'microduck-walking-workspace',
  behaviorId: 'microduck-web-walking',
  label: 'Avanzar, girar y esperar',
  content: jumperWalkingExample.content.replace(
    `<next>${wait('wait')}</next>`,
    `<next><block type="botlab_microduck_turn_left" id="turn"><next>${wait('wait')}</next></block></next>`,
  ),
};

/** Bounded sequences with literal waits/repeats; expressions remain unsupported. */
export function readMicroduckWalkingProgram(
  artifact: BlocksWorkspaceArtifact,
): WalkingProgramStep[] {
  return readWalkingProgram(artifact, microduckWalkingBlockTypes);
}
export function readJumperWalkingProgram(
  artifact: BlocksWorkspaceArtifact,
): WalkingProgramStep[] {
  return readWalkingProgram(artifact, jumperWalkingBlockTypes);
}
function readWalkingProgram(
  artifact: BlocksWorkspaceArtifact,
  allowedTypes: readonly string[],
): WalkingProgramStep[] {
  const doc = new DOMParser().parseFromString(artifact.content, 'text/xml');
  if (
    artifact.format !== 'scratch-xml' ||
    doc.doctype ||
    doc.querySelector('parsererror') ||
    doc.documentElement.localName !== 'xml'
  )
    throw new Error('XML de movimiento no válido.');
  const children = (e: Element, tag: string) =>
    Array.from(e.children).filter((c) => c.localName === tag);
  const roots = children(doc.documentElement, 'block');
  if (
    roots.length !== 1 ||
    roots[0].getAttribute('type') !== 'event_whenflagclicked' ||
    roots[0].getAttribute('disabled') === 'true'
  )
    throw new Error('Usa una única secuencia activa desde la bandera.');
  const visited = new Set<Element>([roots[0]]);
  const number = (e: Element, name: string) => {
    const fields = children(e, 'field').filter(
      (f) => f.getAttribute('name') === name,
    );
    const text = fields[0]?.textContent?.trim();
    if (fields.length !== 1 || !text || !Number.isFinite(Number(text)))
      throw new Error('Campo numérico no válido.');
    return Number(text);
  };
  const literal = (e: Element, name: string) => {
    const values = children(e, 'value');
    const input = values[0];
    const value = input?.children[0];
    if (
      values.length !== 1 ||
      input.getAttribute('name') !== name ||
      input.children.length !== 1 ||
      !value ||
      !['shadow', 'block'].includes(value.localName) ||
      ![
        'math_number',
        'math_positive_number',
        'math_whole_number',
        'math_integer',
      ].includes(value.getAttribute('type') ?? '') ||
      value.getAttribute('disabled') === 'true'
    )
      throw new Error(
        'Esperar y repetir necesitan un número literal, sin expresiones.',
      );
    visited.add(input);
    visited.add(value);
    return number(value, 'NUM');
  };
  const link = (e: Element, tag: string, name?: string) => {
    const links = children(e, tag).filter(
      (c) => !name || c.getAttribute('name') === name,
    );
    if (!links.length) return undefined;
    const container = links[0];
    if (links.length !== 1 || (name && container.getAttribute('name') !== name))
      throw new Error('Secuencia no válida.');
    visited.add(container);
    const blocks = children(container, 'block');
    if (container.children.length === 0 && tag === 'statement')
      return undefined;
    if (container.children.length !== 1 || blocks.length !== 1)
      throw new Error('Secuencia no válida.');
    return blocks[0];
  };
  function condition(
    e: Element,
    inputName = 'CONDITION',
    depth = 0,
  ): WalkingCondition {
    const values = children(e, 'value').filter(
      (v) => v.getAttribute('name') === inputName,
    );
    const container = values[0],
      block = container?.children[0];
    if (
      depth > 16 ||
      values.length !== 1 ||
      container.children.length !== 1 ||
      block?.localName !== 'block' ||
      block.getAttribute('disabled') === 'true'
    )
      throw new Error(
        'Conecta una condición válida, con un máximo de 16 niveles.',
      );
    visited.add(container);
    visited.add(block);
    const sourceBlockId = block.getAttribute('id') ?? '';
    const type = block.getAttribute('type');
    if (type === 'botlab_web_obstacle')
      return { sourceBlockId, thresholdMeters: number(block, 'CM') / 100 };
    if (type === 'operator_not')
      return {
        sourceBlockId,
        operator: 'not',
        operand: condition(block, 'OPERAND', depth + 1),
      };
    if (type === 'operator_and' || type === 'operator_or')
      return {
        sourceBlockId,
        operator: type === 'operator_and' ? 'and' : 'or',
        left: condition(block, 'OPERAND1', depth + 1),
        right: condition(block, 'OPERAND2', depth + 1),
      };
    throw new Error('Conecta una condición de obstáculo delante.');
  }
  let nodes = 0;
  function sequence(
    first: Element | undefined,
    depth = 0,
  ): WalkingProgramStep[] {
    if (depth > walkingProgramLimits.depth)
      throw new Error('Usa como máximo 16 niveles de repetición.');
    const steps: WalkingProgramStep[] = [];
    for (let current = first; current; current = link(current, 'next')) {
      visited.add(current);
      const type = current.getAttribute('type') ?? '';
      if (
        ++nodes > walkingProgramLimits.sourceSteps ||
        !allowedTypes.includes(type) ||
        type === 'event_whenflagclicked' ||
        current.getAttribute('disabled') === 'true'
      )
        throw new Error(
          'Bloque de movimiento no compatible o más de 256 bloques.',
        );
      const sourceBlockId = current.getAttribute('id') ?? '';
      if (
        type === 'botlab_microduck_sit' ||
        type === 'botlab_microduck_stand'
      ) {
        steps.push({
          sourceBlockId,
          kind: 'posture',
          posture: type.endsWith('_sit') ? 'sit' : 'stand',
        });
      } else if (type === 'botlab_web_head_yaw') {
        const fields = children(current, 'field').filter(
          (f) => f.getAttribute('name') === 'DIRECTION',
        );
        const direction = fields[0]?.textContent;
        if (
          fields.length !== 1 ||
          !['left', 'centre', 'right'].includes(direction ?? '')
        )
          throw new Error('Orientación de cabeza no válida.');
        steps.push({
          sourceBlockId,
          kind: 'head-yaw',
          angleRadians:
            direction === 'left' ? 0.3 : direction === 'right' ? -0.3 : 0,
        });
      } else if (type === 'botlab_web_wait_until') {
        steps.push({
          sourceBlockId,
          kind: 'wait-until',
          condition: condition(current),
          timeoutSeconds: number(current, 'SECONDS'),
        });
      } else if (
        ['control_repeat_until', 'control_if', 'control_if_else'].includes(type)
      ) {
        steps.push({
          sourceBlockId,
          kind: type === 'control_repeat_until' ? 'until' : 'if',
          condition: condition(current),
          body: sequence(link(current, 'statement', 'SUBSTACK'), depth + 1),
          ...(type === 'control_if_else'
            ? {
                otherwise: sequence(
                  link(current, 'statement', 'SUBSTACK2'),
                  depth + 1,
                ),
              }
            : {}),
        });
      } else if (
        type === 'botlab_web_obstacle' ||
        type.startsWith('operator_')
      ) {
        throw new Error(
          'La condición debe estar conectada a un bloque de control.',
        );
      } else if (type === 'botlab_web_advance_cm') {
        steps.push({
          sourceBlockId,
          kind: 'distance',
          distanceMeters: number(current, 'CM') / 100,
        });
      } else if (type === 'control_repeat') {
        const count = literal(current, 'TIMES');
        if (
          !Number.isInteger(count) ||
          count < 0 ||
          count > walkingProgramLimits.count
        )
          throw new Error('Repetir necesita un número entero de 0 a 100.');
        steps.push({
          sourceBlockId,
          kind: 'repeat',
          count,
          body: sequence(link(current, 'statement', 'SUBSTACK'), depth + 1),
        });
      } else if (type === 'botlab_web_velocity') {
        steps.push({
          sourceBlockId,
          forward: number(current, 'FORWARD'),
          yaw: number(current, 'YAW'),
          durationSeconds: number(current, 'SECONDS'),
        });
      } else if (type === 'control_wait') {
        steps.push({
          sourceBlockId,
          kind: 'wait',
          durationSeconds: literal(current, 'DURATION'),
        });
      } else if (
        type === 'botlab_microduck_walk_steps' ||
        type === 'botlab_microduck_walk_distance'
      ) {
        const isSteps = type.endsWith('_steps');
        const value = number(current, isSteps ? 'STEPS' : 'DISTANCE');
        if (isSteps && !Number.isInteger(value))
          throw new Error('Usa un número entero de pasos.');
        steps.push({
          sourceBlockId,
          kind: 'distance',
          distanceMeters: isSteps ? value * 0.5 : value,
        });
      } else {
        steps.push({
          sourceBlockId,
          kind: 'turn',
          angleRadians:
            type === 'botlab_microduck_turn_right' ? -Math.PI / 2 : Math.PI / 2,
        });
      }
    }
    return steps;
  }
  const steps = sequence(link(roots[0], 'next'));
  if (
    Array.from(doc.querySelectorAll('block,shadow,value,next,statement')).some(
      (e) => !visited.has(e),
    )
  )
    throw new Error('Hay bloques desconectados o entradas no compatibles.');
  return steps;
}
