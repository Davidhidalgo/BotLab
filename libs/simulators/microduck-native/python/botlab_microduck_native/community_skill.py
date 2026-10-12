"""Resolve and cache one public Hugging Face ONNX policy at an immutable revision."""

import hashlib
import json
import pathlib
import re
import urllib.parse
import urllib.request

from .session import ROOT


MAX_BYTES = 100 * 1024 * 1024
REPO = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$')
NAME = re.compile(r'^[a-z][a-z0-9_-]{0,39}$')
COMMIT = re.compile(r'^[0-9a-f]{40}$')


def validate_source(repo, revision, filename, name, duration):
    if not isinstance(repo, str) or not REPO.fullmatch(repo):
        raise ValueError('Use a public Hugging Face model in owner/model form.')
    if not isinstance(revision, str) or not revision or len(revision) > 100 or not re.fullmatch(r'[A-Za-z0-9_./-]+', revision) or '..' in revision:
        raise ValueError('Invalid Hugging Face revision.')
    if not isinstance(filename, str) or not filename.endswith('.onnx') or filename.startswith('/') or '..' in pathlib.PurePosixPath(filename).parts or len(filename) > 160:
        raise ValueError('Select a relative ONNX filename in the model repo.')
    if not isinstance(name, str) or not NAME.fullmatch(name) or name in ('sit_toggle', 'ground_pick', 'kick_left', 'kick_right', 'roulade'):
        raise ValueError('Choose a new lowercase skill name without replacing built-in skills.')
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not 0 < duration <= 30:
        raise ValueError('Duration must be greater than zero and at most 30 seconds.')


def fetch_json(url):
    with urllib.request.urlopen(
        urllib.request.Request(url, headers={'User-Agent': 'BotLab-simulator-skill-import/1'}),
        timeout=15,
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
    destination = ROOT / 'community-skills' / repo.replace('/', '--') / commit / filename
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
            urllib.request.Request(url, headers={'User-Agent': 'BotLab-simulator-skill-import/1'}),
            timeout=20,
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


def fetch_skill(repo, revision, filename, name, duration):
    validate_source(repo, revision, filename, name, duration)
    commit = resolve_model(repo, revision, filename)
    path, digest = download_model(repo, commit, filename)
    return {'repo': repo, 'revision': commit, 'filename': filename, 'name': name,
            'duration': duration, 'path': str(path), 'sha256': digest}
