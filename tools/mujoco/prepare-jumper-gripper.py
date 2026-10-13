"""Add the pinned five-foot policy for explicit claw preparation and motion."""
from pathlib import Path
import hashlib
import json
import shutil
ROOT = Path(__file__).resolve().parents[2]
REV = '78966f45de6f2b6de3f7cea017f32a39f8b993e6'
SHA = '69e4b98a6e25b5f86d17d4ffdf9996df806b901217cecba96e43993ce61020b0'
BASES = {'manifest-performances':'6cf3406e2e5d13e418241780411ea2283be0852c95591ee4164092a7c76c4d22', 'obstacles-manifest-performances':'70e7cde85317c0156b7a12b39dbc97905a6fc5b6439fa731a3d476f38645652a'}
def prepare():
    dst = ROOT / 'tmp/mujoco-web/jumper-walking'
    src = ROOT / f'tmp/mujoco-audit/jumper-{REV}/out/bundle_example/jumper/models/claw_left.onnx'
    if hashlib.sha256(src.read_bytes()).hexdigest() != SHA:
        raise ValueError('Claw policy mismatch')
    shutil.copyfile(src, dst / src.name)
    for name, sha in BASES.items():
        source = dst / (name + '.json')
        if hashlib.sha256(source.read_bytes()).hexdigest() != sha:
            raise ValueError('Base manifest mismatch')
        manifest = json.loads(source.read_text())
        manifest['id'] += '-gripper'
        manifest['assets'].append(dict(path=src.name, url=f'/simulation-assets/jumper-walking/{src.name}', sha256=SHA, bytes=src.stat().st_size, source=f'Jumper verified bundle@{REV}/models/{src.name}'))
        manifest['limitations'] = ['Fixed official skills and empty-claw opening/closing with observed posture; no object-grasping or hardware claim. Interrupted manipulator motion requires explicit reset.']
        out = dst / (name.replace('-performances','-gripper') + '.json')
        out.write_text(json.dumps(manifest, indent=2) + '\n')
        print(out.name, hashlib.sha256(out.read_bytes()).hexdigest())
if __name__ == '__main__':
    prepare()
