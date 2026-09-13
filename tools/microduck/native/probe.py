"""Compatibility imports for the experiment commands; runtime lives in the library."""
import json
import math
import pathlib
import subprocess
import sys
import time

WORKSPACE = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(WORKSPACE / 'libs/simulators/microduck-native/python'))
from botlab_microduck_native.session import Body, NativeMicroDuckSession, RPC, ROOT, RL, yaw

Native = NativeMicroDuckSession
