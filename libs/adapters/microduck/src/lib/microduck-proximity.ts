/** Native tofd frame: row-major distances in millimetres and ST sensor statuses. */
export interface MicroDuckDepthFrame {
  seq: number;
  rows: number;
  cols: number;
  distance_mm: number[];
  status: number[];
}

export interface MicroDuckProximityOptions {
  enterDistanceM: number;
  exitDistanceM: number;
  confirmationFrames?: number;
}

/** A per-execution subscription. Create a new instance after stream restart or cancellation. */
export function createMicroDuckProximityTrigger({
  enterDistanceM,
  exitDistanceM,
  confirmationFrames = 3,
}: MicroDuckProximityOptions) {
  if (
    !Number.isFinite(enterDistanceM) ||
    enterDistanceM <= 0 ||
    !Number.isFinite(exitDistanceM) ||
    exitDistanceM <= enterDistanceM ||
    !Number.isInteger(confirmationFrames) ||
    confirmationFrames < 1
  ) {
    throw new Error(
      'Proximity requires positive ordered distances and a positive frame count.',
    );
  }
  let armed = true;
  let active = true;
  let confirmations = 0;
  let lastSequence = -1;
  return {
    cancel() {
      active = false;
      confirmations = 0;
    },
    update(frame: MicroDuckDepthFrame): {
      entered: boolean;
      armed: boolean;
      distanceM?: number;
    } {
      if (
        !active ||
        !Number.isSafeInteger(frame.seq) ||
        frame.seq < 0 ||
        frame.seq <= lastSequence
      ) {
        return { entered: false, armed: active && armed };
      }
      if (frame.seq !== lastSequence + 1) confirmations = 0;
      lastSequence = frame.seq;
      if (
        frame.rows !== 8 ||
        frame.cols !== 8 ||
        frame.distance_mm.length !== 64 ||
        frame.status.length !== 64
      ) {
        confirmations = 0;
        return { entered: false, armed };
      }
      // Central 2×2 excludes the lower rays that commonly hit the floor. Require three valid rays.
      const distances = [27, 28, 35, 36]
        .filter((index) => [5, 9].includes(frame.status[index]))
        .map((index) => frame.distance_mm[index])
        .filter((distance) => Number.isFinite(distance) && distance > 0);
      if (distances.length < 3) {
        confirmations = 0;
        return { entered: false, armed };
      }
      const distanceM = Math.min(...distances) / 1000;
      if (distanceM >= exitDistanceM) {
        armed = true;
        confirmations = 0;
      } else if (distanceM <= enterDistanceM && armed) {
        confirmations += 1;
        if (confirmations >= confirmationFrames) {
          armed = false;
          confirmations = 0;
          return { entered: true, armed, distanceM };
        }
      } else {
        confirmations = 0;
      }
      return { entered: false, armed, distanceM };
    },
  };
}
