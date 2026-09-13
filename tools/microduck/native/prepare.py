"""Prepare the experimental native probe on Apple Silicon, entirely in tmp/.
Requires Python 3, uv, curl, tar and Xcode command-line tools. No shell profile edits.
"""
import hashlib
import json
import os
import pathlib
import platform
import subprocess
import time
WORKSPACE = pathlib.Path(__file__).resolve().parents[3]
ROOT = WORKSPACE / 'tmp/microduck-native'
DAEMON_REV = 'e9cca6272f633dd9054dd0e021f356fe086e5be1'
BODY_REV = '363b7effd4eae9f24dd1bb8bf647aef4d74edca9'
POLICY_REV = '916c1e1ee11f8460506532e037a4cf1aa110aca6'
RUST_VERSION = '1.98.1'

def run(args, **kwargs):
    subprocess.run([str(x) for x in args], check=True, **kwargs)

def download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = destination.with_suffix(destination.suffix + '.partial')
    run(['curl', '-fsSL', '--retry', '2', '--max-time', '180', url, '-o', staging])
    staging.replace(destination)

def main():
    if (platform.system(), platform.machine()) != ('Darwin', 'arm64'):
        raise SystemExit('This measured setup targets macOS arm64; other hosts need a separate validation.')
    start = time.monotonic()
    ROOT.mkdir(parents=True, exist_ok=True)
    for repo, rev in [('microduck', DAEMON_REV), ('microduck_rl', BODY_REV)]:
        archive = ROOT / (repo + '.tar.gz')
        checkout = ROOT / f'{repo}-{rev}'
        if not checkout.exists():
            download(f'https://codeload.github.com/pollen-robotics/{repo}/tar.gz/{rev}', archive)
            run(['tar', '-xzf', archive, '-C', ROOT])
    env = os.environ | {'CARGO_HOME': str(ROOT / 'cargo'), 'RUSTUP_HOME': str(ROOT / 'rustup'), 'UV_CACHE_DIR': str(ROOT / 'uv-cache'), 'UV_PYTHON_INSTALL_DIR': str(ROOT / 'python')}
    rustc = ROOT / 'cargo/bin/rustc'
    installed = subprocess.check_output([str(rustc), '--version'], env=env, text=True) if rustc.exists() else ''
    if f'rustc {RUST_VERSION} ' not in installed:
        installer = ROOT / 'rustup-init'
        download('https://static.rust-lang.org/rustup/dist/aarch64-apple-darwin/rustup-init', installer)
        installer.chmod(493)
        run([installer, '-y', '--no-modify-path', '--profile', 'minimal', '--default-toolchain', RUST_VERSION], env=env)
    python = ROOT / 'venv/bin/python'
    if not python.exists():
        run(['uv', 'venv', '--python', '3.12.12', ROOT / 'venv'], env=env)
    run(['uv', 'pip', 'sync', '--python', python, pathlib.Path(__file__).with_name('requirements.txt')], env=env)
    policies = ROOT / 'policies/releases' / f'seed-{POLICY_REV}'
    policies.mkdir(parents=True, exist_ok=True)
    names = ['alpha_walking', 'alpha_stand', 'alpha_sitstand', 'alpha_ground_pick', 'ball_kick_left', 'ball_kick_right', 'roller', 'roller_crouch', 'roulade']
    for name in names:
        destination = policies / f'{name}.onnx'
        if not destination.exists():
            download(f'https://huggingface.co/pollen-robotics/microduck-policies/resolve/{POLICY_REV}/{name}.onnx', destination)
    expected = json.loads(pathlib.Path(__file__).with_name('policy-sha256.json').read_text())
    for name, digest in expected.items():
        if hashlib.sha256((policies / name).read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Policy checksum mismatch: {name}')
    current = ROOT / 'policies/current'
    if current.is_symlink() and current.resolve() != policies.resolve():
        raise SystemExit('A different policy set is already selected in the probe directory.')
    if not current.exists():
        current.symlink_to(policies.relative_to(current.parent))
    with (ROOT / 'build.log').open('w') as output:
        run([ROOT / 'cargo/bin/cargo', 'build', '--locked', '-p', 'robotd', '-p', 'robotctl', '-p', 'tof'], cwd=ROOT / f'microduck-{DAEMON_REV}', env=env, stdout=output, stderr=subprocess.STDOUT)
    manifest = {'daemon_revision': DAEMON_REV, 'body_revision': BODY_REV, 'policy_revision': POLICY_REV, 'rust': subprocess.check_output([str(rustc), '--version'], env=env, text=True).strip(), 'python': subprocess.check_output([str(python), '--version'], text=True).strip(), 'platform': platform.platform(), 'setup_seconds': time.monotonic() - start, 'policy_sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(policies.glob('*.onnx'))}}
    (ROOT / 'setup.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))
if __name__ == '__main__':
    main()
