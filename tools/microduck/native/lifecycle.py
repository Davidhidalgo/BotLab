from probe import *
from scene import obstacle_scene
from trigger import Trigger
results = {}
n = Native('lifecycle')
samples = []

def capture(label):
    s = n.rpc.latest['robot.state']
    r = {'at': time.monotonic(), 'label': label, 'state': s, 'body': n.body.get('read')}
    samples.append(r)
    return r
try:
    n.start()
    time.sleep(4)
    for check in ['explicit_stop', 'connection_loss']:
        end = time.monotonic() + 1.5
        command = RPC(str(n.state / 'r.sock'))
        while time.monotonic() < end:
            command.call('robot.move', {'vx': 0.4})
            time.sleep(0.08)
            capture('drive')
        start = time.monotonic()
        reply = command.call('robot.stop') if check == 'explicit_stop' else None
        command.close()
        gated = None
        zero = None
        while time.monotonic() - start < 2:
            r = capture(check)
            m = r['state']['move']
            now = r['at'] - start
            if 'deadman' in m.get('limited_by', []) and gated is None:
                gated = now
            if max((abs(v) for v in m['applied'])) < 0.001 and zero is None:
                zero = now
            time.sleep(0.02)
        results[check] = {'reply': reply, 'deadman_s': gated, 'applied_below_0_001_s': zero, 'final_move': m, 'fallen': r['state']['safety']['fallen']}
        assert zero is not None and zero < 1.5, check
        if check == 'connection_loss':
            assert gated is not None and gated < 0.8
        print(check, json.dumps(results[check]), flush=True)
    print('SKILL_SIT', n.rpc.call('robot.do', {'skill': 'sit_toggle'}), flush=True)
    time.sleep(3)
    r = capture('sitting')
    results['sit'] = {'policy': r['state']['policy'], 'z': r['body']['trunk_z']}
    assert results['sit']['policy'] == 'sit'
    print('SKILL_STAND', n.rpc.call('robot.do', {'skill': 'sit_toggle'}), flush=True)
    time.sleep(3)
    r = capture('standing')
    results['stand'] = {'policy': r['state']['policy'], 'z': r['body']['trunk_z']}
    assert results['stand']['policy'] == 'stand' and results['stand']['z'] > 0.095
finally:
    (n.out / 'samples.json').write_text(json.dumps(samples))
    (n.out / 'results.json').write_text(json.dumps(results, indent=2))
    n.close()
n = Native('cancelled-proximity', scene=obstacle_scene())
trigger = Trigger()
samples = []
crossed = False
events = 0
try:
    n.start()
    time.sleep(4)
    trigger.cancel()
    start = time.monotonic()
    near_frames = 0
    last_seq = None
    while time.monotonic() - start < 12:
        f = n.tof.latest['tof.frame']
        entered = trigger.feed(f)
        events += int(entered)
        values = [f['distance_mm'][i] for i in [27, 28, 35, 36] if f['status'][i] in [5, 9] and f['distance_mm'][i] > 0]
        distance = min(values) if len(values) >= 3 else None
        samples.append({'at': time.monotonic(), 'tof': f, 'entered': entered, 'distance_mm': distance})
        if distance is not None and distance <= 450 and (f['seq'] != last_seq):
            near_frames += 1
        last_seq = f['seq']
        if near_frames >= 3:
            crossed = True
            break
        n.rpc.call('robot.move', {'vx': 0.4})
        time.sleep(0.04)
    n.rpc.call('robot.stop')
    print('CANCELLED_CROSSING', crossed, 'events', events, 'distance_mm', distance, flush=True)
    assert crossed and events == 0
finally:
    trigger.close()
    (n.out / 'samples.json').write_text(json.dumps(samples))
    (n.out / 'results.json').write_text(json.dumps({'crossed': crossed, 'events': events}, indent=2))
    n.close()
