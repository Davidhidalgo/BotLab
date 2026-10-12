"""Prepare pinned Jumper resources in tmp/; never modify upstream source.

Run: python3 tools/mujoco/prepare.py
This prepares an explicitly fixed-base joint-control experiment, not the
training environment or a validated locomotion scene. No training code runs.
"""
from pathlib import Path
import ast
import hashlib
import json
import re
import shutil
import tarfile
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
REVISION = '78966f45de6f2b6de3f7cea017f32a39f8b993e6'
ARCHIVE_SHA256 = 'efd13ba4cf3ed25c1dcb4e2ee679927aac8b3ccda46b95a2ff12d26cf8d16c9f'
REPOSITORY = 'https://github.com/KingKongRobotics/jumper'
CACHE = ROOT / 'tmp/mujoco-audit'
SOURCE = CACHE / f'jumper-{REVISION}'
DESTINATION = ROOT / 'tmp/mujoco-web/jumper'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / 'jumper.tar.gz'
    if not archive.exists():
        partial = archive.with_suffix('.partial')
        urllib.request.urlretrieve(f'https://codeload.github.com/KingKongRobotics/jumper/tar.gz/{REVISION}', partial)
        if digest(partial) != ARCHIVE_SHA256:
            raise ValueError('Jumper archive hash mismatch')
        partial.replace(archive)
    if digest(archive) != ARCHIVE_SHA256:
        raise ValueError('Jumper archive hash mismatch')
    # Re-extract from the verified archive so an edited cache cannot change the pin.
    with tarfile.open(archive) as package:
        for member in package.getmembers():
            target = (CACHE / member.name).resolve()
            if not target.is_relative_to(SOURCE.resolve()):
                raise ValueError('Archive path escapes pinned checkout')
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                target.parent.mkdir(parents=True, exist_ok=True)
                with package.extractfile(member) as content, target.open('wb') as output:
                    shutil.copyfileobj(content, output)
            else:
                raise ValueError(f'Unsupported archive link: {member.name}')
    DESTINATION.mkdir(parents=True, exist_ok=True)
    bundle = SOURCE / 'out/bundle_example/jumper'
    bundle_manifest = json.loads((bundle / 'bundle.json').read_text())
    for name, expected in bundle_manifest['files'].items():
        resource = (bundle / name).resolve()
        if not resource.is_relative_to(bundle.resolve()):
            raise ValueError('Bundle path escapes directory')
        if resource.stat().st_size != expected['bytes'] or digest(resource) != expected['sha256']:
            raise ValueError(f'Bundle hash mismatch: {name}')
    contract = json.loads((bundle / 'locomotion.json').read_text())
    constants = ast.parse((SOURCE / 'tasks/jumper/common/constants.py').read_text())
    literal_constants = {}
    for item in constants.body:
        if isinstance(item, ast.Assign):
            for target in item.targets:
                if isinstance(target, ast.Name) and target.id in ('STAND_Z', 'STIFFNESS', 'DAMPING'):
                    literal_constants[target.id] = ast.literal_eval(item.value)
    model_path = SOURCE / 'assets/jumper/jumper.xml'
    xml = ET.fromstring(re.sub(r'<!--.*?-->', '', model_path.read_text(), flags=re.S))
    body = xml.find('worldbody/body')
    for free in list(body.findall('freejoint')) + list(body.findall("joint[@type='free']")):
        body.remove(free)
    # Stand height is pinned upstream; the base is fixed to isolate joint control.
    body.set('pos', f"0 0 {literal_constants['STAND_Z']}")
    # CAD meshes overlap at the hip roots. This isolated servo experiment
    # intentionally disables contacts; locomotion needs the training masks.
    for parent in body.iter():
        for geom in list(parent.findall('geom')):
            if geom.get('class') not in ('visual', 'collision'):
                parent.remove(geom)
            else:
                geom.set('contype', '0')
                geom.set('conaffinity', '0')
    compiler = xml.find('compiler')
    compiler.set('meshdir', '')
    compiler.set('autolimits', 'true')
    assets = []

    def publish(source, relative, source_path):
        target = DESTINATION / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        assets.append({'path': relative, 'url': f'/simulation-assets/jumper/{relative}',
                       'sha256': digest(target), 'bytes': target.stat().st_size,
                       'source': f'{REPOSITORY}/blob/{REVISION}/{source_path}'})

    for mesh in xml.findall('asset/mesh'):
        relative = mesh.get('file')
        publish(model_path.parent / relative, relative, f'assets/jumper/{relative}')
    # Keep the original contact parameters and timestep; this is a CAD-model
    # joint probe, not an unverified approximation of a training task.
    actuator = ET.SubElement(xml, 'actuator')
    joints = []
    for joint in body.iter('joint'):
        name = joint.get('name')
        low, high = map(float, joint.get('range').split())
        home = contract['default_joint_pos'][name]
        ET.SubElement(actuator, 'motor', name=name, joint=name, gear='1',
                      ctrllimited='true', ctrlrange=f"{-contract['control']['effort_limit']} {contract['control']['effort_limit']}")
        joints.append({'name': name, 'min': low, 'max': high, 'home': home,
                       'kp': contract['control']['kp'], 'kd': contract['control']['kd'],
                       'effortLimit': contract['control']['effort_limit']})
    # Plane/light are BotLab scene presentation, not calibrated robot parameters.
    ET.SubElement(xml.find('worldbody'), 'geom', name='floor', type='plane',
                  size='1 1 .01', rgba='.15 .18 .23 1', contype='0', conaffinity='0')
    keyframe = ET.SubElement(xml, 'keyframe')
    ET.SubElement(keyframe, 'key', name='initial', qpos=' '.join(str(j['home']) for j in joints))
    ET.indent(xml)
    scene = DESTINATION / 'joint-probe.xml'
    ET.ElementTree(xml).write(scene, encoding='utf-8', xml_declaration=True)
    assets.append({'path': scene.name, 'url': '/simulation-assets/jumper/joint-probe.xml',
                   'sha256': digest(scene), 'bytes': scene.stat().st_size,
                   'source': 'tools/mujoco/prepare.py; fixed-base variant of pinned jumper.xml'})
    for name in ('LICENSE', 'NOTICE'):
        publish(SOURCE / name, name, name)
    motor = (SOURCE / 'assets/jumper/motor/motor_config.yaml').read_text().split('joint_servo_100:')[0]
    def motor_number(name):
        match = re.search(rf'^\s+{name}:\s+([\d.]+)\s', motor, re.M)
        if match is None:
            raise ValueError(f'Missing servo parameter: {name}')
        return float(match[1])
    curve = {key: motor_number(source) for key, source in {
        'plateau': 'plateau_torque_nm', 'cornerRpm': 'corner_speed_rpm',
        'decayRpm': 'decay_speed_rpm', 'cutoffRpm': 'cutoff_speed_rpm',
        'continuous': 'thermal_continuous_torque_nm', 'peakSeconds': 'peak_duration_s',
    }.items()}
    manifest = {'schemaVersion': 1, 'id': 'jumper-joint-probe', 'robotId': 'jumper',
                'repository': REPOSITORY, 'revision': REVISION, 'mujocoVersion': '3.11.0',
                'scene': scene.name, 'assets': assets, 'joints': joints, 'servoCurve': curve,
                'evidenceLevel': 'physics', 'variant': 'fixed-base-joint-probe',
                'limitations': ['Fixed base; no locomotion or balance validation.',
                                'Sensors are not exposed by this joint-control target.',
                                'All contacts disabled to isolate servos from overlapping CAD meshes.'],
                'license': {'identifier': 'Apache-2.0', 'scope': 'Maintainer-owned model and meshes; see LICENSE and NOTICE'}}
    (DESTINATION / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    inventory = {'schemaVersion': 1, 'inspectedOn': '2026-10-12', 'jumper': {
        'repository': REPOSITORY, 'revision': REVISION, 'archiveSha256': ARCHIVE_SHA256,
        'modelSha256': digest(model_path), 'bundleSha256': digest(bundle / 'bundle.json'),
        'verifiedBundleFiles': len(bundle_manifest['files']),
        'controllerRevision': bundle_manifest['runtimes']['web']['commit'],
        'locomotion': bundle_manifest['files']['models/locomotion.onnx'],
        'contract': bundle_manifest['files']['locomotion.json'],
        'controllerWasm': bundle_manifest['files']['runtime/web/controller.wasm'],
        'policyLicense': 'Generated outputs do not automatically inherit repository license; redistribution pending review.',
        'executedByPreparation': False, 'executionEvidence': ['docs/evidence/mujoco-browser-validation.json', 'docs/evidence/jumper-walking-browser.json'], 'sceneVariant': manifest['variant'], 'generatedManifestSha256': digest(DESTINATION / 'manifest.json')},
        'microduck': {'browser': {'repository': 'https://huggingface.co/spaces/pollen-robotics/microduck-simulator',
                        'revision': '023172c8a7d629b5258d90364c13bafe013abbfa'},
                     'nativeDaemonRevision': 'e9cca6272f633dd9054dd0e021f356fe086e5be1',
                     'nativeBodyRevision': '363b7effd4eae9f24dd1bb8bf647aef4d74edca9',
                     'policyRevision': '916c1e1ee11f8460506532e037a4cf1aa110aca6',
                     'sharedBackendValidation': 'See docs/evidence/mujoco-browser-validation.json and mujoco-ui-validation.json; not executed by preparation'}}
    audit = ROOT / 'docs/evidence/mujoco-upstream-audit.json'
    audit.write_text(json.dumps(inventory, indent=2) + '\n')
    print(json.dumps({'manifest': str(DESTINATION / 'manifest.json'), 'assets': len(assets),
                      'joints': len(joints), 'bundleFilesVerified': len(bundle_manifest['files'])}))


if __name__ == '__main__':
    main()
