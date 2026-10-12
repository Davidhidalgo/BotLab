import type * as ScratchBlocks from 'scratch-blocks';
import type { JointPositionStep } from '@botlab/model';
import type { BlocksWorkspaceArtifact } from './blocks-contract';

export function registerJumperBlocks(api: typeof ScratchBlocks) {
  if (api.Blocks['botlab_joint_position']) return;
  api.Blocks['botlab_joint_position'] = {
    init(this: ScratchBlocks.Block) {
      this.jsonInit({
        message0: 'articulación %1 a %2 rad',
        args0: [
          { type: 'field_input', name: 'JOINT', text: 'LM_J0_joint' },
          { type: 'field_number', name: 'POSITION', value: 0.2, text: '0.2' },
        ],
        previousStatement: null,
        nextStatement: null,
        style: 'motion',
        tooltip:
          'Posición absoluta en radianes. Espera a que la articulación alcance el objetivo.',
      });
    },
  };
}

export const jumperJointBlockTypes = [
  'event_whenflagclicked',
  'botlab_joint_position',
];
export const jumperJointExample: BlocksWorkspaceArtifact = {
  id: 'jumper-joint-workspace',
  behaviorId: 'jumper-joint-program',
  kind: 'blocks',
  label: 'Control articular',
  format: 'scratch-xml',
  engine: 'scratch-blocks',
  status: 'loaded',
  validationErrors: [],
  createdAt: new Date(0).toISOString(),
  content:
    '<xml xmlns="https://developers.google.com/blockly/xml"><block type="event_whenflagclicked" id="jumper-start" x="35" y="35"><next><block type="botlab_joint_position" id="joint-out"><field name="JOINT">LM_J0_joint</field><field name="POSITION">0.2</field><next><block type="botlab_joint_position" id="joint-back"><field name="JOINT">LM_J0_joint</field><field name="POSITION">0.0012</field></block></next></block></next></block></xml>',
};

export function readJumperJointProgram(
  artifact: BlocksWorkspaceArtifact,
): JointPositionStep[] {
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
    throw new Error('XML de bloques no válido.');
  const roots = Array.from(document.documentElement.children).filter(
    (e) => e.localName === 'block',
  );
  if (
    roots.length !== 1 ||
    roots[0].getAttribute('type') !== 'event_whenflagclicked' ||
    roots[0].getAttribute('disabled') === 'true'
  )
    throw new Error('Usa una única secuencia conectada a la bandera verde.');
  const child = (element: Element, tag: string) =>
    Array.from(element.children).find((e) => e.localName === tag);
  const steps: JointPositionStep[] = [];
  let block: Element | undefined = roots[0];
  const seen = new Set<Element>([block]);
  while (block) {
    const next = child(block, 'next');
    block = next && child(next, 'block');
    if (!block) break;
    if (
      steps.length >= 100 ||
      block.getAttribute('type') !== 'botlab_joint_position' ||
      block.getAttribute('disabled') === 'true'
    )
      throw new Error(
        'El programa contiene bloques no compatibles o desactivados.',
      );
    seen.add(block);
    const field = (name: string) =>
      Array.from(block!.children)
        .find((e) => e.localName === 'field' && e.getAttribute('name') === name)
        ?.textContent?.trim();
    const position = field('POSITION');
    if (!position || !Number.isFinite(Number(position)))
      throw new Error('Posición no válida.');
    steps.push({
      sourceBlockId: block.getAttribute('id') ?? '',
      joint: field('JOINT') ?? '',
      positionRadians: Number(position),
    });
  }
  if (
    seen.size !== document.querySelectorAll('block').length ||
    document.querySelector('shadow, value, statement')
  )
    throw new Error('Todos los bloques deben pertenecer a la secuencia.');
  return steps;
}
