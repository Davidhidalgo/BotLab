"""Posture observations and one-shot transitions; an RPC ACK is not completion."""
from collections import deque
import math


class PostureObserver:
    def __init__(self):
        self.samples = deque()
        self.stable = None
        self.policy = None
        self.transition_started = None
        self.observed = 'unknown'

    def observe(self, state, now):
        self.stable = None
        self.observed = 'unknown'
        self.policy = state.get('policy') if state else None
        if not state or any(
                state.get('safety', {}).get(key, True) for key in ('fallen', 'limp')):
            self.samples.clear()
            return
        if self.transition_started is not None and now - self.transition_started <= 12:
            self.observed = 'transitioning'
        if self.policy not in ('sit', 'stand'):
            self.samples.clear()
            return
        height = state.get('odom', {}).get('position', [0, 0, float('nan')])[2]
        gyro = state.get('imu', {}).get('gyro', [])
        if (not math.isfinite(height) or len(gyro) != 3 or
                any(not math.isfinite(x) or abs(x) > .15 for x in gyro)):
            self.samples.clear()
            return
        if self.samples and self.samples[-1][2] != self.policy:
            self.samples.clear()
        self.samples.append((now, height, self.policy))
        while len(self.samples) > 1 and now - self.samples[1][0] >= .6:
            self.samples.popleft()
        heights = [s[1] for s in self.samples]
        # Native simulator odometry includes physical trunk height. Keep this
        # completion criterion at the simulator boundary, not as a hardware guarantee.
        at_height = height <= .085 if self.policy == 'sit' else height >= .095
        if now - self.samples[0][0] >= .6 and max(heights) - min(heights) < .004 and at_height:
            self.stable = self.policy
            self.observed = self.stable
            self.transition_started = None

    def invalidate(self, transition_started=None):
        self.samples.clear()
        self.stable = None
        self.transition_started = transition_started
        self.observed = 'transitioning' if transition_started is not None else 'unknown'


class PostureAction:
    def __init__(self, desired, now):
        self.desired = desired
        self.started = now
        self.requested = False
        self.completed = False

    def tick(self, observer, now):
        if now - self.started > 12:
            raise TimeoutError('Posture did not stabilize before the timeout.')
        if observer.stable == self.desired:
            if not self.requested:
                raise ValueError(f'Robot is already {self.desired}. Check its posture with an if block before requesting it again.')
            self.completed = True
            return None
        if observer.stable and not self.requested:
            self.requested = True
            observer.invalidate(now)
            return 'sit_toggle'
        return None
