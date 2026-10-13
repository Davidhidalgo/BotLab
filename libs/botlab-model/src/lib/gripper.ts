/** Explicit manipulator actions; preparing a claw is separate from operating it. */
export type GripperAction =
  | 'prepare-left'
  | 'prepare-right'
  | 'open'
  | 'close'
  | 'stow';
export interface GripperTarget {
  side: 'left' | 'right';
  position: 'open' | 'closed' | 'stowed';
  joints: Array<{ name: string; radians: number }>;
}
export function validateGripperAction(
  value: unknown,
): asserts value is GripperAction {
  if (
    typeof value !== 'string' ||
    !['prepare-left', 'prepare-right', 'open', 'close', 'stow'].includes(value)
  )
    throw new Error('Unsupported gripper action.');
}
