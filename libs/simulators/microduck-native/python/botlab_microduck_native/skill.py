"""Observed lifecycle for a one-shot native skill."""
from .community_skill import NAME


class SkillAction:
    def __init__(self, name, now):
        if not isinstance(name, str) or not NAME.fullmatch(name):
            raise ValueError('Unsupported native skill.')
        self.name = name
        self.started = now
        self.requested = False
        self.accepted = False
        self.observed_start = False
        self.completed = False

    def tick(self, state, posture, now):
        if now - self.started > 20:
            raise TimeoutError('Native skill did not finish and recover before the timeout.')
        policy = state.get('policy')
        if not self.requested:
            if posture.stable != 'stand' or policy != 'stand':
                raise ValueError('Stand the robot up before running a skill.')
            self.requested = True
            return self.name
        if not self.accepted:
            return None
        if policy == self.name or policy == self.name + ':unwind':
            self.observed_start = True
        elif self.observed_start and policy == 'stand' and posture.stable == 'stand':
            self.completed = True
        elif not self.observed_start and now - self.started > 3:
            raise TimeoutError('Native skill was accepted but did not visibly start.')
        return None
