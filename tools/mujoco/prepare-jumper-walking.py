"""Export official Jumper physics and package the already verified controller bundle."""
from pathlib import Path
import json,hashlib,shutil,subprocess,os,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2];REV='78966f45de6f2b6de3f7cea017f32a39f8b993e6';source=ROOT/f'tmp/mujoco-audit/jumper-{REV}';bundle=source/'out/bundle_example/jumper';exported=ROOT/'tmp/mujoco-validation/jumper.robot';dst=ROOT/'tmp/mujoco-web/jumper-walking'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    subprocess.run(['python3',str(ROOT/'tools/mujoco/prepare.py')],check=True)
    subprocess.run([str(ROOT/'tmp/mujoco-native/venv/bin/python'),str(source/'assets/jumper/tools/export_web_robot.py'),'--out',str(exported)],check=True,env=os.environ|{'MPLCONFIGDIR':str(ROOT/'tmp/mujoco-native/matplotlib'),'GIT_CEILING_DIRECTORIES':str(source.parent)})
    b=json.loads((bundle/'bundle.json').read_text())
    for n,r in b['files'].items():
        if sha(bundle/n)!=r['sha256'] or (bundle/n).stat().st_size!=r['bytes']:raise ValueError(f'Bundle mismatch: {n}')
    contracts={n:json.loads((bundle/v['contract']).read_text()) for n,v in b['modes'].items()};c=contracts['locomotion'];names=c['wire_joint_order'];robot=dict(joint_names=names,joint_pos_lo=[c['joint_limits'][n][0] for n in names],joint_pos_hi=[c['joint_limits'][n][1] for n in names],output_rate_hz=200)
    config=dict(toml=(bundle/'controller.toml').read_text(),contracts=contracts,robot=robot,trajectories={n:(bundle/v['trajectory']).read_text() for n,v in b['modes'].items() if 'trajectory' in v})
    dst.mkdir(parents=True,exist_ok=True);assets=[]
    def publish(src,name,origin):
        p=dst/name;p.parent.mkdir(parents=True,exist_ok=True)
        if p!=src:shutil.copyfile(src,p)
        assets.append(dict(path=name,url=f'/simulation-assets/jumper-walking/{name}',sha256=sha(p),bytes=p.stat().st_size,source=origin))
    xml=ET.parse(exported/'model.xml').getroot();xml.find('compiler').set('meshdir','');xml.find('option').set('timestep',str(c['control']['sim_dt']))
    for mesh in xml.findall('asset/mesh'):publish(exported/'meshes'/mesh.get('file'),mesh.get('file'),f'KingKongRobotics/jumper@{REV}/export_web_robot.py')
    ET.SubElement(xml.find('worldbody'),'geom',name='floor',type='plane',size='0 0 .05',rgba='.15 .18 .23 1')
    act=ET.SubElement(xml,'actuator')
    for n in names:ET.SubElement(act,'motor',name=n,joint=n,gear='1',ctrlrange='-1.7464 1.7464',ctrllimited='true')
    sensor=ET.SubElement(xml,'sensor');ET.SubElement(sensor,'gyro',name='gyro',site='imu')
    ET.indent(xml);ET.ElementTree(xml).write(dst/'walking.xml',encoding='utf-8',xml_declaration=True);publish(dst/'walking.xml','walking.xml','Official exporter + bundle physics timestep, BotLab motors/gyro/floor')
    (dst/'controller-config.json').write_text(json.dumps(config,indent=2)+'\n');publish(dst/'controller-config.json','controller-config.json',f'Jumper verified bundle@{REV}')
    for n,name in [('runtime/web/controller.js','controller.js'),('runtime/web/controller.wasm','controller.wasm'),('models/locomotion.onnx','locomotion.onnx')]:publish(bundle/n,name,b['files'][n]['sha256'])
    for n in ['LICENSE','NOTICE']:publish(source/n,n,f'KingKongRobotics/jumper@{REV}/{n}')
    jointProbe=json.loads((ROOT/'tmp/mujoco-web/jumper/manifest.json').read_text())
    joints=[dict(name=n,min=c['joint_limits'][n][0],max=c['joint_limits'][n][1],home=c['default_joint_pos'][n],kp=c['control']['kp'],kd=c['control']['kd'],effortLimit=c['control']['effort_limit']) for n in names]
    m=dict(schemaVersion=1,id='jumper-walking',robotId='jumper',revision=REV,mujocoVersion='3.11.0',scene='walking.xml',assets=assets,joints=joints,servoCurve=jointProbe['servoCurve'],initialKeyframe='init_state',rootBody='base_link',gyroSensor='gyro',evidenceLevel='closed-loop-policy',variant='flat-ground-locomotion',limitations=['Forward walking and measured 90-degree turns on flat ground; no strafe, reverse, jump or other modes exposed.'],controller=dict(id='jumper-locomotion',model='locomotion.onnx',decimation=5,observationSize=415,actionSize=20))
    (dst/'manifest.json').write_text(json.dumps(m,indent=2)+'\n');print(json.dumps(dict(manifest=str(dst/'manifest.json'),sha256=sha(dst/'manifest.json'))))
    subprocess.run(['python3',str(ROOT/'tools/mujoco/prepare-jumper-depth.py')],check=True)
if __name__=='__main__':main()
