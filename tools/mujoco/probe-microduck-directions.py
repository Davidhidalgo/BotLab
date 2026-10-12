"""Independent native check of BL-003, using the pinned scene and alpha policy."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import math
import platform

import mujoco
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'tmp/mujoco-web/microduck'
manifest = json.loads((ASSETS / 'manifest.json').read_text())
policy_path = ASSETS / 'alpha-walking.onnx'
assert hashlib.sha256(policy_path.read_bytes()).hexdigest() == 'e36332d383997d51401897734cd3e79cf5038406feddb18b4d57ecfb141daa6c'
model = mujoco.MjModel.from_xml_path(str(ASSETS / manifest['scene']))
policy = ort.InferenceSession(str(policy_path), providers=['CPUExecutionProvider'])
qa = [model.joint(j['name']).qposadr[0] for j in manifest['joints']]
va = [model.joint(j['name']).dofadr[0] for j in manifest['joints']]
home = np.array([j['home'] for j in manifest['joints']], dtype=np.float32)
body = model.body('trunk_base').id
gyro = model.sensor('imu_ang_vel').adr[0]


def heading(q):
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


results = []
for after_forward in (False, True):
    for label, forward, yaw in [('left', 0, 1), ('right', 0, -1), ('reverse', -.2, 0), ('forward-control', .25, 0)]:
        data = mujoco.MjData(model)
        mujoco.mj_resetDataKeyframe(model, data, model.key('initial').id)
        mujoco.mj_forward(model, data)
        previous = np.zeros(14, dtype=np.float32)
        commands = [('settle', 0, 0, 1)]
        if after_forward:
            commands.append(('advance', .25, 0, 8))
        commands += [(label, forward, yaw, 20), ('zero-command', 0, 0, 2)]
        measured = []
        min_height, max_tilt = math.inf, 0
        for name, vx, wz, seconds in commands:
            origin = data.qpos[:3].copy()
            initial_yaw = last_yaw = heading(data.qpos[3:7])
            rotation = 0
            for _ in range(round(seconds / .02)):
                w, x, y, z = data.xquat[body]
                gravity = [2 * (w * y - x * z), -2 * (y * z + w * x), -(1 - 2 * (x * x + y * y))]
                obs = np.concatenate([data.sensordata[gyro:gyro + 3], gravity, data.qpos[qa] - home, data.qvel[va], previous, [vx, 0, wz] + [0] * 10]).astype(np.float32)
                action = policy.run(None, {policy.get_inputs()[0].name: obs.reshape(1, 61)})[0].reshape(14)
                previous = action.copy()
                data.ctrl[:] = home.astype(np.float64) + action.astype(np.float64)
                for _ in range(4):
                    mujoco.mj_step(model, data)
                    min_height = min(min_height, float(data.qpos[2]))
                    upright = 1 - 2 * (data.qpos[4] ** 2 + data.qpos[5] ** 2)
                    max_tilt = max(max_tilt, math.acos(float(np.clip(upright, -1, 1))))
                    assert np.isfinite(data.qpos).all() and data.qpos[2] >= .065 and upright >= .5
                current_yaw = heading(data.qpos[3:7])
                rotation += math.atan2(math.sin(current_yaw - last_yaw), math.cos(current_yaw - last_yaw))
                last_yaw = current_yaw
            delta = data.qpos[:3] - origin
            measured.append(dict(label=name, forward=vx, yaw=wz, durationSeconds=seconds,
                forwardDisplacementMeters=float(delta[0] * math.cos(initial_yaw) + delta[1] * math.sin(initial_yaw)),
                displacementMeters=float(np.linalg.norm(delta[:2])), yawRadians=rotation))
        results.append(dict(label=label, afterForward=after_forward, minHeight=min_height, maxTiltRadians=max_tilt, commands=measured))
report = dict(executedAt=datetime.now(timezone.utc).isoformat(), kind='Independent native MuJoCo/ORT directional probe; not long-horizon numerical parity',
    platform=platform.platform(), mujoco=mujoco.__version__, onnxruntime=ort.__version__,
    modelRevision=manifest['revision'], policySha256=hashlib.sha256(policy_path.read_bytes()).hexdigest(), results=results)
(ROOT / 'docs/evidence/microduck-directions-native-probe.json').write_text(json.dumps(report, indent=2) + '\n')
for row in results:
    print(row['label'], row['afterForward'], next(c for c in row['commands'] if c['label'] == row['label']))
