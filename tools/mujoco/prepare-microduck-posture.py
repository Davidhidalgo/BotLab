"""Add a pinned sit/stand policy to separate MicroDuck web manifests."""
from pathlib import Path
import hashlib
import json
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
REV = '916c1e1ee11f8460506532e037a4cf1aa110aca6'
SHA = 'c6c40e35e726eabd803d633e090d112994f469921152448367953fbaf9799bc8'
BASES = {'manifest': '50f88e703fefd010294a7a46b13e2dc8d1654b3a7c834c82f2449611115f45ed', 'obstacles-manifest': '106f20379cc467f9e67cb396ffafd414efbc764ebdb522a3b729a2f9f964dde0'}

def prepare():
    dst = ROOT / 'tmp/mujoco-web/microduck'
    policy = ROOT / 'tmp/microduck-native/policies/current/alpha_sitstand.onnx'
    url = f'https://huggingface.co/pollen-robotics/microduck-policies/resolve/{REV}/alpha_sitstand.onnx'
    if not policy.exists():
        policy = ROOT / 'tmp/mujoco-audit/alpha-sitstand.onnx'
        if not policy.exists(): urllib.request.urlretrieve(url, policy)
    if hashlib.sha256(policy.read_bytes()).hexdigest() != SHA: raise ValueError('Sit/stand policy checksum mismatch')
    shutil.copyfile(policy, dst / 'alpha-sitstand.onnx')
    for name, digest in BASES.items():
        base = dst / (name + '.json')
        if hashlib.sha256(base.read_bytes()).hexdigest() != digest: raise ValueError('Base manifest mismatch')
        manifest = json.loads(base.read_text())
        manifest['assets'].append(dict(path='alpha-sitstand.onnx', url='/simulation-assets/microduck/alpha-sitstand.onnx', sha256=SHA, bytes=policy.stat().st_size, source=url))
        manifest['id'] += '-posture'
        manifest['limitations'] = ['Geometric simulation; measured walk, head yaw and explicit sit/stand only. No recovery or hardware support.']
        output = dst / (name + '-posture.json')
        output.write_text(json.dumps(manifest, indent=2) + '\n')
        print(output.name, hashlib.sha256(output.read_bytes()).hexdigest())

if __name__ == '__main__': prepare()
