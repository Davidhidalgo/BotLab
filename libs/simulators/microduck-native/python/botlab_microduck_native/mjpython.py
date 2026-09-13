"""Launch MuJoCo's Cocoa trampoline with the bundled CPython library.

Unlike the generic mjpython entrypoint, this known runtime needs no otool or
developer tools on the user's Mac. Keep Python off Cocoa's main thread.
"""
import importlib.util
import os
from pathlib import Path
import sys


def main():
    module = Path(importlib.util.find_spec('mujoco').origin).parent
    binary = module / 'MuJoCo_(mjpython).app/Contents/MacOS/mjpython'
    library = Path(sys.base_prefix) / 'lib' / f'libpython{sys.version_info.major}.{sys.version_info.minor}.dylib'
    env = os.environ | {'MJPYTHON_BIN': str(binary), 'MJPYTHON_LIBPYTHON': str(library)}
    os.execve(binary, [sys.executable, *sys.argv[1:]], env)


if __name__ == '__main__':
    main()
