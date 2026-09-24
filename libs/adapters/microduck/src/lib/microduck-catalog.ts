import type { Behavior, Policy, RobotCatalog, Skill } from '@botlab/model';
import { microDuckRequiredPolicyIds } from './microduck-program';

export const microDuckLedSkill: Skill = {
  id: 'set-microduck-leds',
  name: 'Set MicroDuck LEDs',
  description: 'Render a named LED pattern on a MicroDuck target.',
  capabilityIds: ['microduck-leds'],
  policyIds: [...microDuckRequiredPolicyIds],
  requiredCapabilities: ['light'],
  inputs: [
    {
      id: 'pattern',
      name: 'Pattern',
      type: 'enum',
      required: true,
      description: 'Named LED pattern to render.',
    },
    {
      id: 'brightness',
      name: 'Brightness',
      type: 'number',
      required: true,
      description: 'Output brightness from 0 to 100.',
    },
  ],
  outputs: [],
  generatedBlock: {
    blockType: 'microduck_set_leds',
    label: 'set MicroDuck LEDs',
    category: 'MicroDuck',
    color: '#1d4ed8',
  },
};

/** Visible light on the physical robot needs operator confirmation; the simulator does not. */
export const microDuckVisibleOutputPolicy: Policy = {
  id: 'confirm-visible-output',
  name: 'Confirm visible robot output',
  rules: [
    {
      id: 'confirm-led-output',
      category: 'user-confirmation',
      effect: 'require-confirmation',
      description:
        'Ask before sending visible light commands to a physical robot.',
      capabilityIds: ['microduck-leds'],
      targetIds: ['microduck-usb'],
    },
  ],
};

export const microDuckLedDemoBehavior: Behavior = {
  id: 'microduck-led-demo',
  name: 'MicroDuck LED Demo',
  description: 'Set a simple LED pattern when the robot starts.',
  skillIds: ['set-microduck-leds'],
  schedulerId: 'manual',
  arbitrationId: 'exclusive-led-lock',
  artifactIds: [
    'artifact-microduck-leds-blocks',
    'artifact-microduck-leds-plan',
  ],
  graph: {
    entryNodeId: 'on-start',
    nodes: [
      { id: 'on-start', kind: 'event', label: 'When robot starts' },
      {
        id: 'set-leds',
        kind: 'skill',
        label: 'Set LEDs',
        skillId: 'set-microduck-leds',
        commandId: 'set-led-pattern',
        inputs: { pattern: 'smile', brightness: 50 },
      },
    ],
    edges: [
      {
        id: 'edge-start-to-leds',
        fromNodeId: 'on-start',
        toNodeId: 'set-leds',
      },
    ],
  },
  ast: {
    version: 1,
    steps: [
      { id: 'step-on-start', nodeId: 'on-start', action: 'trigger' },
      {
        id: 'step-set-leds',
        nodeId: 'set-leds',
        action: 'dispatch-skill',
        skillId: 'set-microduck-leds',
        commandId: 'set-led-pattern',
        inputs: { pattern: 'smile', brightness: 50 },
      },
    ],
  },
};

/** MicroDuck skills, policies and demo behavior contributed to host runtimes. */
export const microDuckCatalog: RobotCatalog = {
  skills: [microDuckLedSkill],
  policies: [microDuckVisibleOutputPolicy],
  behaviors: [microDuckLedDemoBehavior],
};
