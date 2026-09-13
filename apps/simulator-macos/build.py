"""Build a relocatable Apple Silicon development .app from the pinned native cache."""
import json
from pathlib import Path
import platform
import plistlib
import shutil
import subprocess

WORKSPACE = Path(__file__).resolve().parents[2]
CACHE = WORKSPACE / 'tmp/microduck-native'
OUTPUT = WORKSPACE / 'dist/apps/simulator-macos/BotLab Simulator.app'
DAEMON = 'microduck-e9cca6272f633dd9054dd0e021f356fe086e5be1'
RL = 'microduck_rl-363b7effd4eae9f24dd1bb8bf647aef4d74edca9'


def copy_tree(source, target):
    shutil.copytree(source, target, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc', '.DS_Store'))


def main():
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise SystemExit('Build on an Apple Silicon Mac with Xcode command-line tools.')
    python = CACHE / 'venv/bin/python'
    info = json.loads(subprocess.check_output([python, '-c',
        'import json,sys,sysconfig; print(json.dumps([sys.base_prefix,sysconfig.get_path("purelib")]))']))
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    contents = OUTPUT / 'Contents'
    resources = contents / 'Resources'
    native = resources / 'native'
    macos = contents / 'MacOS'
    macos.mkdir(parents=True)
    # Copy the standalone interpreter, then overlay the pinned execution dependencies.
    # This is a real interpreter tree, not a venv pointing back into the build checkout.
    copy_tree(Path(info[0]), native / 'venv')
    copy_tree(Path(info[1]), native / 'venv/lib/python3.12/site-packages')
    for entry in (native / 'venv/lib/python3.12/site-packages').glob('_virtualenv.*'):
        entry.unlink()
    copy_tree(WORKSPACE / 'libs/simulators/microduck-native/python/botlab_microduck_native',
              resources / 'python/botlab_microduck_native')
    copy_tree(CACHE / RL / 'src', native / RL / 'src')
    copy_tree(CACHE / 'policies/current', native / 'policies/current')
    for name in ('robotd', 'tofd'):
        target = native / DAEMON / 'target/debug' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(CACHE / DAEMON / 'target/debug' / name, target)
    shutil.copy2(CACHE / 'setup.json', native / 'setup.json')
    shutil.copy2(Path(__file__).with_name('simulators.json'), resources / 'simulators.json')
    # Preserve upstream notices alongside the installed runtime/package notices.
    for repo in (DAEMON, RL):
        for source in (CACHE / repo).glob('LICENSE*'):
            target = resources / 'licenses' / repo / source.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    with (contents / 'Info.plist').open('wb') as file:
        plistlib.dump({
            'CFBundleExecutable': 'BotLabSimulator',
            'CFBundleIdentifier': 'dev.botlab.simulator',
            'CFBundleName': 'BotLab Simulator',
            'CFBundleDisplayName': 'BotLab Simulator',
            'CFBundlePackageType': 'APPL',
            'CFBundleShortVersionString': '0.1.0',
            'CFBundleVersion': '1',
            'LSMinimumSystemVersion': '13.0',
            'NSHighResolutionCapable': True,
        }, file)
    subprocess.run(['xcrun', 'swiftc', '-O', '-framework', 'AppKit',
        '-module-cache-path', str(WORKSPACE / 'tmp/swift-module-cache'),
        str(Path(__file__).with_name('Simulator.swift')),
        '-o', str(macos / 'BotLabSimulator')], check=True)
    # No external symlink may pull a build-machine runtime into the installed app.
    for path in OUTPUT.rglob('*'):
        if path.is_symlink() and not path.resolve().is_relative_to(OUTPUT.resolve()):
            raise RuntimeError(f'External bundle symlink: {path}')
    subprocess.run(['codesign', '--force', '--deep', '--sign', '-', str(OUTPUT)], check=True)
    print(OUTPUT)
    print('Development signature only; distribution signing/notarization is separate.')


if __name__ == '__main__':
    main()
