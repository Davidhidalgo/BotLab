"""Try one public Hugging Face ONNX skill in an isolated MicroDuck simulator."""

import argparse
import hashlib
import json
import math
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from probe import Native, ROOT
from botlab_microduck_native.posture import PostureObserver


MAX_BYTES = 100 * 1024 * 1024
REPO = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')
NAME = re.compile(r'^[a-z][a-z0-9_-]{0,39}$')
COMMIT = re.compile(r'^[0-9a-f]{40}$')


def rpc(session, method, params=None):
    reply = session.rpc.call(method, params)
    if 'error' in reply:
        raise RuntimeError(f'{method}: {reply["error"].get("message", "RPC failed")}')
    return reply['result']


def fetch_json(url):
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={'User-Agent': 'BotLab-simulator-skill-probe/1'}),
        timeout=20,
    ) as response:
        return json.load(response)


def resolve_model(repo, revision, filename):
    revision_url = urllib.parse.quote(revision, safe='')
    info = fetch_json(f'https://huggingface.co/api/models/{repo}/revision/{revision_url}')
    commit = info.get('sha')
    if not isinstance(commit, str) or not COMMIT.fullmatch(commit):
        raise ValueError('Hugging Face did not return an immutable commit.')
    siblings = info.get('siblings', [])
    if not any(item.get('rfilename') == filename for item in siblings if isinstance(item, dict)):
        raise ValueError(f'{filename} is not listed in the selected model revision.')
    return commit


def download_model(repo, commit, filename):
    destination = ROOT / 'community-skills' / repo.replace('/', '--') / commit / pathlib.PurePosixPath(filename).name
    if destination.is_file():
        if destination.stat().st_size > MAX_BYTES:
            raise ValueError('Cached ONNX model exceeds the 100 MB trial limit.')
        return destination, hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.partial')
    url = f'https://huggingface.co/{repo}/resolve/{commit}/{urllib.parse.quote(filename, safe="/")}'
    digest = hashlib.sha256()
    total = 0
    try:
        with urllib.request.urlopen(
            urllib.request.Request(url, headers={'User-Agent': 'BotLab-simulator-skill-probe/1'}),
            timeout=30,
        ) as response, temporary.open('wb') as output:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError('ONNX model exceeds the 100 MB trial limit.')
                digest.update(chunk)
                output.write(chunk)
        if total == 0:
            raise ValueError('Downloaded ONNX model is empty.')
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination, digest.hexdigest()


def wait_for_standing(session, seconds=8):
    observer = PostureObserver()
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        state = session.rpc.latest.get('robot.state')
        now = time.monotonic()
        observer.observe(state, now)
        if state and (state['safety']['fallen'] or state['safety']['limp']):
            raise RuntimeError('Simulator is fallen or limp before skill dispatch.')
        if observer.stable == 'stand':
            return
        time.sleep(.05)
    raise TimeoutError('Simulator did not reach stable standing before the trial.')


def run_skill(session, name, timeout):
    if rpc(session, 'robot.do', {'skill': name}).get('accepted') is not True:
        raise RuntimeError('Daemon refused the skill request.')
    started = time.monotonic()
    observer = PostureObserver()
    policies = []
    observed_start = False
    while time.monotonic() - started < timeout:
        state = session.rpc.latest.get('robot.state')
        now = time.monotonic()
        observer.observe(state, now)
        if state:
            policy = state.get('policy')
            if policy and (not policies or policies[-1] != policy):
                policies.append(policy)
            if state['safety']['fallen'] or state['safety']['limp']:
                return {'outcome': 'fallen-or-limp', 'policies': policies}
            if policy in (name, name + ':unwind'):
                observed_start = True
            if observed_start and policy == 'stand' and observer.stable == 'stand':
                return {'outcome': 'recovered', 'policies': policies,
                        'seconds': round(now - started, 2)}
        if not observed_start and now - started > 3:
            return {'outcome': 'start-not-observed', 'policies': policies}
        time.sleep(.05)
    return {'outcome': 'recovery-timeout' if observed_start else 'start-not-observed',
            'policies': policies}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', required=True, help='Public Hugging Face model, owner/name')
    parser.add_argument('--revision', default='main', help='Branch, tag or full commit (default: main)')
    parser.add_argument('--file', default='policy.onnx', help='ONNX file in the model repo')
    parser.add_argument('--name', required=True, help='Temporary skill name in this simulator run')
    parser.add_argument('--duration', required=True, type=float, help='Skill duration in seconds')
    parser.add_argument('--execute', action='store_true', help='Actually run the skill in MuJoCo')
    args = parser.parse_args()
    if not REPO.fullmatch(args.repo) or not NAME.fullmatch(args.name):
        parser.error('Use owner/model for --repo and a lowercase simple --name.')
    if args.name in ('sit_toggle', 'ground_pick', 'kick_left', 'kick_right', 'roulade'):
        parser.error('Choose a new skill name; built-in names cannot be replaced in this trial.')
    parts = pathlib.PurePosixPath(args.file).parts
    if (not parts or any(part in ('', '.', '..') for part in parts) or
            args.file.startswith('/') or not args.file.endswith('.onnx')):
        parser.error('--file must be a relative .onnx path without traversal.')
    if not math.isfinite(args.duration) or not 0 < args.duration <= 30:
        parser.error('--duration must be greater than 0 and at most 30 seconds.')
    if not (ROOT / 'setup.json').exists():
        parser.error('Prepare the native simulator first: python3 tools/microduck/native/prepare.py')

    commit = resolve_model(args.repo, args.revision, args.file)
    model, digest = download_model(args.repo, commit, args.file)
    report = {'source': f'https://huggingface.co/{args.repo}', 'revision': commit,
              'file': args.file, 'sha256': digest, 'name': args.name,
              'duration': args.duration, 'executed': args.execute}
    session = Native('huggingface-skill-trial')
    try:
        session.start()
        wait_for_standing(session)
        response = rpc(session, 'robot.setSkill', {'name': args.name,
                       'path': str(model), 'duration': args.duration})
        if response.get('accepted') is not True:
            raise RuntimeError(response.get('reason', 'Daemon refused skill registration.'))
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            configured = rpc(session, 'robot.skills')
            loaded = rpc(session, 'robot.subscribe', {'hz': 50})
            if (args.name in loaded.get('skills', []) and
                    any(s.get('name') == args.name for s in configured.get('skills', []))):
                break
            time.sleep(.3)
        else:
            raise RuntimeError('Skill was accepted but never became loaded.')
        report['registered'] = True
        if args.execute:
            report.update(run_skill(session, args.name, max(20, args.duration + 10)))
        else:
            report['outcome'] = 'registered-only'
    except (RuntimeError, TimeoutError, ValueError) as error:
        report['outcome'] = 'error'
        report['error'] = str(error)
    finally:
        if session.started and session.rpc:
            try:
                rpc(session, 'robot.stop')
            except (RuntimeError, TimeoutError, OSError):
                pass
        session.close()
        (session.out / 'huggingface-trial.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    print(f'Full simulator logs: {session.out}')
    return 0 if report.get('registered') and (
        not args.execute or report.get('outcome') == 'recovered') else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (urllib.error.URLError, ValueError) as error:
        raise SystemExit(f'Hugging Face download failed: {error}')
