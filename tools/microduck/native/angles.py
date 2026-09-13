from probe import *
n = Native('angles')
samples = []
results = []

def snap(label):
    b = n.body.get('read')
    s = n.rpc.latest['robot.state']
    r = {'at': time.monotonic(), 'label': label, 'trunk': b['trunk'], 'sim_time': b['sim_time'], 'truthYaw': yaw(b['imu']['quat']), 'odom': s['odom'], 'policy': s['policy'], 'move': s['move'], 'loop': s['loop'], 'safety': s['safety']}
    samples.append(r)
    return r
try:
    n.start()
    time.sleep(4)
    a = snap('walk')
    start = time.monotonic()
    while time.monotonic() - start < 15:
        r = snap('walk')
        p = r['odom']['position']
        q = a['odom']['position']
        if math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.25:
            break
        n.rpc.call('robot.move', {'vx': 0.25})
        time.sleep(0.04)
    n.rpc.call('robot.move', {})
    time.sleep(3)
    r = snap('walk_settled')
    res = {'kind': 'walk', 'requested_m': 0.25, 'odom_m': math.dist(r['odom']['position'][:2], a['odom']['position'][:2]), 'truth_m': math.dist(r['trunk'][:2], a['trunk'][:2]), 'duration_s': time.monotonic() - start}
    results.append(res)
    print(json.dumps(res), flush=True)
    for requested in [90, -90, 180, 15, -15, -180, 360]:
        label = f'turn_{requested}'
        a = snap(label)
        last = a['odom']['yaw']
        lasttruth = a['truthYaw']
        turned = truth = 0
        target = -math.radians(requested)
        start = time.monotonic()
        settle_at = None
        quiet_at = None
        direction = 1 if target > 0 else -1
        lastat = a['at']
        corrections = 0
        done = False
        while time.monotonic() - start < 25:
            r = snap(label)
            current = r['odom']['yaw']
            delta = (current - last + math.pi) % (2 * math.pi) - math.pi
            turned += delta
            last = current
            td = (r['truthYaw'] - lasttruth + math.pi) % (2 * math.pi) - math.pi
            truth += td
            lasttruth = r['truthYaw']
            rate = abs(delta / max(0.001, r['at'] - lastat))
            lastat = r['at']
            error = target - turned
            if r['safety']['fallen']:
                break
            if settle_at is None and direction * error <= 0:
                settle_at = r['at']
                quiet_at = None
            if settle_at is not None:
                n.rpc.call('robot.move', {})
                if rate < math.radians(5):
                    quiet_at = quiet_at or r['at']
                else:
                    quiet_at = None
                if r['at'] - settle_at >= 0.75 and quiet_at and (r['at'] - quiet_at >= 0.25):
                    if abs(error) <= math.radians(5):
                        done = True
                        break
                    direction = 1 if error > 0 else -1
                    settle_at = None
                    corrections += 1
            else:
                velocity = direction * max(1.5, min(2, abs(error) * 2))
                n.rpc.call('robot.move', {'vyaw': velocity})
            time.sleep(0.03)
        n.rpc.call('robot.move', {})
        end = time.monotonic() + 3
        while time.monotonic() < end:
            time.sleep(0.04)
            r = snap(label)
            current = r['odom']['yaw']
            turned += (current - last + math.pi) % (2 * math.pi) - math.pi
            last = current
            truth += (r['truthYaw'] - lasttruth + math.pi) % (2 * math.pi) - math.pi
            lasttruth = r['truthYaw']
        res = {'kind': 'turn', 'requested_deg': requested, 'odom_deg': -math.degrees(turned), 'truth_deg': -math.degrees(truth), 'error_deg': abs(-math.degrees(truth) - requested), 'completed': done, 'corrections': corrections, 'fallen': r['safety']['fallen'], 'duration_s': time.monotonic() - start}
        results.append(res)
        print(json.dumps(res), flush=True)
    assert abs(results[0]['truth_m'] - 0.25) <= 0.03, 'walk exceeds 3 cm probe budget'
    assert all(r['completed'] and not r['fallen'] and r['error_deg'] <= 10 for r in results[1:]), 'turn regression exceeds budget'
finally:
    (n.out / 'samples.json').write_text(json.dumps(samples))
    (n.out / 'results.json').write_text(json.dumps(results, indent=2))
    n.close()
