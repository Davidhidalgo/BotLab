"""BotLab geometric preview from Jumper's own camera; no upstream files changed."""
from pathlib import Path
import hashlib,json,math,xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[2]
def prepare():
    dst=ROOT/'tmp/mujoco-web/jumper-walking'
    m=json.loads((dst/'manifest.json').read_text())
    for a in m['assets']:
        if hashlib.sha256((dst/a['path']).read_bytes()).hexdigest()!=a['sha256']:raise ValueError('Base resource mismatch')
    xml=ET.parse(dst/m['scene']).getroot()
    body=xml.find(".//body[@name='tof_sensor_link']");camera=body.find("camera[@name='tof']")
    if camera is None or camera.get('quat')!='0.5 0.5 -0.5 -0.5':raise ValueError('Unknown ToF mounting')
    ET.SubElement(body,'site',name='botlab_tof',pos=camera.get('pos'),size='.001',rgba='0 0 0 0')
    world=xml.find('worldbody')
    ET.SubElement(world,'geom',name='tof_front_wall',type='box',pos='1.6 0 .6',size='.08 .45 .6',rgba='.22 .55 .72 1')
    ET.SubElement(world,'geom',name='tof_rear_wall',type='box',pos='2.5 .3 .6',size='.08 .8 .6',rgba='.85 .55 .2 1')
    ET.indent(xml);path=dst/'obstacles.xml';ET.ElementTree(xml).write(path,encoding='utf-8',xml_declaration=True)
    width,height=map(int,camera.get('resolution').split());sx,sy=map(float,camera.get('sensorsize').split())
    m['assets']=[a for a in m['assets'] if a['path']!=m['scene']]+[dict(path=path.name,url='/simulation-assets/jumper-walking/'+path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,source='tools/mujoco/prepare-jumper-depth.py')]
    m.update(id='jumper-obstacles-tof',scene=path.name,variant='obstacles-locomotion-tof',depthSensor=dict(id='front-tof',site='botlab_tof',rows=height//6,columns=width//6,horizontalFovRadians=2*math.atan(sx/2),verticalFovRadians=2*math.atan(sy/2),projection='pinhole',minRangeMeters=.05,maxRangeMeters=8.8,frequencyHz=15),limitations=['Geometric 9x7 preview of upstream 54x42 dToF mounting/FOV, sampled at 15 simulated Hz. Range from camera eye, no optical noise or automatic avoidance. Not hardware emulation.'])
    path=dst/'obstacles-manifest.json';path.write_text(json.dumps(m,indent=2)+'\n')
    print(hashlib.sha256(path.read_bytes()).hexdigest())
if __name__=='__main__':prepare()
