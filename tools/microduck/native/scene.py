import xml.etree.ElementTree as ET
from probe import ROOT, RL

def obstacle_scene():
    modeldir = RL / 'src/mjlab_microduck/robot/microduck'
    scene = ET.parse(modeldir / 'scene.xml').getroot()
    inc = scene.find('include')
    scene.remove(inc)
    robot = ET.parse(modeldir / 'robot_allcollisions.xml').getroot()
    robot.find('compiler').set('meshdir', str(modeldir / 'assets'))
    for child in reversed(list(robot)):
        scene.insert(0, child)
    ET.SubElement(scene.findall('worldbody')[-1], 'geom', {'name': 'botlab_obstacle', 'type': 'box', 'pos': '0.85 0 0.5', 'size': '0.025 2 0.5', 'rgba': '0.85 0.25 0.1 1'})
    scene_path = ROOT / 'obstacle.xml'
    ET.ElementTree(scene).write(scene_path)
    return scene_path
