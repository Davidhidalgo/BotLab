export interface MicroDuckPostureState {
  supported: boolean;
  posture: 'sit' | 'stand' | 'transitioning' | 'unknown';
  height: number;
  gyro: readonly number[];
  time: number;
  fallen: boolean;
}

/** Self-contained so the generated receiver uses this exact physical observer. */
export function createMicroDuckPostureObserver(read?: () => MicroDuckPostureState) {
  let samples: { time: number; height: number; posture: string }[] = [];
  let previousTime: number | undefined;
  let stale = 0;
  let observed: 'sit' | 'stand' | 'transitioning' | 'unknown' = 'unknown';
  let transitioning = false;
  return {
    begin() { samples = []; transitioning = true; observed = 'transitioning'; },
    observe(dt: number) {
      let state;
      try { state = read?.(); } catch { state = undefined; }
      if (!state?.supported) return { observed: 'unknown' as const, error: 'posture-unavailable' };
      if (!Number.isFinite(state.time) || !Number.isFinite(state.height) || state.gyro.length !== 3 || state.gyro.some(v => !Number.isFinite(v))) {
        samples = []; observed = 'unknown'; return { observed, error: 'telemetry-unavailable' };
      }
      if (previousTime !== undefined && state.time < previousTime) {
        samples = []; transitioning = false; previousTime = state.time; observed = 'unknown';
        return { observed, error: 'scene-interrupted' };
      }
      stale = state.time === previousTime ? stale + dt : 0;
      previousTime = state.time;
      if (stale > .5 || state.fallen) {
        samples = []; observed = 'unknown'; return { observed, error: state.fallen ? 'scene-interrupted' : 'telemetry-unavailable' };
      }
      const moving = state.gyro.some(v => Math.abs(v) > .15);
      if (state.posture === 'transitioning') transitioning = true;
      const posture = state.posture;
      if (posture !== 'sit' && posture !== 'stand') {
        samples = []; observed = posture === 'transitioning' ? 'transitioning' : 'unknown';
        return { observed };
      }
      if (moving || samples.at(-1)?.posture !== posture) samples = [];
      if (!moving && samples.at(-1)?.time !== state.time) samples.push({ time: state.time, height: state.height, posture });
      while (samples.length > 1 && state.time - samples[1].time >= .6) samples.shift();
      const heights = samples.map(s => s.height);
      if (samples.length && state.time - samples[0].time >= .6 && Math.max(...heights) - Math.min(...heights) < .004 &&
          (posture === 'sit' ? state.height <= .085 : state.height >= .095)) {
        observed = posture; transitioning = false;
      } else observed = transitioning ? 'transitioning' : 'unknown';
      return { observed };
    },
  };
}
