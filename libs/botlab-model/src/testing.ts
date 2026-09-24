/**
 * Shared test fixtures for BotLab specs. Import from `@botlab/model/testing`
 * in `*.spec.ts` files only; production code gets robot data from robot
 * modules (`RobotModule.catalog`).
 */
import type {
  ArbitrationStrategy,
  Behavior,
  BehaviorArtifact,
  CompiledBehaviorArtifact,
  Policy,
  SchedulerProfile,
  Skill,
} from './lib/botlab-model';

export const sampleSchedulers: SchedulerProfile[] = [
  {
    id: 'manual',
    name: 'Manual start',
    mode: 'manual',
  },
];

export const sampleArbitrationStrategies: ArbitrationStrategy[] = [
  {
    id: 'exclusive-led-lock',
    name: 'Exclusive capability lock',
    strategy: 'exclusive-lock',
  },
];

export const samplePolicies: Policy[] = [
  {
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
      },
    ],
  },
  {
    id: 'planned-targets-disabled',
    name: 'Deny planned targets',
    rules: [
      {
        id: 'deny-planned-target',
        category: 'target',
        effect: 'deny',
        description:
          'Do not execute behavior plans against targets that are not implemented.',
        targetIds: ['stackchan-planned'],
      },
    ],
  },
];

export const sampleSkills: Skill[] = [
  {
    id: 'set-microduck-leds',
    name: 'Set MicroDuck LEDs',
    description: 'Render a named LED pattern on a MicroDuck target.',
    capabilityIds: ['microduck-leds'],
    policyIds: ['confirm-visible-output'],
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
  },
  {
    id: 'set-stackchan-expression',
    name: 'Set StackChan Expression',
    description: 'Display a facial expression on a future StackChan target.',
    capabilityIds: ['stackchan-expression'],
    policyIds: ['planned-targets-disabled'],
    requiredCapabilities: ['expression'],
    inputs: [
      {
        id: 'expression',
        name: 'Expression',
        type: 'enum',
        required: true,
        description: 'Expression preset to display.',
      },
    ],
    outputs: [],
    generatedBlock: {
      blockType: 'stackchan_set_expression',
      label: 'set StackChan expression',
      category: 'StackChan',
      color: '#047857',
    },
  },
];

export const sampleMicroDuckLedBehaviorArtifact: BehaviorArtifact = {
  id: 'artifact-microduck-leds-blocks',
  kind: 'blocks',
  label: 'MicroDuck LED blocks',
  createdAt: '2026-09-10T00:00:00.000Z',
  format: 'botlab-json',
  behaviorId: 'microduck-led-demo',
  content: '{"blocks":[{"type":"microduck_set_leds"}]}',
};

export const sampleMicroDuckCompiledBehaviorArtifact: CompiledBehaviorArtifact =
  {
    id: 'artifact-microduck-leds-plan',
    kind: 'compiled-plan',
    label: 'MicroDuck LED compiled plan',
    createdAt: '2026-09-10T00:00:00.000Z',
    behaviorId: 'microduck-led-demo',
    targetId: 'microduck-usb',
    requiredPolicyIds: ['confirm-visible-output'],
    commands: [
      {
        id: 'command-microduck-leds-smile',
        capabilityId: 'microduck-leds',
        commandId: 'set-led-pattern',
        targetId: 'microduck-usb',
        inputs: {
          pattern: 'smile',
          brightness: 50,
        },
      },
    ],
  };

export const sampleMicroDuckLedBehavior: Behavior = {
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
      {
        id: 'on-start',
        kind: 'event',
        label: 'When robot starts',
      },
      {
        id: 'set-leds',
        kind: 'skill',
        label: 'Set LEDs',
        skillId: 'set-microduck-leds',
        commandId: 'set-led-pattern',
        inputs: {
          pattern: 'smile',
          brightness: 50,
        },
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
      {
        id: 'step-on-start',
        nodeId: 'on-start',
        action: 'trigger',
      },
      {
        id: 'step-set-leds',
        nodeId: 'set-leds',
        action: 'dispatch-skill',
        skillId: 'set-microduck-leds',
        commandId: 'set-led-pattern',
        inputs: {
          pattern: 'smile',
          brightness: 50,
        },
      },
    ],
  },
};

export const sampleStackChanExpressionBehavior: Behavior = {
  id: 'stackchan-expression-demo',
  name: 'StackChan Expression Demo',
  description: 'Future behavior that sets a StackChan face expression.',
  skillIds: ['set-stackchan-expression'],
  schedulerId: 'manual',
  arbitrationId: 'exclusive-led-lock',
  artifactIds: [],
  graph: {
    entryNodeId: 'on-start',
    nodes: [
      {
        id: 'on-start',
        kind: 'event',
        label: 'When robot starts',
      },
      {
        id: 'set-expression',
        kind: 'skill',
        label: 'Set expression',
        skillId: 'set-stackchan-expression',
        commandId: 'set-expression',
        inputs: {
          expression: 'happy',
        },
      },
    ],
    edges: [
      {
        id: 'edge-start-to-expression',
        fromNodeId: 'on-start',
        toNodeId: 'set-expression',
      },
    ],
  },
  ast: {
    version: 1,
    steps: [
      {
        id: 'step-on-start',
        nodeId: 'on-start',
        action: 'trigger',
      },
      {
        id: 'step-set-expression',
        nodeId: 'set-expression',
        action: 'dispatch-skill',
        skillId: 'set-stackchan-expression',
        commandId: 'set-expression',
        inputs: {
          expression: 'happy',
        },
      },
    ],
  },
};
