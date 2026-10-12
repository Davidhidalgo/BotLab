"""Confirmed front-depth events for bounded corridor navigation."""

CENTRE = (27, 28, 35, 36)
VALID = (5, 9)


class DepthNavigation:
    def __init__(self, target, now):
        self.target = target
        self.last_seq = -1
        self.last_valid_at = now
        self.confirmations = 0
        self.distance = None

    def observe(self, frame, now):
        if not isinstance(frame, dict):
            return 'lost' if now - self.last_valid_at > 2 else 'waiting'
        seq = frame.get('seq')
        if type(seq) is not int or seq <= self.last_seq:
            return 'lost' if now - self.last_valid_at > 2 else 'waiting'
        self.last_seq = seq
        distances = frame.get('distance_mm')
        statuses = frame.get('status')
        if not isinstance(distances, list) or not isinstance(statuses, list) or len(distances) != 64 or len(statuses) != 64:
            self.confirmations = 0
            return 'lost' if now - self.last_valid_at > 2 else 'waiting'
        valid = [distances[index] for index in CENTRE
                 if statuses[index] in VALID and type(distances[index]) in (int, float) and distances[index] > 0]
        if len(valid) < 3:
            self.confirmations = 0
            return 'lost' if now - self.last_valid_at > 2 else 'waiting'
        self.last_valid_at = now
        self.distance = min(valid) / 1000
        reached = self.distance <= .40 if self.target == 'obstacle' else self.distance >= .65
        self.confirmations = self.confirmations + 1 if reached else 0
        return 'target' if self.confirmations >= 3 else 'valid'
