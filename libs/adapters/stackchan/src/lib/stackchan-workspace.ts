import type {
  RobotProgramSource,
  StackChanLedSide,
  StackChanProgramStep,
} from '@botlab/model';

const child = (element: Element, tag: string, name?: string) =>
  Array.from(element.children).find(
    (item) =>
      item.localName === tag &&
      (name === undefined || item.getAttribute('name') === name),
  );
const field = (block: Element, name: string) =>
  child(block, 'field', name)?.textContent?.trim() ?? '';

/** Reads the green-flag script of a Scratch XML workspace into expanded StackChan steps. */
export function readStackChanProgramFromWorkspace(
  artifact: Pick<RobotProgramSource, 'format' | 'content'>,
): StackChanProgramStep[] {
  const document = new DOMParser().parseFromString(
    artifact.content,
    'text/xml',
  );
  if (
    artifact.format !== 'scratch-xml' ||
    document.querySelector('parsererror') ||
    document.doctype ||
    document.documentElement.localName !== 'xml'
  )
    throw new Error('Invalid Scratch XML');
  const allowed = [
    'event_whenflagclicked',
    'control_wait',
    'control_repeat',
    'botlab_stackchan_yaw',
    'botlab_stackchan_center',
    'botlab_stackchan_leds',
    'botlab_stackchan_leds_off',
  ];
  for (const block of Array.from(document.querySelectorAll('block'))) {
    if (!allowed.includes(block.getAttribute('type') ?? ''))
      throw new Error('Project contains blocks incompatible with StackChan');
  }
  const starts = Array.from(document.documentElement.children).filter(
    (block) =>
      block.localName === 'block' &&
      block.getAttribute('type') === 'event_whenflagclicked' &&
      block.getAttribute('disabled') !== 'true',
  );
  if (starts.length !== 1) throw new Error('Use exactly one green flag script');
  let visited = 0;
  function numberInput(block: Element, name: string) {
    const value = child(block, 'value', name);
    const literal = value && child(value, 'shadow');
    if (
      !literal ||
      ![
        'math_number',
        'math_positive_number',
        'math_whole_number',
        'math_integer',
      ].includes(literal.getAttribute('type') ?? '') ||
      (value && child(value, 'block'))
    )
      throw new Error('Only literal numbers are supported');
    const text = field(literal, 'NUM');
    if (!text || !Number.isFinite(Number(text)))
      throw new Error('Invalid number');
    return Number(text);
  }
  function sequence(
    container: Element | undefined,
    depth: number,
  ): StackChanProgramStep[] {
    if (depth > 4) throw new Error('Maximum four nested repeats');
    const steps: StackChanProgramStep[] = [];
    let current = container && child(container, 'block');
    while (current) {
      if (++visited > 80) throw new Error('Program too large');
      const sourceBlockId = current.getAttribute('id');
      if (!sourceBlockId) throw new Error('Missing block ID');
      if (current.getAttribute('disabled') !== 'true') {
        switch (current.getAttribute('type')) {
          case 'botlab_stackchan_yaw': {
            const degrees = field(current, 'ANGLE');
            if (!degrees) throw new Error('Missing angle');
            steps.push({
              type: 'yaw',
              degrees: Number(degrees),
              sourceBlockId,
            });
            break;
          }
          case 'botlab_stackchan_center':
            steps.push({ type: 'yaw', degrees: 0, sourceBlockId });
            break;
          case 'botlab_stackchan_leds': {
            const brightness = field(current, 'BRIGHTNESS');
            if (!brightness) throw new Error('Missing brightness');
            steps.push({
              type: 'led',
              side: field(current, 'SIDE') as StackChanLedSide,
              color: field(current, 'COLOR'),
              brightness: Number(brightness),
              sourceBlockId,
            });
            break;
          }
          case 'botlab_stackchan_leds_off':
            steps.push({
              type: 'led',
              side: 'both',
              color: '#000000',
              brightness: 0,
              sourceBlockId,
            });
            break;
          case 'control_wait':
            steps.push({
              type: 'wait',
              seconds: numberInput(current, 'DURATION'),
              sourceBlockId,
            });
            break;
          case 'control_repeat': {
            const count = numberInput(current, 'TIMES');
            if (!Number.isInteger(count) || count < 0 || count > 10)
              throw new Error('Repeat count must be 0–10');
            const body = sequence(
              child(current, 'statement', 'SUBSTACK'),
              depth + 1,
            );
            for (let i = 0; i < count; i++) steps.push(...body);
            break;
          }
          default:
            throw new Error('Unsupported script block');
        }
      }
      if (steps.length > 40) throw new Error('Maximum 40 expanded commands');
      const next = child(current, 'next');
      current = next && child(next, 'block');
    }
    return steps;
  }
  return sequence(child(starts[0], 'next'), 0);
}
