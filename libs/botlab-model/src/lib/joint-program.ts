/** Simulator joint targets use SI; existing degree-based robot programs are unchanged. */
export interface JointPositionStep {
  sourceBlockId: string;
  joint: string;
  positionRadians: number;
}
export interface JointPositionLimits {
  name: string;
  min: number;
  max: number;
}
