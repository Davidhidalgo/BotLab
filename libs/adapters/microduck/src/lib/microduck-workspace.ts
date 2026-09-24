import { BotLabError, type RobotProgramSource } from '@botlab/model';
import type { MicroDuckProgramStep } from './microduck-steps';

const motionFieldCodes: Record<string, string> = {
  STEPS: 'program.invalid-steps',
  ANGLE: 'program.invalid-angle',
  DISTANCE: 'program.invalid-distance',
};

function directXmlChild(element: Element, tag: string, name?: string) {
  return Array.from(element.children).find(
    (child) =>
      child.localName === tag &&
      (name === undefined || child.getAttribute('name') === name),
  );
}

/** Reads the green-flag script of a Scratch XML workspace into typed MicroDuck steps. */
export function readMicroDuckProgramFromWorkspace(
  artifact: Pick<RobotProgramSource, 'format' | 'content'>,
): MicroDuckProgramStep[] {
  if (artifact.format !== 'scratch-xml') {
    throw new BotLabError(
      'program.unsupported-format',
      'Only Scratch XML can be compiled in this demo.',
    );
  }

  const xmlDocument = new DOMParser().parseFromString(
    artifact.content,
    'text/xml',
  );
  const parserError = xmlDocument.querySelector('parsererror');

  if (parserError) {
    throw new BotLabError(
      'program.unreadable-xml',
      'The Scratch XML workspace cannot be read.',
    );
  }

  const root = xmlDocument.documentElement;

  if (root.nodeName.toLowerCase() !== 'xml') {
    throw new BotLabError(
      'program.invalid-xml',
      'The workspace does not contain valid Scratch XML.',
    );
  }

  const starts = Array.from(root.children).filter(
    (child) =>
      child.localName === 'block' &&
      child.getAttribute('type') === 'event_whenflagclicked' &&
      child.getAttribute('disabled') !== 'true',
  );
  const startBlock = starts[0];

  if (!startBlock) {
    throw new BotLabError(
      'program.missing-start',
      'Add a green flag start block before compiling.',
    );
  }

  if (starts.length !== 1) {
    throw new BotLabError(
      'program.single-script',
      'Use one green flag script. Parallel scripts are not supported yet.',
    );
  }
  let count = 0;
  function readSequence(
    container: Element | undefined,
    depth = 0,
  ): MicroDuckProgramStep[] {
    if (depth > 16)
      throw new BotLabError(
        'program.too-deep',
        'Programs support at most 16 nested control blocks.',
        { max: 16 },
      );
    const steps: MicroDuckProgramStep[] = [];
    let next = container;
    while (next) {
      const block = directXmlChild(next, 'block');
      if (!block) break;
      next = directXmlChild(block, 'next');
      if (block.getAttribute('disabled') === 'true') continue;
      if (++count > 256)
        throw new BotLabError(
          'program.too-large',
          'Programs support at most 256 blocks.',
          { max: 256 },
        );
      const type = block.getAttribute('type');
      switch (type) {
        case 'control_repeat': {
          const input = directXmlChild(block, 'value', 'TIMES');
          const value =
            input &&
            (directXmlChild(input, 'block') ?? directXmlChild(input, 'shadow'));
          const text =
            value && directXmlChild(value, 'field', 'NUM')?.textContent?.trim();
          const repeats = text ? Number(text) : NaN;
          if (
            !value ||
            value.getAttribute('disabled') === 'true' ||
            ![
              'math_number',
              'math_positive_number',
              'math_whole_number',
              'math_integer',
            ].includes(value.getAttribute('type') ?? '') ||
            !Number.isInteger(repeats) ||
            repeats < 0 ||
            repeats > 100
          ) {
            throw new BotLabError(
              'program.invalid-repeat',
              'Repeat requires a whole number from 0 to 100. Expressions are not supported yet.',
            );
          }
          steps.push({
            type: 'repeat',
            count: repeats,
            sourceBlockId: block.getAttribute('id') ?? undefined,
            body: readSequence(
              directXmlChild(block, 'statement', 'SUBSTACK'),
              depth + 1,
            ),
          });
          break;
        }
        case 'control_if':
        case 'control_if_else': {
          const input = directXmlChild(block, 'value', 'CONDITION');
          const predicate = input && directXmlChild(input, 'block');
          const predicateType = predicate?.getAttribute('type');
          const posture = predicateType?.replace('botlab_microduck_is_', '');
          if (
            !predicate ||
            predicate.getAttribute('disabled') === 'true' ||
            !['sit', 'stand', 'transitioning'].includes(posture ?? '') ||
            predicateType !== `botlab_microduck_is_${posture}`
          ) {
            throw new BotLabError(
              'program.missing-condition',
              'If requires a connected posture condition.',
            );
          }
          steps.push({
            type: 'if',
            sourceBlockId: block.getAttribute('id') ?? undefined,
            condition: {
              type: 'posture',
              posture: posture as 'sit' | 'stand' | 'transitioning',
              sourceBlockId: predicate.getAttribute('id') ?? undefined,
            },
            then: readSequence(
              directXmlChild(block, 'statement', 'SUBSTACK'),
              depth + 1,
            ),
            else:
              type === 'control_if_else'
                ? readSequence(
                    directXmlChild(block, 'statement', 'SUBSTACK2'),
                    depth + 1,
                  )
                : [],
          });
          break;
        }
        case 'botlab_microduck_sit':
        case 'botlab_microduck_stand':
          steps.push({
            type: 'posture',
            posture: type === 'botlab_microduck_sit' ? 'sit' : 'stand',
            sourceBlockId: block.getAttribute('id') ?? undefined,
          });
          break;
        case 'botlab_microduck_set_leds':
          steps.push({
            type: 'leds',
            sourceBlockId: block.getAttribute('id') ?? undefined,
            pattern: normalizeMicroDuckLedPattern(
              directXmlChild(block, 'field', 'PATTERN')?.textContent,
            ),
          });
          break;
        case 'botlab_microduck_walk_distance':
        case 'botlab_microduck_back_distance':
          steps.push({
            type: 'walk',
            backward: type === 'botlab_microduck_back_distance',
            sourceBlockId: block.getAttribute('id') ?? undefined,
            distanceMeters:
              type === 'botlab_microduck_back_distance'
                ? readMotionNumber(block, 'DISTANCE', 1, 0, 20)
                : normalizeMicroDuckWalkDistance(
                    directXmlChild(block, 'field', 'DISTANCE')?.textContent,
                  ),
          });
          break;
        case 'botlab_microduck_walk_steps':
        case 'botlab_microduck_back_steps': {
          const count = readMotionNumber(block, 'STEPS', 1, 0, 40);
          if (!Number.isInteger(count))
            throw new BotLabError(
              'program.invalid-steps',
              'Steps must be a whole number.',
            );
          steps.push({
            type: 'walk',
            backward: type === 'botlab_microduck_back_steps',
            distanceMeters: count * 0.5,
            sourceBlockId: block.getAttribute('id') ?? undefined,
          });
          break;
        }
        case 'botlab_microduck_turn_left':
        case 'botlab_microduck_turn_right':
        case 'botlab_microduck_turn_around':
        case 'botlab_microduck_turn_degrees':
          steps.push({
            type: 'turn',
            sourceBlockId: block.getAttribute('id') ?? undefined,
            angleDegrees:
              type === 'botlab_microduck_turn_left'
                ? -90
                : type === 'botlab_microduck_turn_right'
                  ? 90
                  : type === 'botlab_microduck_turn_around'
                    ? 180
                    : readMotionNumber(block, 'ANGLE', 90, -360, 360),
          });
          break;
        case 'control_wait': {
          const input = directXmlChild(block, 'value', 'DURATION');
          const value =
            input &&
            (directXmlChild(input, 'block') ?? directXmlChild(input, 'shadow'));
          if (
            !value ||
            ![
              'math_number',
              'math_positive_number',
              'math_whole_number',
              'math_integer',
            ].includes(value.getAttribute('type') ?? '')
          ) {
            throw new BotLabError(
              'program.numeric-wait',
              'Wait requires a numeric duration. Expressions are not supported yet.',
            );
          }
          const text = directXmlChild(
            value,
            'field',
            'NUM',
          )?.textContent?.trim();
          const seconds = text ? Number(text) : NaN;
          if (
            !Number.isFinite(seconds) ||
            seconds < 0 ||
            !Number.isFinite(seconds * 1000)
          ) {
            throw new BotLabError(
              'program.invalid-wait',
              'Wait duration must be a finite, non-negative number of seconds.',
            );
          }
          steps.push({
            type: 'wait',
            seconds,
            sourceBlockId: block.getAttribute('id') ?? undefined,
          });
          break;
        }
        default:
          throw new BotLabError(
            'program.unsupported-block',
            `Unsupported connected block: ${type ?? 'unknown'}.`,
            { block: type ?? 'unknown' },
          );
      }
    }
    return steps;
  }
  const steps = readSequence(directXmlChild(startBlock, 'next'));
  if (steps.length === 0)
    throw new BotLabError(
      'program.empty-script',
      'Connect at least one block to the green flag.',
    );
  return steps;
}

function normalizeMicroDuckLedPattern(value: string | null | undefined) {
  const pattern = value?.trim() || 'smile';

  if (pattern === 'all') {
    return 'solid';
  }

  if (pattern === 'left' || pattern === 'right') {
    return 'blink';
  }

  if (['smile', 'blink', 'solid', 'off'].includes(pattern)) {
    return pattern;
  }

  throw new BotLabError(
    'program.unsupported-led-pattern',
    `Unsupported LED pattern: ${pattern}.`,
    { pattern },
  );
}

function normalizeMicroDuckWalkDistance(value: string | null | undefined) {
  const distance = value == null ? 5 : Number(value.trim() || NaN);

  if (!Number.isFinite(distance) || distance < 0 || distance > 20) {
    throw new BotLabError(
      'program.invalid-distance',
      `Unsupported walk distance: ${value ?? ''}.`,
    );
  }

  return distance;
}

function readMotionNumber(
  block: Element,
  name: string,
  fallback: number,
  min: number,
  max: number,
) {
  const text = directXmlChild(block, 'field', name)?.textContent;
  const value = text == null ? fallback : Number(text.trim() || NaN);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new BotLabError(
      motionFieldCodes[name] ?? 'program.invalid-number',
      `Invalid motion ${name}: expected a number from ${min} to ${max}.`,
      { field: name, min, max },
    );
  }
  return value;
}
