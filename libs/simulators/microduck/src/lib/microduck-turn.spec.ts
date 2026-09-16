import { createMicroDuckTurnTracker } from './microduck-turn';
import { createMicroDuckBotLabOfficialSource } from './microduck-simulator';

describe('measured turns', () => {
  it.each([-360, -180, -90, 90, 180, 360])(
    'measures %s degrees across wrapped yaw',
    (angle) => {
      let yaw = (170 * Math.PI) / 180;
      const track = createMicroDuckTurnTracker(angle, () =>
        Math.atan2(Math.sin(yaw), Math.cos(yaw)),
      );
      expect(track(0.02).done).toBe(false);
      for (let i = 0; i < Math.abs(angle) / 10 - 1; i++) {
        yaw -= (Math.sign(angle) * 10 * Math.PI) / 180;
        expect(track(0.1).done).toBe(false);
      }
      yaw -= (Math.sign(angle) * 11 * Math.PI) / 180;
      expect(track(0.1)).toMatchObject({ done: false, powerScale: 0 });
      expect(track(0.75)).toMatchObject({ done: true, powerScale: 0 });
    },
  );
  it('does not count motion in the wrong direction or oscillation as arrival', () => {
    let yaw = 0;
    const track = createMicroDuckTurnTracker(90, () => yaw);
    track(0.02);
    yaw = 0.4;
    expect(track(0.1).turnedDegrees).toBe(0);
    yaw = 0;
    expect(track(0.1).turnedDegrees).toBe(0);
    expect(track(10).error).toBe('motion-stalled');
  });
  it('slows down near arrival while retaining the calibrated Feet stepping input', () => {
    let yaw = 0;
    const track = createMicroDuckTurnTracker(90, () => yaw);
    const initial = track(0.02).powerScale;
    yaw = (-85 * Math.PI) / 180;
    const power = track(1).powerScale;
    expect(power).toBeLessThan(initial);
    expect(power * 2).toBeGreaterThanOrEqual(1.5);
  });
  it('uses measured yaw in the direct source and starts backward motion only after the turn', () => {
    let heading = 0;
    const source = createMicroDuckBotLabOfficialSource({
      getVelocityLimits: () => [0.2, -0.1, 0.3],
      getHeading: () => heading,
    });
    source.load({
      artifactId: 'turn-back',
      targetId: 'microduck-sim',
      messages: [],
      errors: [],
      frames: [
        {
          id: 'turn',
          targetId: 'microduck-sim',
          type: 'differential-drive',
          leftPower: -1,
          rightPower: 1,
          angleDegrees: -90,
        },
        {
          id: 'back',
          targetId: 'microduck-sim',
          type: 'differential-drive',
          leftPower: -1,
          rightPower: -1,
          durationMs: 1000,
        },
      ],
    });
    source.poll?.(0.02);
    expect(source.command[0]).toBe(0);
    expect(source.command[2]).toBeGreaterThan(0);
    heading = Math.PI / 2 + 0.01;
    source.poll?.(1);
    expect(Array.from(source.command)).toEqual([0, 0, 0]);
    source.poll?.(0.75);
    expect(Array.from(source.command)).toEqual([0, 0, 0]);
    source.poll?.(0.02);
    expect(source.command[0]).toBeCloseTo(-0.1);
    expect(source.command[2]).toBe(0);
    source.dispose?.();
  });
  it.each([8, 24])(
    'corrects a 15-degree turn that settles at %s degrees',
    (settled) => {
      let yaw = 0;
      const track = createMicroDuckTurnTracker(15, () => yaw);
      track(0.02);
      yaw = (-16 * Math.PI) / 180;
      expect(track(0.3)).toMatchObject({ done: false, powerScale: 0 });
      yaw = (-settled * Math.PI) / 180;
      expect(track(0.3).done).toBe(false);
      const correction = track(0.75);
      expect(correction.done).toBe(false);
      expect(Math.sign(correction.powerScale)).toBe(settled < 15 ? 1 : -1);
      yaw = (-(settled < 15 ? 16 : 14) * Math.PI) / 180;
      expect(track(0.3)).toMatchObject({ done: false, powerScale: 0 });
      expect(track(0.75)).toMatchObject({ done: true, powerScale: 0 });
    },
  );
  it('does not finish while the heading is still drifting through the tolerance', () => {
    let yaw = 0;
    const track = createMicroDuckTurnTracker(90, () => yaw);
    track(0.02);
    yaw = (-91 * Math.PI) / 180;
    track(1);
    for (let i = 0; i < 8; i++) {
      yaw -= (0.6 * Math.PI) / 180;
      expect(track(0.1).done).toBe(false);
    }
    expect(track(0.75).powerScale).toBeLessThan(0);
  });
  it('handles zero and rejects missing telemetry, invalid angles and resets', () => {
    expect(createMicroDuckTurnTracker(0)(0.02).done).toBe(true);
    expect(createMicroDuckTurnTracker(90)(0.02).error).toBe(
      'telemetry-unavailable',
    );
    expect(
      createMicroDuckTurnTracker(90, () => {
        throw new Error();
      })(0.02).error,
    ).toBe('telemetry-unavailable');
    for (const angle of [NaN, Infinity, 361, -361])
      expect(createMicroDuckTurnTracker(angle)(0.02).error).toBe(
        'invalid-frame',
      );
    let yaw = 0;
    const track = createMicroDuckTurnTracker(180, () => yaw);
    track(0.02);
    yaw = 2;
    expect(track(0.02).error).toBe('position-reset');
  });
});
