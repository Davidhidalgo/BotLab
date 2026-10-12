"""Independent native MuJoCo/ORT reference for the shared web backend (no services)."""
from pathlib import Path
import json,time,platform,hashlib,math
import mujoco,numpy as np,onnxruntime as ort
ROOT=Path(__file__).resolve().parents[2]
def microduck(seconds=60):
    root=ROOT/'tmp/mujoco-web/microduck';manifest=json.loads((root/'manifest.json').read_text());m=mujoco.MjModel.from_xml_path(str(root/manifest['scene']));d=mujoco.MjData(m)
    mujoco.mj_resetDataKeyframe(m,d,m.key('initial').id)
    names=[j['name'] for j in manifest['joints']];qa=[m.joint(n).qposadr[0] for n in names];va=[m.joint(n).dofadr[0] for n in names];home=np.array([j['home'] for j in manifest['joints']],dtype=np.float32);previous=np.zeros(14,dtype=np.float32)
    gyro=m.sensor('imu_ang_vel').adr[0];body=m.body('trunk_base').id
    policy=ort.InferenceSession(str(root/'alpha-walking.onnx'),providers=['CPUExecutionProvider']);samples=[];vectors=[];begin=time.monotonic()
    mujoco.mj_forward(m,d)
    for tick in range(round(seconds/.02)):
        t=tick*.02;forward=.25 if 5<=t<25 else 0;yaw=1 if 30<=t<40 else 0
        w,x,y,z=d.xquat[body];gravity=[2*(w*y-x*z),-2*(y*z+w*x),-(1-2*(x*x+y*y))]
        obs=np.concatenate([d.sensordata[gyro:gyro+3],gravity,d.qpos[qa]-home,d.qvel[va],previous,[forward,0,yaw]+[0]*10]).astype(np.float32)
        action=policy.run(None,{policy.get_inputs()[0].name:obs.reshape(1,61)})[0].reshape(14);previous=action.copy();d.ctrl[:]=home.astype(np.float64)+action.astype(np.float64)
        if tick in (0,1,50,251,501,1501):vectors.append(dict(t=t,observation=obs.tolist(),action=action.tolist()))
        for _ in range(4):mujoco.mj_step(m,d)
        if tick%50==49:samples.append(dict(t=round(d.time,6),p=d.qpos[:3].tolist(),q=d.qpos[3:7].tolist(),j=d.qpos[qa].tolist()))
        if not np.isfinite(d.qpos).all():raise ValueError('Native physics diverged')
    return dict(samples=samples,vectors=vectors,wallSeconds=time.monotonic()-begin,final=d.qpos[:7].tolist())
def jumper():
    root=ROOT/'tmp/mujoco-web/jumper';c=json.loads((root/'manifest.json').read_text());m=mujoco.MjModel.from_xml_path(str(root/c['scene']));d=mujoco.MjData(m)
    qa=[m.joint(j['name']).qposadr[0] for j in c['joints']];va=[m.joint(j['name']).dofadr[0] for j in c['joints']]
    joints=c['joints'];kp=np.array([j['kp'] for j in joints]);kd=np.array([j['kd'] for j in joints]);homes=np.array([j['home'] for j in joints]);curve=c['servoCurve'];tau=curve['peakSeconds']/math.log(1/(1-(curve['continuous']/curve['plateau'])**2));targetIndex=[j['name'] for j in joints].index('LM_J0_joint');runs=[]
    for run in range(3):
        mujoco.mj_resetData(m,d);d.qpos[qa]=homes;heat=np.zeros(len(joints));samples=[];mujoco.mj_forward(m,d)
        for tick in range(60000):
            target=homes.copy()
            if 1000<=tick<4000:target[targetIndex]=.2
            velocity=d.qvel[va];rpm=abs(velocity)*60/(2*math.pi);limit=np.minimum(curve['plateau']*np.exp(-np.maximum(0,rpm-curve['cornerRpm'])/curve['decayRpm']),np.where(heat>=1,curve['continuous'],curve['plateau']));limit[rpm>=curve['cutoffRpm']]=0
            effort=np.clip(kp*(target-d.qpos[qa])-kd*velocity,-limit,limit);d.ctrl[:]=effort;heat=np.maximum(0,heat+((effort/curve['continuous'])**2-heat)*.001/tau);mujoco.mj_step(m,d)
            if tick in (0,999,1999,3999,4999,59999):samples.append(dict(t=d.time,q=d.qpos[qa].tolist()))
            if not np.isfinite(d.qpos).all():raise ValueError('Native joint physics diverged')
        runs.append(samples)
    return dict(runs=runs,repeatMaxError=max(abs(a-b) for sampleA,sampleB in zip(runs[0],runs[2]) for a,b in zip(sampleA['q'],sampleB['q'])))
if __name__=='__main__':
    report=dict(platform=platform.platform(),python=platform.python_version(),mujoco=mujoco.__version__,onnxruntime=ort.__version__,tolerances=dict(physicsShortHorizonAbs=1e-5,inferenceAbs=1e-5,inferenceRel=1e-4,jointPositionRadians=.02),jumper=jumper(),microduck=microduck())
    (ROOT/'tmp/mujoco-native/reference.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k not in ('jumper','microduck')}));print('MicroDuck final:',report['microduck']['final'])
