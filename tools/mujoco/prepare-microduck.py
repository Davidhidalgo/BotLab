"""Prepare MicroDuck flat-ground WASM scene; no native service is needed at runtime."""
from pathlib import Path
import hashlib,json,shutil,tarfile,urllib.request,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
REV='363b7effd4eae9f24dd1bb8bf647aef4d74edca9'
ARCHIVE_SHA='6948c7943c9220dec22ebcca8f6e441c8469395ec83d29e17a2196db023c94c0'
POLICY_REV='916c1e1ee11f8460506532e037a4cf1aa110aca6'
POLICY_SHA='e36332d383997d51401897734cd3e79cf5038406feddb18b4d57ecfb141daa6c'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    cache=ROOT/'tmp/mujoco-audit';cache.mkdir(parents=True,exist_ok=True)
    archive=cache/'microduck_rl.tar.gz';existing=ROOT/'tmp/microduck-native/microduck_rl.tar.gz'
    if not archive.exists():
        if existing.exists():shutil.copyfile(existing,archive)
        else:urllib.request.urlretrieve(f'https://codeload.github.com/pollen-robotics/microduck_rl/tar.gz/{REV}',archive)
    if sha(archive)!=ARCHIVE_SHA:raise ValueError('MicroDuck model archive hash mismatch')
    source=cache/f'microduck_rl-{REV}'
    with tarfile.open(archive) as package:
        for m in package.getmembers():
            target=(cache/m.name).resolve()
            if not target.is_relative_to(source.resolve()):raise ValueError('Unsafe archive path')
            if m.isdir():target.mkdir(parents=True,exist_ok=True)
            elif m.isfile():
                target.parent.mkdir(parents=True,exist_ok=True)
                with package.extractfile(m) as src,target.open('wb') as dst:shutil.copyfileobj(src,dst)
            else:raise ValueError('Archive links are not supported')
    robot=source/'src/mjlab_microduck/robot/microduck'
    xml=ET.parse(robot/'robot_allcollisions.xml').getroot()
    # Same robot and 5 ms timestep as the pinned upstream browser, flat ground only.
    xml.find('compiler').set('meshdir','')
    ET.SubElement(xml,'option',timestep='0.005')
    ET.SubElement(xml.find('worldbody'),'geom',name='floor',type='plane',size='0 0 0.05',pos='0 0 0',rgba='.15 .18 .23 1')
    stand=ET.parse(robot/'scene_walk.xml').getroot().find("keyframe/key[@name='STAND']")
    stand.set('name','initial');ET.SubElement(xml,'keyframe').append(stand)
    pose=list(map(float,stand.get('ctrl').split()))
    dst=ROOT/'tmp/mujoco-web/microduck';dst.mkdir(parents=True,exist_ok=True);assets=[]
    def publish(src,name,origin):
        p=dst/name;p.parent.mkdir(parents=True,exist_ok=True)
        if src!=p:shutil.copyfile(src,p)
        assets.append(dict(path=name,url=f'/simulation-assets/microduck/{name}',sha256=sha(p),bytes=p.stat().st_size,source=origin))
    for mesh in xml.findall('asset/mesh'):
        name=mesh.get('file');publish(robot/'assets'/name,name,f'pollen-robotics/microduck_rl@{REV}/assets/{name}')
    ET.indent(xml);ET.ElementTree(xml).write(dst/'flat-ground.xml',encoding='utf-8',xml_declaration=True)
    publish(dst/'flat-ground.xml','flat-ground.xml','tools/mujoco/prepare-microduck.py')
    policy=cache/'microduck-alpha-walking.onnx';existing=ROOT/'tmp/microduck-native/policies/current/alpha_walking.onnx'
    if not policy.exists():
        if existing.exists():shutil.copyfile(existing,policy)
        else:urllib.request.urlretrieve(f'https://huggingface.co/pollen-robotics/microduck-policies/resolve/{POLICY_REV}/alpha_walking.onnx',policy)
    if sha(policy)!=POLICY_SHA:raise ValueError('MicroDuck policy hash mismatch')
    publish(policy,'alpha-walking.onnx',f'https://huggingface.co/pollen-robotics/microduck-policies/blob/{POLICY_REV}/alpha_walking.onnx')
    publish(source/'LICENSE','LICENSE',f'pollen-robotics/microduck_rl@{REV}/LICENSE')
    joints=[]
    for i,act in enumerate(xml.findall('actuator/position')):
        name=act.get('joint');joint=xml.find(f".//joint[@name='{name}']");lo,hi=map(float,joint.get('range').split())
        joints.append(dict(name=name,min=lo,max=hi,home=pose[i],kp=.55,kd=0,effortLimit=.96))
    manifest=dict(schemaVersion=1,id='microduck-flat-ground',robotId='microduck',revision=REV,mujocoVersion='3.11.0',scene='flat-ground.xml',assets=assets,joints=joints,actuation='position',initialKeyframe='initial',rootBody='trunk_base',gyroSensor='imu_ang_vel',evidenceLevel='closed-loop-policy',variant='flat-ground-alpha-walking',limitations=['Flat ground; walking only. No sit, recovery, depth camera or hardware support.'],controller=dict(id='microduck-alpha-walking',model='alpha-walking.onnx',decimation=4,observationSize=61,actionSize=14))
    (dst/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(dict(manifest=str(dst/'manifest.json'),sha256=sha(dst/'manifest.json'),assets=len(assets))))
if __name__=='__main__':main()
