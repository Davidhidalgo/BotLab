from probe import *
from scene import obstacle_scene
scene_path = obstacle_scene()
n = Native('reactive', scene=scene_path)
samples = []
events = []
from trigger import Trigger
trigger = Trigger()

def sample(phase):
    f = n.tof.latest['tof.frame']
    s = n.rpc.latest['robot.state']
    b = n.body.get('read')
    v = [f['distance_mm'][i] for i in [27, 28, 35, 36] if f['status'][i] in [5, 9] and f['distance_mm'][i] > 0]
    r = {'t': time.monotonic(), 'phase': phase, 'distance_mm': min(v) if v else None, 'tof': f, 'move': s['move'], 'odom': s['odom'], 'body': b, 'policy': s['policy'], 'safety': s['safety']}
    samples.append(r)
    return r
try:
    n.start()
    time.sleep(4)
    for attempt in range(2):
        start = time.monotonic()
        fired = False
        while time.monotonic() - start < 15:
            r = sample(f'approach_{attempt}')
            if trigger.feed(r['tof']):
                events.append({'attempt': attempt, 'distance_mm': r['distance_mm'], 'reply': n.rpc.call('robot.stop'), 'at': r['t']})
                print('TRIGGER', json.dumps(events[-1]), flush=True)
                fired = True
                break
            n.rpc.call('robot.move', {'vx': 0.4})
            time.sleep(0.04)
        if not fired:
            print('NO CROSSING', attempt, r['distance_mm'], flush=True)
            break
        hold = time.monotonic()
        while time.monotonic() - hold < 2:
            r = sample('hold')
            assert not trigger.feed(r['tof']), 'repeated trigger while near'
            time.sleep(0.05)
        print('STOPPED', r['move'], r['body']['trunk_z'], flush=True)
        start = time.monotonic()
        while time.monotonic() - start < 12:
            r = sample('reverse')
            trigger.feed(r['tof'])
            if trigger.armed:
                break
            n.rpc.call('robot.move', {'vx': -0.4})
            time.sleep(0.04)
        n.rpc.call('robot.move', {})
        time.sleep(1)
        print('REARM', trigger.armed, r['distance_mm'], flush=True)
    assert len(events) == 2, 'expected two distinct proximity entries'
finally:
    trigger.close()
    (n.out / 'samples.json').write_text(json.dumps(samples))
    (n.out / 'events.json').write_text(json.dumps(events, indent=2))
    n.close()
