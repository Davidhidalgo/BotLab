"""Prepare verified, probe-only policies; does not enable product capabilities."""
from pathlib import Path
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[2]
bundle=ROOT/'tmp/mujoco-audit/jumper-78966f45de6f2b6de3f7cea017f32a39f8b993e6/out/bundle_example/jumper'
dst=ROOT/'tmp/mujoco-web/jumper-walking/probes';dst.mkdir(exist_ok=True)
b=json.loads((bundle/'bundle.json').read_text());modes={}
for name,mode in b['modes'].items():
 rel=mode['models']['onnx'];p=bundle/rel;sha=hashlib.sha256(p.read_bytes()).hexdigest()
 if sha!=b['files'][rel]['sha256']:raise ValueError('Policy checksum mismatch')
 shutil.copyfile(p,dst/p.name)
 modes[name]=dict(path=p.name,sha256=sha,observation=mode['observation'])
(dst/'modes.json').write_text(json.dumps(modes,indent=2)+'\n')
print('Verified',len(modes),'modes for probes only')
