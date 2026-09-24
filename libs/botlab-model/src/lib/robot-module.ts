import type {
  Behavior,
  BehaviorArtifact,
  BotLabAdapter,
  CompiledBehaviorArtifact,
  Policy,
  Skill,
} from './botlab-model';
import type { RobotBlockSet } from './robot-blocks';

/** Serialized editor workspace a robot module reads; editor-engine neutral. */
export type RobotProgramSource = Pick<
  BehaviorArtifact,
  'behaviorId' | 'format' | 'content'
>;

/** Skills, policies and behaviors a robot contributes to a host runtime. */
export interface RobotCatalog {
  skills: readonly Skill[];
  policies: readonly Policy[];
  behaviors: readonly Behavior[];
}

/**
 * Everything BotLab needs to know about one robot family: its adapter, the
 * blocks it can execute and how its workspaces become compiled plans. Hosts
 * register modules; model, runtime and editor stay robot-agnostic.
 */
export interface RobotModule<Step = unknown> {
  /** Adapter ID the module's targets belong to. */
  id: string;
  createAdapter(): BotLabAdapter;
  catalog: RobotCatalog;
  /** Editor blocks for this robot; `blockTypes` selects which are executable. */
  blocks: RobotBlockSet;
  /**
   * Robot block types executable with the given capabilities, excluding shared
   * control blocks. Exposing a Boolean (condition) block also enables
   * `control_if`/`control_if_else`, so `readProgram` must accept them.
   */
  blockTypes(capabilityIds: readonly string[]): string[];
  readProgram(source: RobotProgramSource): Step[];
  /**
   * Lowers typed steps to a runtime plan. Omitted by robots that execute typed
   * steps directly on the device (for example over Bluetooth).
   */
  compile?(
    source: Pick<RobotProgramSource, 'behaviorId'>,
    program: readonly Step[],
    targetId: string,
  ): CompiledBehaviorArtifact;
}

/** Robot module whose programs compile to runtime plans. */
export type CompilingRobotModule<Step = unknown> = RobotModule<Step> &
  Required<Pick<RobotModule<Step>, 'compile'>>;

/** Reads and compiles a workspace for one target through its robot module. */
export function compileRobotWorkspace<Step>(
  module: CompilingRobotModule<Step>,
  source: RobotProgramSource,
  targetId: string,
): CompiledBehaviorArtifact {
  return module.compile(source, module.readProgram(source), targetId);
}

/** Program structure every robot can run. */
export const commonControlBlockTypes: readonly string[] = [
  'event_whenflagclicked',
  'control_wait',
  'control_repeat',
];

/** Branching blocks, offered only when the robot has a condition to test. */
export const conditionalControlBlockTypes: readonly string[] = [
  'control_if',
  'control_if_else',
];

/**
 * Block types an editor should offer for a robot: shared structure, the
 * robot's executable blocks, and conditionals whenever one of those blocks is
 * a condition (Boolean shape).
 */
export function robotPaletteBlockTypes(
  module: Pick<RobotModule, 'blockTypes' | 'blocks'>,
  capabilityIds: readonly string[],
): string[] {
  const robotTypes = module.blockTypes(capabilityIds);
  const conditions = new Set(
    module.blocks.blocks
      .filter((block) => block.shape === 'boolean')
      .map((block) => block.type),
  );
  return [
    ...commonControlBlockTypes,
    ...robotTypes,
    ...(robotTypes.some((type) => conditions.has(type))
      ? conditionalControlBlockTypes
      : []),
  ];
}
