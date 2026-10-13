import type { ControllerFeedback } from '@botlab/simulators-mujoco';
/** A requested posture is confirmed only by a stable physical observation window. */
export class MicroduckPostureTracker {
  state: 'sit' | 'stand' | 'transitioning' = 'stand';
  target: 'sit' | 'stand' = 'stand';
  private samples: Array<{ time: number; height: number }> = [];
  begin(target: 'sit' | 'stand') {
    this.target = target;
    this.state = 'transitioning';
    this.samples = [];
  }
  observe(feedback: ControllerFeedback) {
    if (this.state !== 'transitioning') return;
    const height = feedback.rootPosition[2],
      time = feedback.timeSeconds;
    const stable =
      feedback.angularVelocity.every((v) => Math.abs(v) <= 0.15) &&
      (this.target === 'sit' ? height <= 0.085 : height >= 0.095);
    if (!stable) {
      this.samples = [];
      return;
    }
    if (this.samples.at(-1)?.time !== time) this.samples.push({ time, height });
    while (this.samples.length > 1 && time - this.samples[1].time >= 0.6)
      this.samples.shift();
    const heights = this.samples.map((s) => s.height);
    if (
      time - this.samples[0].time >= 0.6 &&
      Math.max(...heights) - Math.min(...heights) < 0.004
    )
      this.state = this.target;
  }
  reset() {
    this.state = 'stand';
    this.target = 'stand';
    this.samples = [];
  }
}
