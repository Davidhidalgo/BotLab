from probe import subprocess, pathlib, json

class Trigger:

    def __init__(self):
        self.process = subprocess.Popen(['node', '--experimental-strip-types', str(pathlib.Path(__file__).with_name('proximity-worker.ts'))], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
        self.armed = True

    def request(self, request):
        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError('proximity worker closed')
        return json.loads(line)

    def feed(self, frame):
        result = self.request({'frame': frame})
        self.armed = result['armed']
        return result['entered']

    def cancel(self):
        self.request({'cancel': True})
        self.armed = False

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
