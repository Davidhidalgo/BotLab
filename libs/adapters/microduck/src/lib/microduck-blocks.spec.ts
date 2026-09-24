import { validateRobotBlockSet } from '@botlab/model';
import { microDuckRobotModule } from './microduck-module';

describe('MicroDuck block set', () => {
  it('defines every executable block with consistent messages', () => {
    expect(
      validateRobotBlockSet(
        microDuckRobotModule.blocks,
        microDuckRobotModule.blockTypes(['microduck-motion', 'microduck-leds']),
      ),
    ).toEqual({ valid: true, errors: [] });
  });
});
