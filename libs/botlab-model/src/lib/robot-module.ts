import type {
  Behavior,
  BehaviorArtifact,
  BotLabAdapter,
  CompiledBehaviorArtifact,
  Policy,
  Skill,
} from './botlab-model';

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
  /** Robot block types executable with the given capabilities, excluding generic control blocks. */
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
