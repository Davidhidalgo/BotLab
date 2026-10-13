"""Add verified MicroDuck kick and ground-pick policies to separate web manifests."""
from pathlib import Path
import hashlib
import json
import shutil
import urllib.request
ROOT=Path(__file__).resolve().parents[2]
REV='916c1e1ee11f8460506532e037a4cf1aa110aca6'
POLICIES={'ball_kick_left.onnx':'d6928284dccd3dd61e08bf2f760effa74309fbefd97b2b31afb2a60f526d196a','ball_kick_right.onnx':'147a32c388c6b19111b3ac3b550a9a6dc8b8bf267118af4d8c3712522eedb5af','alpha_ground_pick.onnx':'ffbf5109982ff999b0ba53afe86b9ae731bbec679d67fb7f8ab4c52152c88872'}
BASES={'manifest-posture':'958611d00fd8374eddb6edd25822d11a067b2c39abf9004ab6a99487ef3c7003','obstacles-manifest-posture':'9592d64a358bfc6515dc59c125e13f751c1e65ab359b86d8165cf84acb26c86e'}
def prepare():
 dst=ROOT/'tmp/mujoco-web/microduck';assets=[]
 for name,sha in POLICIES.items():
  src=ROOT/'tmp/microduck-native/policies/current'/name
  url=f'https://huggingface.co/pollen-robotics/microduck-policies/resolve/{REV}/{name}'
  if not src.exists():
   src=ROOT/'tmp/mujoco-audit'/name
   if not src.exists(): urllib.request.urlretrieve(url,src)
  if hashlib.sha256(src.read_bytes()).hexdigest()!=sha:raise ValueError(f'Policy checksum mismatch: {name}')
  shutil.copyfile(src,dst/name)
  assets.append(dict(path=name,url=f'/simulation-assets/microduck/{name}',sha256=sha,bytes=src.stat().st_size,source=url))
 for name,sha in BASES.items():
  src=dst/(name+'.json')
  if hashlib.sha256(src.read_bytes()).hexdigest()!=sha:raise ValueError('Base manifest mismatch')
  manifest=json.loads(src.read_text());manifest['assets']+=assets;manifest['id']+='-skills'
  manifest['limitations']=['Geometric simulation; measured walking, head yaw, sit/stand, kicks and ground gesture. No ball contact, object pickup, roll, recovery or hardware claim.']
  out=dst/(name.replace('-posture','-skills')+'.json');out.write_text(json.dumps(manifest,indent=2)+'\n');print(out.name,hashlib.sha256(out.read_bytes()).hexdigest())
if __name__=='__main__':prepare()
