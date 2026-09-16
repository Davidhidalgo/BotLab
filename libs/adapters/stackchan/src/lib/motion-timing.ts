/** Scheduling policy, not measured arrival time or a motor temperature model.
 * Fixed speed remains 100/1000. Ten-degree moves retain the original 3 s pause.
 */
export function motionPauseMs(
  from: number,
  to: number,
  moveCount: number,
): number {
  return 1000 + Math.abs(to - from) * 200 + (moveCount % 12 === 0 ? 10000 : 0);
}
