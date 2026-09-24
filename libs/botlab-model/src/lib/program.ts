/** Position of a compiled command inside nested repeat blocks, outermost first. */
export interface ProgramIteration {
  sourceBlockId?: string;
  iteration: number;
  count: number;
}
