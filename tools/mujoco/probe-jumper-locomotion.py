"""Bounded native gate for the shipped bundle plus the official exported robot."""
from pathlib import Path
import importlib.util,json,math,xml.etree.ElementTree as ET
import mujoco,numpy as np,onnxruntime as ort
ROOT=Path(__file__).resolve().parents[2];base=ROOT/'tmp/mujoco-validation';b=ROOT/'tmp/mujoco-audit/jumper-78966f45de6f2b6de3f7cea017f32a39f8b993e6/out/bundle_example/jumper'
inputs=json.loads((base/'jumper-reference.json').read_text());c=inputs['contracts']['locomotion'];robot=inputs['robot'];xml=ET.parse(base/'jumper.robot/model.xml').getroot();xml.find('compiler').set('meshdir',str(base/'jumper.robot/meshes'));xml.find('option').set('timestep',str(c['control']['sim_dt']))
ET.SubElement(xml.find('worldbody'),'geom',name='floor',type='plane',size='0 0 .05')
act=ET.SubElement(xml,'actuator')
for name in robot['joint_names']:ET.SubElement(act,'motor',name=name,joint=name,gear='1',ctrlrange='-1.7464 1.7464',ctrllimited='true')
sensor=ET.SubElement(xml,'sensor');ET.SubElement(sensor,'gyro',name='gyro',site='imu')
m=mujoco.MjModel.from_xml_string(ET.tostring(xml,encoding='unicode'));d=mujoco.MjData(m);mujoco.mj_resetDataKeyframe(m,d,m.key('init_state').id);mujoco.mj_forward(m,d)
qa=[m.joint(j).qposadr[0] for j in robot['joint_names']];va=[m.joint(j).dofadr[0] for j in robot['joint_names']]
s=importlib.util.spec_from_file_location('mjrl_fsm',b/'runtime/mjlab/macosx-universal2/controller.so');mod=importlib.util.module_from_spec(s);s.loader.exec_module(mod)
f=mod.Fsm(inputs['toml'],{n:json.dumps(v) for n,v in inputs['contracts'].items()},robot,0,inputs['trajectories'],True)
policy=ort.InferenceSession(str(b/'models/locomotion.onnx'),providers=['CPUExecutionProvider'])
curve=json.loads((ROOT/'tmp/mujoco-web/jumper/manifest.json').read_text())['servoCurve'];heat=np.zeros(22);tau=curve['peakSeconds']/math.log(1/(1-(curve['continuous']/curve['plateau'])**2))
samples=[];inferences=0;failed=None
for tick in range(4000):
    now=tick*5000;t=now/1e6
    f.set_state(d.qpos[qa].tolist(),d.qvel[va].tolist(),d.qfrc_actuator[va].tolist(),d.xquat[m.body('base_link').id].tolist(),d.sensordata[:3].tolist(),now)
    f.set_pad_frame([],{"Lx":0,"Ly":-.3 if 5<=t<15 else 0,"Rx":0,"Ry":0,"LT":0,"RT":0},now_us=now)
    f.set_command(0,0,0,now)
    mode=f.tick(now)
    if mode:
        if mode!='locomotion':failed=f'Unexpected inference mode: {mode}';break
        action=policy.run(None,{policy.get_inputs()[0].name:np.asarray([f.observation()],dtype=np.float32)})[0][0];f.resume(action.tolist());inferences+=1
    targets=np.array(f.positions());kp=np.array(f.kp());kd=np.array(f.kd())
    for sub in range(5):
        v=d.qvel[va];rpm=abs(v)*60/(2*math.pi);limit=np.minimum(curve['plateau']*np.exp(-np.maximum(0,rpm-curve['cornerRpm'])/curve['decayRpm']),np.where(heat>=1,curve['continuous'],curve['plateau']));limit[rpm>=curve['cutoffRpm']]=0
        effort=np.clip(kp*(targets-d.qpos[qa])-kd*v,-limit,limit);d.ctrl[:]=effort;heat=np.maximum(0,heat+((effort/curve['continuous'])**2-heat)*.001/tau);mujoco.mj_step(m,d)
    if tick%200==199:samples.append(dict(t=d.time,p=d.qpos[:3].tolist(),q=d.qpos[3:7].tolist(),mode=f.mode,running=f.running_policy,poseError=float(np.max(abs(targets-d.qpos[qa])))))
    if not np.isfinite(d.qpos).all() or d.qpos[2]<.065:failed='Base height below 0.065 m or non-finite state';break
report=dict(sourceRevision='78966f45de6f2b6de3f7cea017f32a39f8b993e6',scene='Official exporter model + floor + motors + bundle sim_dt=0.001',initialGate=dict(minHeightMeters=.065,maxSeconds=20),inferences=inferences,failure=failed,samples=samples)
(ROOT/'docs/evidence/jumper-locomotion-native-probe.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
