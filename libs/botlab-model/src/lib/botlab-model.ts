export type BotLabConcept =
  | 'policy'
  | 'skill'
  | 'behavior'
  | 'capability'
  | 'target'
  | 'artifact'
  | 'introspection'
  | 'scheduler'
  | 'arbitration';

export type CapabilityKind =
  | 'motion'
  | 'light'
  | 'sound'
  | 'vision'
  | 'sensor'
  | 'expression'
  | 'simulation';

export type CapabilityValueType =
  | 'boolean'
  | 'number'
  | 'string'
  | 'color'
  | 'enum'
  | 'object';

export interface CapabilityFieldSchema {
  name: string;
  type: CapabilityValueType;
  required: boolean;
  description?: string;
  enumValues?: string[];
  min?: number;
  max?: number;
}

export interface CapabilityCommandSchema {
  id: string;
  name: string;
  description: string;
  inputs: CapabilityFieldSchema[];
  confirmationRequired?: boolean;
}

export interface CapabilityTelemetrySchema {
  id: string;
  name: string;
  description: string;
  fields: CapabilityFieldSchema[];
}

export interface CapabilitySchema {
  commands: CapabilityCommandSchema[];
  telemetry: CapabilityTelemetrySchema[];
}

export interface Capability {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  targetIds: string[];
  schema?: CapabilitySchema;
}

export interface TargetProfile {
  hardware: {
    family: string;
    model?: string;
    revision?: string;
  };
  firmware?: {
    name: string;
    version?: string;
    minimumVersion?: string;
  };
  simulator?: {
    supported: boolean;
    integrationId?: string;
  };
  connection: {
    modes: Array<'usb' | 'bluetooth' | 'wifi' | 'serial' | 'simulator' | 'manual'>;
    defaultMode: 'usb' | 'bluetooth' | 'wifi' | 'serial' | 'simulator' | 'manual';
    discovery: 'automatic' | 'manual' | 'planned';
  };
}

export interface Target {
  id: string;
  name: string;
  kind: 'robot' | 'simulator';
  adapterId: string;
  status: 'available' | 'planned' | 'offline';
  profile?: TargetProfile;
}

export type PolicyRuleCategory =
  | 'safety'
  | 'resource'
  | 'target'
  | 'environment'
  | 'user-confirmation';

export type PolicyRuleEffect = 'allow' | 'deny' | 'warn' | 'require-confirmation';

export interface PolicyRule {
  id: string;
  category: PolicyRuleCategory;
  effect: PolicyRuleEffect;
  description: string;
  capabilityIds?: string[];
  targetIds?: string[];
}

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
}

export interface SkillPort {
  id: string;
  name: string;
  type: CapabilityValueType;
  required: boolean;
  description?: string;
}

export interface GeneratedBlockMetadata {
  blockType: string;
  label: string;
  category: string;
  color?: string;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  capabilityIds: string[];
  policyIds: string[];
  inputs: SkillPort[];
  outputs: SkillPort[];
  requiredCapabilities: CapabilityKind[];
  generatedBlock: GeneratedBlockMetadata;
}

export type BehaviorNodeKind = 'event' | 'skill' | 'control' | 'condition';

export interface BehaviorNode {
  id: string;
  kind: BehaviorNodeKind;
  label: string;
  skillId?: string;
  commandId?: string;
  inputs?: Record<string, unknown>;
}

export interface BehaviorEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  condition?: string;
}

export interface BehaviorGraph {
  nodes: BehaviorNode[];
  edges: BehaviorEdge[];
  entryNodeId: string;
}

export interface BehaviorAstStep {
  id: string;
  nodeId: string;
  action: 'trigger' | 'dispatch-skill' | 'wait' | 'branch';
  skillId?: string;
  commandId?: string;
  inputs?: Record<string, unknown>;
}

export interface BehaviorAst {
  version: 1;
  steps: BehaviorAstStep[];
}

export interface Behavior {
  id: string;
  name: string;
  description: string;
  skillIds: string[];
  schedulerId: string;
  arbitrationId: string;
  artifactIds: string[];
  graph: BehaviorGraph;
  ast: BehaviorAst;
}

export type ArtifactKind =
  | 'blocks'
  | 'compiled-plan'
  | 'trace'
  | 'log'
  | 'simulator-output';

export interface Artifact {
  id: string;
  kind: ArtifactKind;
  label: string;
  createdAt: string;
}

export interface BehaviorArtifact extends Artifact {
  kind: 'blocks';
  format: 'scratch-xml' | 'turbowarp-json' | 'botlab-json';
  behaviorId: string;
  content: string;
}

export interface CompiledCommand {
  id: string;
  sourceBlockId?: string;
  capabilityId: string;
  commandId: string;
  targetId: string;
  inputs: Record<string, unknown>;
}

export interface CompiledBehaviorArtifact extends Artifact {
  kind: 'compiled-plan';
  behaviorId: string;
  targetId: string;
  commands: CompiledCommand[];
  requiredPolicyIds: string[];
}

export interface SimulatorOutputArtifact extends Artifact {
  kind: 'simulator-output';
  simulatorId: string;
  sourceArtifactId: string;
  targetId: string;
  status: 'passed' | 'failed';
  commandCount: number;
  commands: CompiledCommand[];
  messages: string[];
  snapshot: {
    simulatorId: string;
    targetId?: string;
    state: string;
    commandCount: number;
    artifactId?: string;
    messages: string[];
  };
}

export interface IntrospectionSnapshot {
  targetId: string;
  health: 'nominal' | 'degraded' | 'unknown';
  messages: string[];
}

export interface SchedulerProfile {
  id: string;
  name: string;
  mode: 'manual' | 'event-driven' | 'timed';
}

export interface ArbitrationStrategy {
  id: string;
  name: string;
  strategy: 'priority' | 'exclusive-lock' | 'cooperative';
}

export interface BotLabAdapter {
  id: string;
  name: string;
  targets: Target[];
  capabilities: Capability[];
  status: 'available' | 'planned';
}

export interface SimulatorIntegration {
  id: string;
  name: string;
  status: 'available' | 'planned';
  dependencyStrategy: 'official-package' | 'external-process' | 'manual-bridge';
}

export interface BehaviorValidationContext {
  skills: Skill[];
  schedulers: SchedulerProfile[];
  arbitrationStrategies: ArbitrationStrategy[];
  artifacts?: Artifact[];
}

export interface PolicyValidationContext {
  capabilities: Capability[];
  targets: Target[];
}

export interface CompiledBehaviorValidationContext {
  behaviors: Behavior[];
  adapters: BotLabAdapter[];
  policies: Policy[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateBehaviorDefinition(
  behavior: Behavior,
  context: BehaviorValidationContext,
): ValidationResult {
  const errors: string[] = [];
  const skillIds = new Set(context.skills.map((skill) => skill.id));
  const schedulerIds = new Set(context.schedulers.map((scheduler) => scheduler.id));
  const arbitrationIds = new Set(
    context.arbitrationStrategies.map((strategy) => strategy.id),
  );
  const artifactIds = new Set((context.artifacts ?? []).map((artifact) => artifact.id));
  const nodeIds = new Set(behavior.graph.nodes.map((node) => node.id));
  const duplicatedNodeIds = findDuplicateIds(behavior.graph.nodes);
  const duplicatedStepIds = findDuplicateIds(behavior.ast.steps);

  if (!schedulerIds.has(behavior.schedulerId)) {
    errors.push(`Behavior ${behavior.id} references unknown scheduler ${behavior.schedulerId}.`);
  }

  if (!arbitrationIds.has(behavior.arbitrationId)) {
    errors.push(
      `Behavior ${behavior.id} references unknown arbitration strategy ${behavior.arbitrationId}.`,
    );
  }

  for (const skillId of behavior.skillIds) {
    if (!skillIds.has(skillId)) {
      errors.push(`Behavior ${behavior.id} references unknown skill ${skillId}.`);
    }
  }

  for (const node of behavior.graph.nodes) {
    if (node.kind === 'skill' && (!node.skillId || !skillIds.has(node.skillId))) {
      errors.push(`Behavior node ${node.id} references an unknown skill.`);
    }
  }

  for (const duplicatedNodeId of duplicatedNodeIds) {
    errors.push(`Behavior ${behavior.id} has duplicate graph node ${duplicatedNodeId}.`);
  }

  if (!nodeIds.has(behavior.graph.entryNodeId)) {
    errors.push(`Behavior ${behavior.id} has an entry node that is not in its graph.`);
  }

  for (const edge of behavior.graph.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      errors.push(`Behavior edge ${edge.id} references a missing graph node.`);
    }
  }

  for (const artifactId of behavior.artifactIds) {
    if (context.artifacts && !artifactIds.has(artifactId)) {
      errors.push(`Behavior ${behavior.id} references unknown artifact ${artifactId}.`);
    }
  }

  for (const duplicatedStepId of duplicatedStepIds) {
    errors.push(`Behavior ${behavior.id} has duplicate AST step ${duplicatedStepId}.`);
  }

  for (const step of behavior.ast.steps) {
    if (!nodeIds.has(step.nodeId)) {
      errors.push(`Behavior AST step ${step.id} references missing graph node ${step.nodeId}.`);
    }

    if (step.action === 'dispatch-skill' && (!step.skillId || !skillIds.has(step.skillId))) {
      errors.push(`Behavior AST step ${step.id} references an unknown skill.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateAdapterManifest(adapter: BotLabAdapter): ValidationResult {
  const errors: string[] = [];
  const targetIds = new Set(adapter.targets.map((target) => target.id));

  for (const target of adapter.targets) {
    if (target.adapterId !== adapter.id) {
      errors.push(`Target ${target.id} is registered to ${target.adapterId}, not ${adapter.id}.`);
    }
  }

  for (const capability of adapter.capabilities) {
    if (capability.targetIds.length === 0) {
      errors.push(`Capability ${capability.id} must target at least one robot or simulator.`);
    }

    for (const targetId of capability.targetIds) {
      if (!targetIds.has(targetId)) {
        errors.push(`Capability ${capability.id} references unknown target ${targetId}.`);
      }
    }

    if (capability.schema) {
      errors.push(...validateCapabilitySchema(capability).errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateCapabilitySchema(capability: Capability): ValidationResult {
  const errors: string[] = [];

  if (!capability.schema) {
    return {
      valid: true,
      errors,
    };
  }

  for (const commandId of findDuplicateIds(capability.schema.commands)) {
    errors.push(`Capability ${capability.id} has duplicate command ${commandId}.`);
  }

  for (const telemetryId of findDuplicateIds(capability.schema.telemetry)) {
    errors.push(`Capability ${capability.id} has duplicate telemetry ${telemetryId}.`);
  }

  for (const command of capability.schema.commands) {
    errors.push(
      ...validateFieldSchemas(
        command.inputs,
        `Capability ${capability.id} command ${command.id}`,
      ),
    );
  }

  for (const telemetry of capability.schema.telemetry) {
    errors.push(
      ...validateFieldSchemas(
        telemetry.fields,
        `Capability ${capability.id} telemetry ${telemetry.id}`,
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validatePolicy(
  policy: Policy,
  context: PolicyValidationContext,
): ValidationResult {
  const errors: string[] = [];
  const capabilityIds = new Set(context.capabilities.map((capability) => capability.id));
  const targetIds = new Set(context.targets.map((target) => target.id));

  for (const ruleId of findDuplicateIds(policy.rules)) {
    errors.push(`Policy ${policy.id} has duplicate rule ${ruleId}.`);
  }

  for (const rule of policy.rules) {
    if (rule.category === 'target' && !rule.targetIds?.length) {
      errors.push(`Policy rule ${rule.id} must name targetIds for target rules.`);
    }

    if (rule.category === 'user-confirmation' && rule.effect !== 'require-confirmation') {
      errors.push(
        `Policy rule ${rule.id} must require confirmation when category is user-confirmation.`,
      );
    }

    for (const capabilityId of rule.capabilityIds ?? []) {
      if (!capabilityIds.has(capabilityId)) {
        errors.push(`Policy rule ${rule.id} references unknown capability ${capabilityId}.`);
      }
    }

    for (const targetId of rule.targetIds ?? []) {
      if (!targetIds.has(targetId)) {
        errors.push(`Policy rule ${rule.id} references unknown target ${targetId}.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateCompiledBehaviorArtifact(
  artifact: CompiledBehaviorArtifact,
  context: CompiledBehaviorValidationContext,
): ValidationResult {
  const errors: string[] = [];
  const behaviorIds = new Set(context.behaviors.map((behavior) => behavior.id));
  const policyIds = new Set(context.policies.map((policy) => policy.id));
  const targets = context.adapters.flatMap((adapter) => adapter.targets);
  const capabilities = context.adapters.flatMap((adapter) => adapter.capabilities);
  const targetIds = new Set(targets.map((target) => target.id));
  const capabilityById = new Map(
    capabilities.map((capability) => [capability.id, capability] as const),
  );

  if (!behaviorIds.has(artifact.behaviorId)) {
    errors.push(`Compiled artifact ${artifact.id} references unknown behavior ${artifact.behaviorId}.`);
  }

  if (!targetIds.has(artifact.targetId)) {
    errors.push(`Compiled artifact ${artifact.id} references unknown target ${artifact.targetId}.`);
  }

  for (const policyId of artifact.requiredPolicyIds) {
    if (!policyIds.has(policyId)) {
      errors.push(`Compiled artifact ${artifact.id} references unknown policy ${policyId}.`);
    }
  }

  for (const command of artifact.commands) {
    if (command.targetId !== artifact.targetId) {
      errors.push(
        `Compiled command ${command.id} targets ${command.targetId}, not artifact target ${artifact.targetId}.`,
      );
    }

    if (!targetIds.has(command.targetId)) {
      errors.push(`Compiled command ${command.id} references unknown target ${command.targetId}.`);
    }

    const capability = capabilityById.get(command.capabilityId);

    if (!capability) {
      errors.push(
        `Compiled command ${command.id} references unknown capability ${command.capabilityId}.`,
      );
      continue;
    }

    if (!capability.targetIds.includes(command.targetId)) {
      errors.push(
        `Compiled command ${command.id} uses capability ${capability.id} on unsupported target ${command.targetId}.`,
      );
    }

    const commandSchema = capability.schema?.commands.find(
      (schema) => schema.id === command.commandId,
    );

    if (!commandSchema) {
      errors.push(
        `Compiled command ${command.id} references unknown command ${command.commandId} on capability ${capability.id}.`,
      );
      continue;
    }

    errors.push(
      ...validateCommandInputs(
        command.inputs,
        commandSchema.inputs,
        `Compiled command ${command.id}`,
      ),
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateFieldSchemas(
  fields: CapabilityFieldSchema[],
  scope: string,
): string[] {
  const errors: string[] = [];
  const fieldNames = new Set<string>();

  for (const field of fields) {
    if (fieldNames.has(field.name)) {
      errors.push(`${scope} has duplicate input ${field.name}.`);
    }
    fieldNames.add(field.name);

    if (field.type === 'enum' && !field.enumValues?.length) {
      errors.push(`${scope} field ${field.name} must define enumValues.`);
    }

    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      errors.push(`${scope} field ${field.name} has min greater than max.`);
    }
  }

  return errors;
}

function validateCommandInputs(
  inputs: Record<string, unknown>,
  schemaFields: CapabilityFieldSchema[],
  scope: string,
): string[] {
  const errors: string[] = [];
  const schemaByName = new Map(schemaFields.map((field) => [field.name, field] as const));

  for (const field of schemaFields) {
    const value = inputs[field.name];

    if (field.required && value === undefined) {
      errors.push(`${scope} is missing required input ${field.name}.`);
      continue;
    }

    if (value !== undefined) {
      errors.push(...validateInputValue(value, field, scope));
    }
  }

  for (const inputName of Object.keys(inputs)) {
    if (!schemaByName.has(inputName)) {
      errors.push(`${scope} provides unknown input ${inputName}.`);
    }
  }

  return errors;
}

function validateInputValue(
  value: unknown,
  field: CapabilityFieldSchema,
  scope: string,
): string[] {
  const errors: string[] = [];

  if (field.type === 'number') {
    if (typeof value !== 'number') {
      errors.push(`${scope} input ${field.name} must be a number.`);
      return errors;
    }

    if (field.min !== undefined && value < field.min) {
      errors.push(`${scope} input ${field.name} must be >= ${field.min}.`);
    }

    if (field.max !== undefined && value > field.max) {
      errors.push(`${scope} input ${field.name} must be <= ${field.max}.`);
    }
  }

  if (field.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${scope} input ${field.name} must be a boolean.`);
  }

  if (field.type === 'string' && typeof value !== 'string') {
    errors.push(`${scope} input ${field.name} must be a string.`);
  }

  if (field.type === 'color' && typeof value !== 'string') {
    errors.push(`${scope} input ${field.name} must be a color string.`);
  }

  if (field.type === 'enum') {
    if (typeof value !== 'string') {
      errors.push(`${scope} input ${field.name} must be an enum string.`);
      return errors;
    }

    if (field.enumValues && !field.enumValues.includes(value)) {
      errors.push(`${scope} input ${field.name} must be one of ${field.enumValues.join(', ')}.`);
    }
  }

  if (
    field.type === 'object' &&
    (typeof value !== 'object' || value === null || Array.isArray(value))
  ) {
    errors.push(`${scope} input ${field.name} must be an object.`);
  }

  return errors;
}

function findDuplicateIds(items: Array<{ id: string }>): string[] {
  const seen = new Set<string>();
  const duplicated = new Set<string>();

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicated.add(item.id);
    }

    seen.add(item.id);
  }

  return Array.from(duplicated);
}

export const botLabConcepts: Array<{
  concept: BotLabConcept;
  description: string;
}> = [
  {
    concept: 'policy',
    description: 'Guardrails and constraints applied before behavior execution.',
  },
  {
    concept: 'skill',
    description: 'Reusable robot abilities backed by concrete capabilities.',
  },
  {
    concept: 'behavior',
    description: 'Visual programs and reactive logic created in the block editor.',
  },
  {
    concept: 'capability',
    description: 'Hardware or simulated affordances exposed by an adapter.',
  },
  {
    concept: 'target',
    description: 'A physical robot or simulator destination for execution.',
  },
  {
    concept: 'artifact',
    description: 'Generated blocks, compiled plans, logs, traces, or simulator output.',
  },
  {
    concept: 'introspection',
    description: 'Runtime state, health, telemetry, and diagnostics.',
  },
  {
    concept: 'scheduler',
    description: 'Timing model for running behaviors manually, by event, or on a clock.',
  },
  {
    concept: 'arbitration',
    description: 'Conflict resolution when behaviors compete for capabilities.',
  },
];

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
        description: 'Ask before sending visible light commands to a physical robot.',
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
        description: 'Do not execute behavior plans against targets that are not implemented.',
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

export const sampleMicroDuckCompiledBehaviorArtifact: CompiledBehaviorArtifact = {
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
  artifactIds: ['artifact-microduck-leds-blocks', 'artifact-microduck-leds-plan'],
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
