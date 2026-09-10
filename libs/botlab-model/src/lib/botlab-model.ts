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

export interface Capability {
  id: string;
  kind: CapabilityKind;
  name: string;
  description: string;
  targetIds: string[];
}

export interface Target {
  id: string;
  name: string;
  kind: 'robot' | 'simulator';
  adapterId: string;
  status: 'available' | 'planned' | 'offline';
}

export interface Policy {
  id: string;
  name: string;
  rules: string[];
}

export interface Skill {
  id: string;
  name: string;
  capabilityIds: string[];
  policyIds: string[];
}

export interface Behavior {
  id: string;
  name: string;
  skillIds: string[];
  schedulerId: string;
  arbitrationId: string;
  artifactIds: string[];
}

export interface Artifact {
  id: string;
  kind: 'blocks' | 'compiled-plan' | 'trace' | 'log' | 'simulator-output';
  label: string;
  createdAt: string;
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
