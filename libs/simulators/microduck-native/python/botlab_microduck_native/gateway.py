"""Loopback-only BotLab gateway. One leased browser controls one simulated session."""
import argparse
import json
import os
import queue
import signal
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
from .session import NativeMicroDuckSession, ViewerClosed
from .program import Program, walk_steps
from .posture import PostureObserver


class Gateway:
    def __init__(self, presentation='embedded'):
        self.presentation = presentation
        self.session = None
        self.owner = None
        self.sequence = 0
        self.heartbeat = 0
        self.program = None
        self.posture = PostureObserver()
        self.capabilities = {'skills': [], 'postures': [], 'postureConditions': ['sit', 'stand', 'transitioning']}
        self.video = None
        self.state = None

    def start(self):
        self.session = NativeMicroDuckSession('app', viewer=self.presentation == 'external').start()
        self.posture = PostureObserver()
        self.refresh_capabilities()

    def refresh_capabilities(self):
        loaded = self.rpc('robot.subscribe', {'hz': 50})
        report = self.rpc('robot.skills')
        configured = {s['name'] for s in report.get('skills', []) if isinstance(s, dict) and isinstance(s.get('name'), str)}
        skills = set(loaded.get('skills', [])) & configured
        for name, slot in [('sit_toggle', 'sitstand'), ('ground_pick', 'ground_pick')]:
            if loaded.get(slot) and name in report.get('built_in', []):
                skills.add(name)
        self.capabilities = {'skills': sorted(skills), 'postures': ['sit', 'stand'] if 'sit_toggle' in skills else [], 'postureConditions': ['sit', 'stand', 'transitioning']}

    def rpc(self, method, params=None):
        reply = self.session.rpc.call(method, params)
        if 'error' in reply:
            raise ValueError(reply['error'].get('message', 'Native RPC rejected.'))
        return reply['result']

    def stop(self, reason=None):
        if self.program and self.program.status == 'running':
            self.program.stop(reason)
        return self.rpc('robot.stop')

    def request(self, path, body, now):
        token = body.get('token')
        if not isinstance(token, str) or not 16 <= len(token) <= 128:
            raise ValueError('Invalid session token.')
        if path == '/claim':
            if self.owner is not None and self.owner != token:
                raise PermissionError('Native simulator is in use by another tab.')
            if self.owner != token:
                self.sequence = 0
            self.owner = token
            self.heartbeat = now
            return self.snapshot(now)
        if token != self.owner:
            raise PermissionError('Native session expired. Connect again.')
        if path == '/state':
            self.heartbeat = now
            return self.snapshot(now)
        sequence = body.get('sequence')
        if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence <= self.sequence:
            raise ValueError('Stale native operation.')
        self.sequence = sequence
        self.heartbeat = now
        if path == '/release':
            self.stop()
            self.owner = None
            return {'released': True}
        if path == '/stop':
            self.stop()
        elif path == '/reset':
            self.stop()
            self.session.close()
            self.program = None
            self.state = None
            self.start()
            if self.video:
                self.video.reset()
            self.posture.invalidate()
            self.heartbeat = time.monotonic()
        elif path == '/run':
            if self.program and self.program.status == 'running':
                raise ValueError('Native simulator is busy.')
            self.refresh_capabilities()
            run_id = body.get('runId')
            if not isinstance(run_id, str) or not 1 <= len(run_id) <= 128:
                raise ValueError('Invalid execution ID.')
            candidate = Program(run_id, body.get('steps'), now)
            if any(step['kind'] == 'posture' and step['value'] not in self.capabilities['postures'] for step in walk_steps(candidate.steps)):
                raise ValueError('Native posture capability is unavailable.')
            self.program = candidate
        elif path == '/rpc':
            message = body.get('message', {})
            if not isinstance(message, dict) or not isinstance(message.get('params', {}), dict):
                raise ValueError('Invalid RPC request.')
            method = message.get('method')
            if method not in ('robot.stop', 'robot.health', 'robot.subscribe', 'robot.skills', 'robot.do'):
                raise ValueError('Unsupported native app operation.')
            if method == 'robot.do':
                if message.get('params') != {'skill': 'sit_toggle'}:
                    raise ValueError('Unsupported native skill.')
                if self.program and self.program.status == 'running' or self.posture.stable is None:
                    raise ValueError('Native simulator is busy.')
                self.refresh_capabilities()
                if not self.capabilities['postures']:
                    raise ValueError('Native posture capability is unavailable.')
                desired = 'sit' if self.posture.stable == 'stand' else 'stand'
                self.program = Program(f'posture-{time.time_ns()}', [{'kind': 'posture', 'value': desired}], now)
                return {'jsonrpc': '2.0', 'id': message.get('id'), 'result': {'accepted': True}}
            if method == 'robot.stop':
                self.stop()
                result = {'accepted': True}
            else:
                result = self.rpc(method, message.get('params'))
            return {'jsonrpc': '2.0', 'id': message.get('id'), 'result': result}
        else:
            raise ValueError('Unknown native endpoint.')
        return self.snapshot(time.monotonic())

    def snapshot(self, now):
        return {'protocolVersion': 1, 'simulatorId': 'microduck', 'presentation': self.presentation, 'state': self.state, 'depth': self.session.tof.latest.get('tof.frame'),
                'frameTime': self.video.latest[0] if self.video and self.video.latest else 0,
                'program': self.program.snapshot() if self.program else None,
                'capabilities': self.capabilities, 'observedPosture': self.posture.observed,
                'postureBusy': self.posture.stable is None or bool(self.program and self.program.status == 'running' and self.program.steps[self.program.index]['kind'] == 'posture')}

    def tick(self, now):
        self.session.check_health()
        if self.owner and now - self.heartbeat > 2:
            self.stop('Browser connection lost.')
            self.owner = None
        self.state = self.session.rpc.latest.get('robot.state')
        messages = self.session.rpc.messages
        received = next((m['at'] for m in reversed(messages) if m['message'].get('method') == 'robot.state'), 0)
        fresh = bool(self.state) and now - received <= .5
        self.posture.observe(self.state if fresh else None, now)
        if not fresh:
            self.posture.invalidate()
        if self.program and self.program.status == 'running':
            # t is the daemon's timestamp, so detect freshness from the local reader's receipt time.
            if not fresh:
                self.stop('Native telemetry stopped.')
            else:
                velocity = self.program.tick(self.state, now, self.posture)
                if self.program.skill_request:
                    skill = self.program.skill_request
                    self.program.skill_request = None
                    try:
                        result = self.rpc('robot.do', {'skill': skill})
                        if result.get('accepted') is not True:
                            self.posture.invalidate()
                            self.program.stop(result.get('reason', 'Native skill was refused.'))
                    except (ValueError, RuntimeError, TimeoutError) as error:
                        self.posture.invalidate()
                        self.program.stop(str(error))
                self.rpc('robot.move', velocity)
                if self.program.status != 'running':
                    self.rpc('robot.stop')
        if self.video:
            if self.owner:
                self.video.enabled.set()
            else:
                self.video.enabled.clear()
            if not self.video.process.is_alive():
                raise RuntimeError('Native video process exited.')
        # Keep a bounded recent trace for long app sessions.
        for client in (self.session.rpc, self.session.tof):
            with client.cv:
                if len(client.messages) > 5000:
                    del client.messages[:-2500]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--parent-pid', type=int)
    parser.add_argument('--presentation', choices=['embedded', 'external'], default='embedded')
    parser.add_argument('--port', type=int, default=4401)
    parser.add_argument('--origin', action='append', default=['http://127.0.0.1:4200', 'http://localhost:4200'])
    args = parser.parse_args()
    requests = queue.Queue(maxsize=32)
    stopping = threading.Event()
    gateway = Gateway(args.presentation)
    stream_lock = threading.Lock()
    streams = {}

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def headers_allowed(self):
            return (self.headers.get('Host') in (f'127.0.0.1:{args.port}', f'localhost:{args.port}') and
                    (not self.headers.get('Origin') or self.headers.get('Origin') in args.origin))

        def answer(self, status, payload):
            encoded = json.dumps(payload, allow_nan=False).encode()
            self.send_response(status)
            origin = self.headers.get('Origin')
            if origin in args.origin:
                self.send_header('Access-Control-Allow-Origin', origin)
                self.send_header('Vary', 'Origin')
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            try:
                self.wfile.write(encoded)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            parsed = urlsplit(self.path)
            if self.headers_allowed() and parsed.path == '/health':
                return self.answer(200, {'protocolVersion': 1, 'simulatorId': 'microduck', 'presentation': gateway.presentation, 'pid': os.getpid()})
            token = parse_qs(parsed.query).get('token', [None])[0]
            if not self.headers_allowed() or parsed.path != '/video' or not token or token != gateway.owner or gateway.video is None:
                return self.answer(403, {'error': 'Video session unavailable.'})
            with stream_lock:
                if streams.get(token, 0) >= 2:
                    return self.answer(409, {'error': 'Video stream already open.'})
                streams[token] = streams.get(token, 0) + 1
            try:
                self.connection.settimeout(2)
                self.send_response(200)
                self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=botlab-frame')
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                if self.headers.get('Origin') in args.origin:
                    self.send_header('Access-Control-Allow-Origin', self.headers['Origin'])
                    self.send_header('Vary', 'Origin')
                self.end_headers()
                after = 0
                while not stopping.is_set() and token == gateway.owner:
                    frame = gateway.video.next_frame(after)
                    if frame is None:
                        continue
                    after, jpeg = frame
                    header = (f'--botlab-frame\r\nContent-Type: image/jpeg\r\n'
                              f'Content-Length: {len(jpeg)}\r\nX-Frame-Time: {after}\r\n\r\n').encode()
                    self.wfile.write(header + jpeg + b'\r\n')
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                pass
            finally:
                with stream_lock:
                    remaining = streams.get(token, 1) - 1
                    if remaining:
                        streams[token] = remaining
                    else:
                        streams.pop(token, None)

        def do_OPTIONS(self):
            if not self.headers_allowed():
                return self.answer(403, {'error': 'Origin not allowed.'})
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', ''))
            self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_POST(self):
            if not self.headers_allowed():
                return self.answer(403, {'error': 'Origin not allowed.'})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 256000 or self.headers.get('Content-Type') != 'application/json':
                    raise ValueError('Expected a bounded JSON request.')
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict):
                    raise ValueError('Invalid request.')
                item = {'path': self.path, 'body': body, 'done': threading.Event()}
                requests.put_nowait(item)
            except (ValueError, queue.Full) as error:
                return self.answer(400, {'error': str(error)})
            if not item['done'].wait(25):
                return self.answer(504, {'error': 'Native gateway timed out.'})
            self.answer(item['status'], item['result'])

    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    signal.signal(signal.SIGINT, lambda *_: stopping.set())
    video = None
    try:
        gateway.start()
        if args.presentation == 'embedded':
            from .video import VideoStream
            video = VideoStream(gateway.session.port)
            gateway.video = video
        threading.Thread(target=server.serve_forever, daemon=True).start()
        print(f'BotLab native simulator ready on http://127.0.0.1:{args.port}', flush=True)
        while not stopping.is_set():
            if args.parent_pid is not None and os.getppid() != args.parent_pid:
                break
            start = time.monotonic()
            try:
                item = requests.get_nowait()
            except queue.Empty:
                item = None
            if item:
                try:
                    item['result'] = gateway.request(item['path'], item['body'], start)
                    item['status'] = 200
                except (ValueError, PermissionError, RuntimeError, TimeoutError) as error:
                    item['status'] = 409
                    item['result'] = {'error': str(error)}
                finally:
                    item['done'].set()
            gateway.tick(time.monotonic())
            stopping.wait(max(0, 0.02 - (time.monotonic() - start)))
    except ViewerClosed:
        pass
    finally:
        server.server_close()
        if video:
            video.close()
        if gateway.session:
            gateway.session.close()


if __name__ == '__main__':
    main()
