"""Run a 30-second native viewer check. All owned services stop on exit."""
from probe import Native, time, json
n = Native('viewer', viewer=True)
samples = []
try:
    n.start()
    start = time.monotonic()
    while time.monotonic() - start < 30:
        time.sleep(1)
        samples.append({'at': time.monotonic(), 'state': n.rpc.latest.get('robot.state'), 'body': n.body.get('read')})
    print('HEALTH', json.dumps(n.rpc.call('robot.health')), flush=True)
    assert samples[-1]['state']['loop']['hz'] >= 45
    assert not samples[-1]['state']['safety']['fallen']
finally:
    (n.out / 'samples.json').write_text(json.dumps(samples))
    n.close()
