"""Native verification of the pinned Jumper Rx turn mapping, separate from web code."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
import mujoco
import numpy as np
import onnxruntime as ort

ROOT = Path(__file__).resolve().parents[2]
assets = ROOT / 'tmp/mujoco-web/jumper-walking'
manifest = json.loads((assets / 'manifest.json').read_text())
for asset in manifest['assets']:
    assert hashlib.sha256((assets / asset['path']).read_bytes()).hexdigest() == asset['sha256']
config = json.loads((assets / 'controller-config.json').read_text())
bundle = ROOT / ('tmp/mujoco-audit/jumper-' + manifest['revision']) / 'out/bundle_example/jumper'
metadata = json.loads((bundle / 'bundle.json').read_text())
native_path = 'runtime/mjlab/macosx-universal2/controller.so'
assert hashlib.sha256((bundle / native_path).read_bytes()).hexdigest() == metadata['files'][native_path]['sha256']
spec = importlib.util.spec_from_file_location('mjrl_fsm', bundle / native_path)
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)
model = mujoco.MjModel.from_xml_path(str(assets / manifest['scene']))
policy = ort.InferenceSession(str(assets / 'locomotion.onnx'), providers=['CPUExecutionProvider'])
qa = [model.joint(j['name']).qposadr[0] for j in manifest['joints']]
va = [model.joint(j['name']).dofadr[0] for j in manifest['joints']]
body = model.body('base_link').id
curve = manifest['servoCurve']
tau = curve['peakSeconds'] / math.log(1 / (1 - (curve['continuous'] / curve['plateau']) ** 2))

def heading(q):
    w, x, y, z = q
    return math.atan2(2 * (w*z + x*y), 1 - 2 * (y*y + z*z))

runs = []
for after_forward in [False, True]:
    for sign in [1, -1]:
        data = mujoco.MjData(model)
        mujoco.mj_resetDataKeyframe(model, data, model.key('init_state').id)
        mujoco.mj_forward(model, data)
        fsm = binding.Fsm(config['toml'], {k: json.dumps(v) for k,v in config['contracts'].items()}, config['robot'], 0, config['trajectories'], True)
        heat = np.zeros(22)
        steps = [('balance', 0, 0, 3)]
        if after_forward:
            steps += [('forward', .24, 0, 8), ('balance-after-forward', 0, 0, 2)]
        steps += [('turn', 0, sign, 10), ('zero-command', 0, 0, 2)]
        commands = []
        min_height, max_tilt = math.inf, 0
        error = None
        try:
            for label, vx, yaw, duration in steps:
                origin = data.qpos[:3].copy()
                start_yaw = last_yaw = heading(data.qpos[3:7])
                rotation = 0
                seen_command = None
                for _ in range(round(duration / .005)):
                    now = round(data.time * 1e6)
                    fsm.set_state(data.qpos[qa].tolist(), data.qvel[va].tolist(), data.qfrc_actuator[va].tolist(), data.xquat[body].tolist(), data.sensordata[:3].tolist(), now)
                    rx = 0 if yaw == 0 else -math.copysign(.5 + abs(yaw)/8, yaw)
                    fsm.set_pad_frame([], {'Lx':0, 'Ly':-vx/.8, 'Rx':rx, 'Ry':0, 'LT':0, 'RT':0}, now_us=now)
                    fsm.set_command(0,0,0,now)
                    mode = fsm.tick(now)
                    if mode:
                        assert mode == 'locomotion', mode
                        obs = np.asarray([fsm.observation()], dtype=np.float32)
                        seen_command = dict(velocity=obs[0,306:309].tolist(), posture=obs[0,411:415].tolist(), rx=rx)
                        action = policy.run(None, {policy.get_inputs()[0].name:obs})[0][0]
                        fsm.resume(action.tolist())
                    target, kp, kd = np.array(fsm.positions()), np.array(fsm.kp()), np.array(fsm.kd())
                    for _ in range(5):
                        v = data.qvel[va]
                        rpm = abs(v)*60/(2*math.pi)
                        limit = np.minimum(curve['plateau'] * np.exp(-np.maximum(0,rpm-curve['cornerRpm'])/curve['decayRpm']), np.where(heat>=1,curve['continuous'],curve['plateau']))
                        limit[rpm>=curve['cutoffRpm']] = 0
                        effort = np.clip(kp*(target-data.qpos[qa])-kd*v,-limit,limit)
                        data.ctrl[:] = effort
                        heat = np.maximum(0,heat+((effort/curve['continuous'])**2-heat)*.001/tau)
                        mujoco.mj_step(model,data)
                        min_height = min(min_height,float(data.qpos[2]))
                        upright = 1-2*(data.qpos[4]**2+data.qpos[5]**2)
                        max_tilt = max(max_tilt,math.acos(float(np.clip(upright,-1,1))))
                        assert np.isfinite(data.qpos).all() and data.qpos[2]>=.065 and upright>=math.cos(.873), 'Walking envelope exceeded'
                    current = heading(data.qpos[3:7])
                    rotation += math.atan2(math.sin(current-last_yaw),math.cos(current-last_yaw))
                    last_yaw = current
                delta = data.qpos[:3]-origin
                commands.append(dict(label=label, requestedYaw=yaw, durationSeconds=duration, yawRadians=rotation, displacementMeters=float(np.linalg.norm(delta[:2])), forwardDisplacementMeters=float(delta[0]*math.cos(start_yaw)+delta[1]*math.sin(start_yaw)), observedCommand=seen_command))
        except Exception as cause:
            error = str(cause)
        runs.append(dict(afterForward=after_forward,sign=sign,error=error,minHeight=min_height,maxTiltRadians=max_tilt,simulatedSeconds=data.time,commands=commands))
        print(json.dumps(runs[-1]))
report = dict(executedAt=datetime.now(timezone.utc).isoformat(),kind='Independent native Jumper Rx mapping probe; not long-horizon parity',mujoco=mujoco.__version__,onnxruntime=ort.__version__,modelRevision=manifest['revision'],controllerSha256=metadata['files'][native_path]['sha256'],runs=runs)
(ROOT / 'docs/evidence/jumper-turns-native-probe.json').write_text(json.dumps(report,indent=2)+'\n')
