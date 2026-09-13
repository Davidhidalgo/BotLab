"""Bounded native movement controller. Native policies accept velocity intents, not angles."""
import math
from .posture import PostureAction


def walk_steps(steps):
    for step in steps:
        yield step
        if step['kind'] == 'if':
            yield from walk_steps(step['then'])
            yield from walk_steps(step['else'])


def validate_program(steps):
    count = 0
    def validate(sequence, depth=0):
        nonlocal count
        if not isinstance(sequence, list) or depth > 16:
            raise ValueError('Invalid branch or nesting exceeds 16 levels.')
        for step in sequence:
            count += 1
            if count > 256 or not isinstance(step, dict):
                raise ValueError('Program requires at most 256 valid steps.')
            if step.get('sourceBlockId') is not None and not isinstance(step['sourceBlockId'], str):
                raise ValueError('Invalid source block.')
            iterations = step.get('iterations', [])
            if not isinstance(iterations, list) or len(iterations) > 16:
                raise ValueError('Invalid iteration context.')
            for item in iterations:
                if (not isinstance(item, dict) or type(item.get('iteration')) is not int or
                    type(item.get('count')) is not int or not 1 <= item['iteration'] <= item['count'] <= 100 or
                    (item.get('sourceBlockId') is not None and not isinstance(item['sourceBlockId'], str))):
                    raise ValueError('Invalid iteration context.')
            kind, value = step.get('kind'), step.get('value')
            if kind == 'if':
                condition = step.get('condition')
                if not isinstance(condition, dict) or condition.get('posture') not in ('sit', 'stand', 'transitioning'):
                    raise ValueError('Invalid posture condition.')
                if condition.get('sourceBlockId') is not None and not isinstance(condition['sourceBlockId'], str):
                    raise ValueError('Invalid condition source block.')
                validate(step.get('then'), depth + 1)
                validate(step.get('else'), depth + 1)
                continue
            if kind == 'posture':
                if value not in ('sit', 'stand'):
                    raise ValueError('Unsupported posture.')
                continue
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value):
                raise ValueError('Step value must be finite.')
            if not ((kind == 'walk' and 0 < abs(value) <= 5) or
                    (kind == 'turn' and 0 < abs(value) <= 360) or
                    (kind == 'wait' and 0 <= value <= 60)):
                raise ValueError('Unsupported step or value outside native limits.')
    if not isinstance(steps, list) or not steps:
        raise ValueError('Program requires 1–256 steps.')
    validate(steps)
    return steps


class Program:
    def __init__(self, run_id, steps, now):
        self.steps = list(validate_program(steps))
        self.decisions = []
        self.run_id = run_id
        self.index = 0
        self.started = None
        self.total_start = now
        self.status = 'running'
        self.error = None
        self.error_code = None
        self.progress = 0
        self.posture_action = None
        self.skill_request = None

    def snapshot(self):
        return {'runId': self.run_id, 'status': self.status, 'index': self.index,
                'count': len(self.steps), 'step': self.steps[min(self.index, len(self.steps) - 1)],
                'progress': self.progress, 'error': self.error, 'errorCode': self.error_code, 'decisions': self.decisions[:]}

    def stop(self, error=None, error_code=None):
        self.status = 'failed' if error else 'stopped'
        self.error = error
        self.error_code = error_code

    def tick(self, state, now, posture=None):
        if self.status != 'running':
            return {}
        if state['safety']['fallen'] or state['safety']['limp']:
            self.stop('Robot fell or became limp. Reset the scene before running again.')
            return {}
        if now - self.total_start > 600:
            self.stop('Program exceeded 10 minutes.')
            return {}
        step = self.steps[self.index]
        if step['kind'] == 'if':
            observed = posture.observed if posture else 'unknown'
            if observed == 'unknown':
                self.stop('Posture is unknown. Wait for reliable posture observations before checking it.', 'posture-unknown')
                return {}
            result = observed == step['condition']['posture']
            self.decisions.append({'sourceBlockId': step.get('sourceBlockId'),
                                   'conditionBlockId': step['condition'].get('sourceBlockId'),
                                   'posture': step['condition']['posture'], 'observed': observed, 'result': result,
                                   'iterations': step.get('iterations', [])})
            # Expand only the selected branch. The whole tree was validated before execution.
            self.steps[self.index + 1:self.index + 1] = step['then'] if result else step['else']
            self.advance()
            return {}
        if step['kind'] == 'posture':
            if posture is None:
                self.stop('Posture observations unavailable.')
                return {}
            if self.posture_action is None:
                self.posture_action = PostureAction(step['value'], now)
            try:
                self.skill_request = self.posture_action.tick(posture, now)
            except (TimeoutError, ValueError) as error:
                self.stop(str(error), f'posture-already-{step["value"]}' if isinstance(error, ValueError) else None)
            self.progress = now - self.posture_action.started
            if self.posture_action.completed:
                self.advance()
            return {}
        if self.started is None and step['kind'] in ('walk', 'turn') and (state['policy'] != 'stand' or (posture is not None and posture.stable != 'stand')):
            self.stop('Stand the robot up before moving.')
            return {}
        odom = state['odom']
        if self.started is None:
            self.started = now
            self.position = odom['position'][:2]
            self.last_yaw = odom['yaw']
            self.turned = 0
            self.last_at = now
            self.direction = -1 if step['value'] > 0 else 1
            self.settle_at = None
            self.quiet_at = None
            self.last_progress = now
            self.best_progress = 0
        elapsed = now - self.started
        kind, value = step['kind'], step['value']
        done = False
        velocity = {}
        if kind == 'wait':
            self.progress = elapsed
            done = elapsed >= value
        elif kind == 'walk':
            self.progress = math.dist(odom['position'][:2], self.position)
            if self.progress > self.best_progress + 0.003:
                self.best_progress = self.progress
                self.last_progress = now
            if self.progress >= abs(value):
                self.settle_at = self.settle_at or now
                done = now - self.settle_at >= 0.75
            elif now - self.last_progress > 8 or elapsed > max(20, abs(value) * 30):
                self.stop('Walking stalled or timed out.')
            else:
                velocity = {'vx': 0.25 if value > 0 else -0.4}
        else:
            delta = (odom['yaw'] - self.last_yaw + math.pi) % (2 * math.pi) - math.pi
            self.turned += delta
            self.last_yaw = odom['yaw']
            rate = abs(delta / max(0.001, now - self.last_at))
            self.last_at = now
            self.progress = -math.degrees(self.turned)
            error = -math.radians(value) - self.turned
            if self.settle_at is None and self.direction * error <= 0:
                self.settle_at = now
                self.quiet_at = None
            if self.settle_at is not None:
                self.quiet_at = (self.quiet_at or now) if rate < math.radians(5) else None
                if now - self.settle_at >= 0.75 and self.quiet_at and now - self.quiet_at >= 0.25:
                    if abs(error) <= math.radians(5):
                        done = True
                    else:
                        self.direction = 1 if error > 0 else -1
                        self.settle_at = None
            else:
                velocity = {'vyaw': self.direction * max(1.5, min(2, abs(error) * 2))}
            if elapsed > 30:
                self.stop('Turning timed out before settling.')
        if done and kind in ('walk', 'turn') and posture is not None and posture.stable != 'stand':
            if now - self.settle_at > 12:
                self.stop('Movement finished but standing did not stabilize before the timeout.')
            return {}
        if done:
            self.advance()
            return {}
        return velocity if self.status == 'running' else {}

    def advance(self):
        self.index += 1
        self.started = None
        self.progress = 0
        self.posture_action = None
        self.skill_request = None
        if self.index >= len(self.steps):
            self.status = 'completed'
