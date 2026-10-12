"""Validate shipped native controller vectors and prepare browser parity inputs."""
from pathlib import Path
import importlib.util,json,shutil,hashlib
import numpy as np,onnxruntime as ort
ROOT=Path(__file__).resolve().parents[2]
b=ROOT/'tmp/mujoco-audit/jumper-78966f45de6f2b6de3f7cea017f32a39f8b993e6/out/bundle_example/jumper'
bundle=json.loads((b/'bundle.json').read_text())
for name,record in bundle['files'].items():
    p=b/name
    if p.stat().st_size!=record['bytes'] or hashlib.sha256(p.read_bytes()).hexdigest()!=record['sha256']:raise ValueError(f'Hash mismatch: {name}')
s=importlib.util.spec_from_file_location('mjrl_fsm',b/'runtime/mjlab/macosx-universal2/controller.so');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
contracts={name:json.loads((b/entry['contract']).read_text()) for name,entry in bundle['modes'].items()}
c=contracts['locomotion'];robot=dict(joint_names=c['wire_joint_order'],joint_pos_lo=[c['joint_limits'][j][0] for j in c['wire_joint_order']],joint_pos_hi=[c['joint_limits'][j][1] for j in c['wire_joint_order']],output_rate_hz=200)
trajectories={name:(b/entry['trajectory']).read_text() for name,entry in bundle['modes'].items() if 'trajectory' in entry}
f=m.Fsm((b/'controller.toml').read_text(),{n:json.dumps(c) for n,c in contracts.items()},robot,0,trajectories,True)
r=f.check_reference((b/'reference.json').read_text());report={k:getattr(r,k) for k in ['frames','inferences','mode_mismatches','observation','target']}
assert not report['mode_mismatches'] and max(report['observation'],report['target'])<1e-6
policy=ort.InferenceSession(str(b/'models/locomotion.onnx'),providers=['CPUExecutionProvider']);vectors=[];worst=0
for frame in json.loads((b/'reference.json').read_text())['frames']:
    if frame.get('infer')!='locomotion':continue
    obs=np.asarray(frame['obs'],dtype=np.float32).reshape(1,415);action=policy.run(None,{policy.get_inputs()[0].name:obs})[0].reshape(-1)
    expected=np.asarray(frame['act']);error=np.max(abs(action-expected));worst=max(worst,float(error))
    vectors.append(dict(observation=frame['obs'],nativeAction=action.tolist(),recordedAction=frame['act']))
# Test-only resources live outside production assets to avoid bundling unreviewed generated weights.
dst=ROOT/'tmp/mujoco-validation';dst.mkdir(parents=True,exist_ok=True)
for source,name in [('runtime/web/controller.js','controller.js'),('runtime/web/controller.wasm','controller.wasm'),('models/locomotion.onnx','locomotion.onnx')]:shutil.copyfile(b/source,dst/name)
inputs=dict(contracts=contracts,robot=robot,trajectories=trajectories,toml=(b/'controller.toml').read_text(),reference=(b/'reference.json').read_text(),vectors=vectors,nativeReport=report,nativeVsRecordedMaxAbs=worst)
(dst/'jumper-reference.json').write_text(json.dumps(inputs)+'\n')
print(json.dumps(dict(controller=report,inferenceFrames=len(vectors),nativeVsRecordedMaxAbs=worst)))
