"""Add SHA-pinned, complete-cycle audited gesture and dance policies."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[2]
REV='78966f45de6f2b6de3f7cea017f32a39f8b993e6'
POLICIES={
'dance_brazilian':'a8d0c471560cf3aabffab38e5750b20c99d569717d2b46df08e91bbc16553398',
'dance_crab':'2723a684d471cd377e781aff5d777a4e65ea48317bc39951ac2e5bf5fb56b011',
'dance_dream_wings':'11fdca3c4ae57aa8638608f3b70dd3a51d4d6435d68602b8a298562befb03690',
'dance_maze':'c5cd38038ee7ccf408cd9a76e55f624d393666fb743db35609e6ea114aaeae4a',
'gesture_bow':'14e5168ff39179f8539b600721375bcc2d3c049d60a38060044144ef871b55dd',
'gesture_hello':'64d17cd88f86063692a2276dbbf977c399f2ea018558b7b4d34b8f0bb1cecda8',
'gesture_paw':'bde0871a418ac2735fd320390be50a2a97b1cb4df5929ef46176d0763b1dae21',
'gesture_salute':'20fac8e4ee9d51fb8daa7d44e90fbed6c4e88aff907a13e7bfbae51fa7423f16'}
BASES={'manifest-jump':'2d8e6b968b37276cbbadcd793ab1289e5086df13b81bcc7aea48a837ab32836d','obstacles-manifest-jump':'e0652b31c4fec859173aba82c55e9a5ecb514b0c04b794d377af355bb3d62833'}
def prepare():
 dst=ROOT/'tmp/mujoco-web/jumper-walking';assets=[]
 for name,sha in POLICIES.items():
  src=ROOT/f'tmp/mujoco-audit/jumper-{REV}/out/bundle_example/jumper/models/{name}.onnx'
  if hashlib.sha256(src.read_bytes()).hexdigest()!=sha:raise ValueError('Performance policy mismatch')
  shutil.copyfile(src,dst/src.name)
  assets.append(dict(path=src.name,url=f'/simulation-assets/jumper-walking/{src.name}',sha256=sha,bytes=src.stat().st_size,source=f'Jumper verified bundle@{REV}/models/{src.name}'))
 for name,sha in BASES.items():
  src=dst/(name+'.json')
  if hashlib.sha256(src.read_bytes()).hexdigest()!=sha:raise ValueError('Base manifest mismatch')
  m=json.loads(src.read_text());m['id']+='-performances';m['assets']+=assets
  m['limitations']=['Fixed official jump, gestures and dances with observed settled return; no arbitrary uploaded skills, grasping or hardware claim. Interrupted performances require explicit reset.']
  out=dst/(name.replace('-jump','-performances')+'.json');out.write_text(json.dumps(m,indent=2)+'\n');print(out.name,hashlib.sha256(out.read_bytes()).hexdigest())
if __name__=='__main__':prepare()
