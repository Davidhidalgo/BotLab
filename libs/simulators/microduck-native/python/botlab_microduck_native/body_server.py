"""Native-window presentation of the pinned upstream physics/server.

The upstream world, protocol and dynamics stay upstream. Only its presentation
loop is replaced: a required viewer and one scene sync per 50 Hz physics pass.
"""
import json
import os
from pathlib import Path
import time
import signal
import threading
import mujoco.viewer
from mjlab_microduck.sim import body_server as upstream


def run(world, headless):
    if headless:
        raise ValueError('The companion requires a native window.')
    # Fail startup if Cocoa cannot create a viewer; never silently run headless.
    viewer = mujoco.viewer.launch_passive(
        world.model, world.data, show_left_ui=False, show_right_ui=False)
    with viewer.lock():
        viewer.cam.distance = 0.8
        viewer.cam.azimuth = 135
        viewer.cam.elevation = -20
        viewer.cam.lookat[:] = [0, 0, .1]
        viewer.opt.flags[mujoco.mjtVisFlag.mjVIS_CONTACTPOINT] = False
    period = max(1, round(.020 / world.model.opt.timestep)) * world.model.opt.timestep
    batch = round(period / world.model.opt.timestep)
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    signal.signal(signal.SIGINT, lambda *_: stopping.set())
    intervals = []
    previous = None
    deadline = time.perf_counter()
    try:
        while not stopping.is_set() and viewer.is_running():
            with viewer.lock():
                world.step(batch)
            viewer.sync()
            now = time.perf_counter()
            if previous is not None:
                intervals.append(now - previous)
                if len(intervals) > 30000:
                    del intervals[:15000]
            previous = now
            deadline += period
            if deadline < now - .25:
                deadline = now
            time.sleep(max(0, deadline - time.perf_counter()))
    finally:
        viewer.close()
        destination = os.environ.get('BOTLAB_NATIVE_VIEWER_METRICS')
        if destination and intervals:
            ordered = sorted(intervals)
            Path(destination).write_text(json.dumps({
                'sceneSyncHz': len(intervals) / sum(intervals),
                'sceneSyncIntervalP95Ms': ordered[int((len(ordered) - 1) * .95)] * 1000,
                'samples': len(intervals),
                'note': 'Scene synchronization cadence, not measured display FPS.'
            }, indent=2))


if __name__ == '__main__':
    upstream.run = run
    upstream.main()
    # Upstream leaves TCP handler threads alive. The viewer is now closed and
    # metrics are persisted; avoid CPython finalization racing their stdout.
    # Process exit closes their sockets; the gateway stops its owned daemons.
    os._exit(0)
