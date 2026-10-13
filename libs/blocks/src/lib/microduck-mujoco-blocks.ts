import type * as ScratchBlocks from 'scratch-blocks';
import {
  walkingProgramLimits,
  validateNumericExpression,
  validateVariableName,
  type NumericExpression,
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
      'detener movimiento',
      'distancia frontal (cm)',
      'valor de %1',
      'fijar %1 a %2',
      'cambiar %1 por %2',
      'Variables',
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
      'aturar moviment',
      'distància frontal (cm)',
      'valor de %1',
      'fixa %1 a %2',
      'canvia %1 per %2',
      'Variables',
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
      'stop movement',
      'front distance (cm)',
      'value of %1',
      'set %1 to %2',
      'change %1 by %2',
      'Variables',
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
    'REST',
    'DISTANCE_VALUE',
    'NUMBER',
    'SET_NUMBER',
    'CHANGE_NUMBER',
    'VARIABLES',
  ].entries())
    api.Msg[`BOTLAB_WEB_${key}`] = copy[i];
}
export function registerMicroduckMujocoBlocks(api: typeof ScratchBlocks) {
  if (api.Blocks['botlab_web_velocity']) return;
  api.defineBlocksWithJsonArray([
    {
      type: 'botlab_web_distance_cm',
      message0: '%{BKY_BOTLAB_WEB_DISTANCE_VALUE}',
      style: 'sensing',
      extensions: ['output_number'],
    },
    {
      type: 'botlab_web_number',
      message0: '%{BKY_BOTLAB_WEB_NUMBER}',
      args0: [{ type: 'field_input', name: 'NAME', text: 'contador' }],
      style: 'data',
      extensions: ['output_number'],
    },
    ...['set', 'change'].map((operation) => ({
      type: `botlab_web_${operation}_number`,
      message0: `%{BKY_BOTLAB_WEB_${operation.toUpperCase()}_NUMBER}`,
      args0: [
        { type: 'field_input', name: 'NAME', text: 'contador' },
        { type: 'input_value', name: 'VALUE', check: 'Number' },
      ],
      style: 'data',
      extensions: ['shape_statement'],
    })),
    {
      type: 'botlab_web_advance_value',
      message0: '%{BKY_BOTLAB_WEB_CENTIMETRES}',
      args0: [{ type: 'input_value', name: 'CM', check: 'Number' }],
      style: 'motion',
      extensions: ['shape_statement'],
    },
    {
      type: 'botlab_web_rest',
      message0: '%{BKY_BOTLAB_WEB_REST}',
      style: 'motion',
      extensions: ['shape_statement'],
    },
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
  'botlab_web_rest',
  'botlab_web_obstacle',
  'botlab_web_distance_cm',
  'botlab_web_number',
  'botlab_web_set_number',
  'botlab_web_change_number',
  'botlab_web_advance_value',
  'operator_lt',
  'operator_gt',
  'operator_equals',
  'operator_add',
  'operator_subtract',
  'operator_multiply',
  'operator_divide',
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
  'botlab_microduck_is_sit',
  'botlab_microduck_is_stand',
  'botlab_microduck_is_transitioning',
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

/** Bounded sequences, numeric expressions and explicit per-run variables. */
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
  const variableName = (e: Element) => {
    const fields = children(e, 'field').filter(
      (f) => f.getAttribute('name') === 'NAME',
    );
    const name = fields[0]?.textContent;
    if (fields.length !== 1) throw new Error('Nombre de variable no válido.');
    validateVariableName(name);
    return name;
  };
  function expression(e: Element, name: string, depth = 0): NumericExpression {
    if (depth > 16) throw new Error('Expresión demasiado profunda.');
    const values = children(e, 'value').filter(
      (v) => v.getAttribute('name') === name,
    );
    const container = values[0];
    if (values.length !== 1) throw new Error('Conecta un valor numérico.');
    const blocks = children(container, 'block'),
      shadows = children(container, 'shadow');
    if (
      blocks.length > 1 ||
      shadows.length > 1 ||
      container.children.length !== blocks.length + shadows.length
    )
      throw new Error('Entrada numérica no válida.');
    const block = blocks[0] ?? shadows[0];
    if (!block || block.getAttribute('disabled') === 'true')
      throw new Error('Conecta un valor numérico activo.');
    visited.add(container);
    visited.add(block);
    if (blocks.length && shadows.length) {
      const shadow = shadows[0];
      if (
        ![
          'math_number',
          'math_positive_number',
          'math_whole_number',
          'math_integer',
          'text',
        ].includes(shadow.getAttribute('type') ?? '') ||
        Array.from(shadow.children).some((c) => c.localName !== 'field')
      )
        throw new Error('Valor alternativo no válido.');
      visited.add(shadow);
    }
    const type = block.getAttribute('type') ?? '';
    let result: NumericExpression;
    if (
      [
        'math_number',
        'math_positive_number',
        'math_whole_number',
        'math_integer',
        'text',
      ].includes(type)
    )
      result = {
        kind: 'literal',
        value: number(block, type === 'text' ? 'TEXT' : 'NUM'),
      };
    else {
      if (!allowedTypes.includes(type))
        throw new Error('Expresión no compatible con este robot.');
      if (type === 'botlab_web_number')
        result = { kind: 'variable', name: variableName(block) };
      else if (type === 'botlab_web_distance_cm')
        result = { kind: 'distance-cm' };
      else if (
        [
          'operator_add',
          'operator_subtract',
          'operator_multiply',
          'operator_divide',
        ].includes(type)
      )
        result = {
          kind: type.slice(9) as 'add' | 'subtract' | 'multiply' | 'divide',
          left: expression(block, 'NUM1', depth + 1),
          right: expression(block, 'NUM2', depth + 1),
        };
      else throw new Error('Conecta una expresión numérica.');
    }
    validateNumericExpression(result);
    return result;
  }
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
    if (!allowedTypes.includes(type ?? ''))
      throw new Error('La condición no es compatible con este robot.');
    if (type?.startsWith('botlab_microduck_is_'))
      return {
        sourceBlockId,
        posture: type.slice('botlab_microduck_is_'.length) as
          | 'sit'
          | 'stand'
          | 'transitioning',
      };
    if (type === 'botlab_web_obstacle')
      return { sourceBlockId, thresholdMeters: number(block, 'CM') / 100 };
    if (['operator_lt', 'operator_gt', 'operator_equals'].includes(type ?? ''))
      return {
        sourceBlockId,
        comparison:
          type === 'operator_lt' ? 'lt' : type === 'operator_gt' ? 'gt' : 'eq',
        left: expression(block, 'OPERAND1'),
        right: expression(block, 'OPERAND2'),
      };
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
        type === 'botlab_web_set_number' ||
        type === 'botlab_web_change_number'
      ) {
        steps.push({
          sourceBlockId,
          kind:
            type === 'botlab_web_set_number' ? 'set-number' : 'change-number',
          name: variableName(current),
          expression: expression(current, 'VALUE'),
        });
        continue;
      }
      if (type === 'botlab_web_advance_value') {
        steps.push({
          sourceBlockId,
          kind: 'distance-value',
          expression: expression(current, 'CM'),
        });
        continue;
      }
      if (type === 'botlab_web_rest') {
        steps.push({ sourceBlockId, kind: 'rest' });
        continue;
      }
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
        type === 'botlab_web_number' ||
        type === 'botlab_web_distance_cm' ||
        type.startsWith('botlab_microduck_is_') ||
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
        const value = expression(current, 'DURATION');
        steps.push(
          value.kind === 'literal'
            ? { sourceBlockId, kind: 'wait', durationSeconds: value.value }
            : { sourceBlockId, kind: 'wait-value', expression: value },
        );
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
