"""Experimental local MuJoCo session; owns only simulated robot services."""
import os, sys, json, time, socket, threading, subprocess, pathlib, math, tempfile, shutil
WORKSPACE = pathlib.Path(__file__).resolve().parents[5]
ROOT = pathlib.Path(os.environ.get('BOTLAB_NATIVE_BUNDLE', WORKSPACE / 'tmp/microduck-native'))
RUNS = pathlib.Path(os.environ.get('BOTLAB_NATIVE_RUNS', ROOT / 'runs'))
REPO = ROOT / 'microduck-e9cca6272f633dd9054dd0e021f356fe086e5be1'
RL = ROOT / 'microduck_rl-363b7effd4eae9f24dd1bb8bf647aef4d74edca9'

class ViewerClosed(Exception):
    """The user closed the native scene window."""


class RPC:

    def __init__(self, path, tcp=False):
        self.sock = socket.socket(socket.AF_INET if tcp else socket.AF_UNIX)
        self.sock.settimeout(3)
        self.sock.connect(path)
        self.sock.settimeout(None)
        self.f = self.sock.makefile('rwb', buffering=0)
        self.n = 0
        self.latest = {}
        self.messages = []
        self.responses = {}
        self.cv = threading.Condition()
        self.closed = False
        threading.Thread(target=self.read, daemon=True).start()

    def read(self):
        try:
            for line in self.f:
                msg = json.loads(line)
                with self.cv:
                    self.messages.append({'at': time.monotonic(), 'message': msg})
                    if 'id' in msg:
                        self.responses[msg['id']] = msg
                    if 'method' in msg:
                        self.latest[msg['method']] = msg.get('params')
                    self.cv.notify_all()
        except Exception as e:
            if not self.closed:
                print('reader', type(e).__name__, str(e), flush=True)

    def call(self, method, params=None):
        self.n += 1
        n = self.n
        self.f.write((json.dumps({'jsonrpc': '2.0', 'id': n, 'method': method, 'params': params or {}}) + '\n').encode())
        with self.cv:
            if not self.cv.wait_for(lambda: n in self.responses, timeout=3):
                raise TimeoutError(method)
            return self.responses.pop(n)

    def close(self):
        self.closed = True
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.f.close()
        self.sock.close()

class Body:

    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=3)
        self.f = self.sock.makefile('rwb', buffering=0)
        self.get('hello', protocol=1, joints=15)

    def get(self, op, **args):
        self.f.write((json.dumps({'op': op, **args}) + '\n').encode())
        return json.loads(self.f.readline())

    def close(self):
        self.f.close()
        self.sock.close()

class NativeMicroDuckSession:

    def __init__(self, label='baseline', scene=None, viewer=False):
        self.out = RUNS / f'{label}-{time.time_ns()}'
        self.out.mkdir(parents=True)
        setup = ROOT / 'setup.json'
        if setup.exists(): shutil.copyfile(setup, self.out / 'setup.json')
        self.closed = False
        self.started = False
        self.procs = []
        self.logs = []
        self.rpc = None
        self.tof = None
        self.body = None
        self.port = 17831
        self.state = pathlib.Path(tempfile.mkdtemp(prefix='botlab-native-', dir='/tmp'))
        policy = ROOT / 'policies/current'
        cfg = '[policy]\nenabled = true\n' + ''.join((f'{a} = "{policy / b}"\n' for a, b in [('walk', 'alpha_walking.onnx'), ('stand', 'alpha_stand.onnx'), ('sitstand', 'alpha_sitstand.onnx'), ('ground_pick', 'alpha_ground_pick.onnx'), ('kick_left', 'ball_kick_left.onnx'), ('kick_right', 'ball_kick_right.onnx'), ('roulade', 'roulade.onnx')])) + '[audio]\nenabled = false\n'
        (self.out / 'params.toml').write_text(cfg)
        self.env = os.environ | {'DUCK_RUNTIME_DIR': str(self.state), 'ORT_DYLIB_PATH': str(next((ROOT / 'venv/lib').glob('python*/site-packages/onnxruntime/capi/libonnxruntime*.dylib'))), 'PYTHONPATH': os.pathsep.join((str(pathlib.Path(__file__).resolve().parent.parent), str(RL / 'src'))), 'BOTLAB_NATIVE_VIEWER_METRICS': str(self.out / 'viewer-metrics.json'), 'RUST_LOG': 'info', 'DYLD_FALLBACK_LIBRARY_PATH': str(pathlib.Path(sys.base_prefix) / 'lib')}
        self.viewer = viewer
        self.scene = scene

    def spawn(self, name, args):
        f = (self.out / f'{name}.log').open('w')
        self.logs.append(f)
        p = subprocess.Popen(args, stdout=f, stderr=subprocess.STDOUT, env=self.env)
        self.procs.append(p)
        return p

    def start(self):
        if self.closed or self.started:
            raise RuntimeError('Create a new native session for each launch.')
        self.started = True
        try:
            return self._start()
        except BaseException:
            self.close()
            raise

    def _start(self):
        cmd = [str(ROOT / 'venv/bin/python')]
        if self.viewer:
            cmd += [str(pathlib.Path(__file__).with_name('mjpython.py'))]
        cmd += ['-m', 'botlab_microduck_native.body_server' if self.viewer else 'mjlab_microduck.sim.body_server', '--host', '127.0.0.1', '--port', str(self.port), '--keyframe', 'SIT']
        if not self.viewer:
            cmd += ['--headless']
        if self.scene:
            cmd += ['--scene', str(self.scene)]
        probe_socket = socket.socket()
        probe_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe_socket.bind(('127.0.0.1', self.port))
        probe_socket.close()
        body_process = self.spawn('body', cmd)
        for _ in range(100):
            if body_process.poll() is not None:
                raise RuntimeError('body exited: ' + (self.out / 'body.log').read_text())
            try:
                self.body = Body(self.port)
                break
            except OSError:
                time.sleep(0.1)
        if self.body is None:
            raise RuntimeError('body failed: ' + (self.out / 'body.log').read_text())
        self.spawn('robotd', [str(REPO / 'target/debug/robotd'), '--sim', f'127.0.0.1:{self.port}', '--socket', str(self.state / 'r.sock'), '--params', str(self.out / 'params.toml')])
        self.spawn('tofd', [str(REPO / 'target/debug/tofd'), '--sim', f'127.0.0.1:{self.port}', '--socket', str(self.state / 't.sock'), '--config', str(self.out / 'params.toml')])
        for _ in range(100):
            if (self.state / 'r.sock').exists() and (self.state / 't.sock').exists():
                break
            time.sleep(0.1)
        self.rpc = RPC(str(self.state / 'r.sock'))
        self.tof = RPC(str(self.state / 't.sock'))
        print('SUBSCRIBE', json.dumps(self.rpc.call('robot.subscribe', {'hz': 50})), flush=True)
        print('TOF', json.dumps(self.tof.call('tof.stream')), flush=True)
        print('ENABLE', json.dumps(self.rpc.call('robot.enable', {'on': True})), flush=True)
        return self

    def check_health(self):
        for index, process in enumerate(self.procs):
            if self.viewer and index == 0 and process.poll() == 0:
                raise ViewerClosed()
            if process.poll() is not None:
                raise RuntimeError('Native simulator window or service closed.')

    def close(self):
        if self.closed:
            return
        self.closed = True
        if self.rpc:
            try:
                print('STOP', self.rpc.call('robot.stop'), flush=True)
            except Exception:
                pass
        for label, client in [('robot', self.rpc), ('tof', self.tof)]:
            if client:
                (self.out / f'{label}-messages.json').write_text(json.dumps(client.messages))
                client.close()
        if self.body:
            self.body.close()
        for p in reversed(self.procs):
            if p.poll() is None:
                p.terminate()
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()
        for f in self.logs:
            f.close()
        cleanup = [{'pid': p.pid, 'exit_code': p.returncode} for p in self.procs]
        (self.out / 'cleanup.json').write_text(json.dumps(cleanup, indent=2))
        shutil.rmtree(self.state, ignore_errors=True)
        print('CLEANUP', cleanup, flush=True)
        print('REPORT', self.out, flush=True)

def yaw(q):
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
