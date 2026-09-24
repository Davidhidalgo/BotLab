import { describe, expect, it } from 'vitest';
import { validateRobotBlockSet } from '@botlab/model';
import { stackChanRobotModule } from './stackchan-module';

describe('StackChan block set', () => {
  it('defines every executable block with consistent messages', () => {
    expect(
      validateRobotBlockSet(
        stackChanRobotModule.blocks,
        stackChanRobotModule.blockTypes(['stackchan-yaw', 'stackchan-leds']),
      ),
    ).toEqual({ valid: true, errors: [] });
  });
});
