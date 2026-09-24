import type {
  BehaviorArtifact,
  BotLabAdapter,
  CompiledBehaviorArtifact,
} from './botlab-model';

/** Serialized editor workspace a robot module reads; editor-engine neutral. */
export type RobotProgramSource = Pick<
  BehaviorArtifact,
  'behaviorId' | 'format' | 'content'
>;

/**
 * Everything BotLab needs to know about one robot family: its adapter, the
 * blocks it can execute and how its workspaces become compiled plans. Hosts
 * register modules; model, runtime and editor stay robot-agnostic.
 */
export interface RobotModule<Step = unknown> {
  /** Adapter ID the module's targets belong to. */
  id: string;
  createAdapter(): BotLabAdapter;
  /** Robot block types executable with the given capabilities, excluding generic control blocks. */
  blockTypes(capabilityIds: readonly string[]): string[];
  readProgram(source: RobotProgramSource): Step[];
  compile(
    source: Pick<RobotProgramSource, 'behaviorId'>,
    program: readonly Step[],
    targetId: string,
  ): CompiledBehaviorArtifact;
}

/** Reads and compiles a workspace for one target through its robot module. */
export function compileRobotWorkspace<Step>(
  module: RobotModule<Step>,
  source: RobotProgramSource,
  targetId: string,
): CompiledBehaviorArtifact {
  return module.compile(source, module.readProgram(source), targetId);
}
