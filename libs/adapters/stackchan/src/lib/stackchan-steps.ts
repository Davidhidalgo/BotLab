/** Typed StackChan head and LED actions; the adapter enforces physical limits. */
export type StackChanLedSide = 'both' | 'left' | 'right';
export type StackChanProgramStep = (
  | { type: 'yaw'; degrees: number }
  | { type: 'led'; side: StackChanLedSide; color: string; brightness: number }
  | { type: 'wait'; seconds: number }
) & { sourceBlockId: string };
