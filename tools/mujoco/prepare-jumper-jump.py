"""Package the verified official jump policy without modifying walking manifests."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[2]
REV='78966f45de6f2b6de3f7cea017f32a39f8b993e6'
SHA='1822601bd4c3696633d1bd7faf59c21988906ad75cc2c41f595375611313d79d'
BASES={'manifest':'aeec1ff2435981ccff8cf426c732ea34141bcbbb65cc505dcf2fe2fa9b4d41f1','obstacles-manifest':'76df9ffad55240995f1d06ba30e645a3cd41c0a7e776cf8c32afce0aca84e712'}
def prepare():
 src=ROOT/f'tmp/mujoco-audit/jumper-{REV}/out/bundle_example/jumper/models/jump.onnx'
 if hashlib.sha256(src.read_bytes()).hexdigest()!=SHA:raise ValueError('Jump policy mismatch')
 dst=ROOT/'tmp/mujoco-web/jumper-walking';shutil.copyfile(src,dst/'jump.onnx')
 for name,sha in BASES.items():
  path=dst/(name+'.json')
  if hashlib.sha256(path.read_bytes()).hexdigest()!=sha:raise ValueError('Base manifest mismatch')
  manifest=json.loads(path.read_text());manifest['id']+='-jump'
  manifest['assets'].append(dict(path='jump.onnx',url='/simulation-assets/jumper-walking/jump.onnx',sha256=SHA,bytes=src.stat().st_size,source=f'Jumper verified bundle@{REV}/models/jump.onnx'))
  manifest['limitations']=['Forward walking, measured 90-degree turns and a fixed official jump with observed flight and landing; no arbitrary jump height, hardware or other modes exposed.']
  out=dst/(name+'-jump.json');out.write_text(json.dumps(manifest,indent=2)+'\n');print(out.name,hashlib.sha256(out.read_bytes()).hexdigest())
if __name__=='__main__':prepare()
