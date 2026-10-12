"""Build a small physical corridor around the pinned MicroDuck scene."""
from pathlib import Path
import xml.etree.ElementTree as ET

from .session import RL


SCENE = RL / 'src/mjlab_microduck/robot/microduck/scene.xml'


def write_circuit_scene(destination: Path) -> Path:
    tree = ET.parse(SCENE)
    root = tree.getroot()
    include = root.find('include')
    world = root.find('worldbody')
    if include is None or world is None:
        raise ValueError('Pinned MicroDuck scene has no robot include or worldbody.')
    include.set('file', str(SCENE.parent / include.attrib['file']))
    # Robot starts at (0, 0), facing +X. The first barrier leaves an opening
    # to the left, then the second barrier makes the path bend right.
    walls = (
        ('right-rail', '0.45 -0.55 0.17', '0.78 0.035 0.17', '0.22 0.44 0.74 1'),
        ('left-rail', '-0.15 0.55 0.17', '0.37 0.035 0.17', '0.22 0.44 0.74 1'),
        ('first-barrier', '1.17 -0.16 0.17', '0.035 0.39 0.17', '0.95 0.42 0.22 1'),
        ('outer-left', '1.12 1.11 0.17', '0.035 0.60 0.17', '0.22 0.44 0.74 1'),
        ('second-barrier', '0.55 1.67 0.17', '0.58 0.035 0.17', '0.95 0.42 0.22 1'),
    )
    for name, pos, size, color in walls:
        ET.SubElement(world, 'geom', name=f'botlab-{name}', type='box',
                      pos=pos, size=size, rgba=color, contype='1', conaffinity='1')
    destination.parent.mkdir(parents=True, exist_ok=True)
    assets = destination.parent / 'assets'
    if not assets.exists():
        assets.symlink_to(SCENE.parent / 'assets', target_is_directory=True)
    tree.write(destination, encoding='unicode')
    return destination
