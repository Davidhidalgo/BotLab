"""Bounded, latest-frame video channel; rendering never blocks native control."""
import multiprocessing
import queue
import threading
import time


def render_worker(port, scene, frames, enabled, stopping):
    # MuJoCo's GL context belongs to this process's main thread (including on macOS).
    from .renderer import Renderer
    from .session import Body
    renderer = Renderer(scene)
    body = None
    try:
        while not stopping.is_set():
            if not enabled.wait(0.1):
                continue
            start = time.monotonic()
            try:
                if body is None:
                    body = Body(port)
                jpeg = renderer.frame(body.get('read'))
                item = (start, jpeg)
                try:
                    frames.put_nowait(item)
                except queue.Full:
                    # A slow consumer gets the newest image, never an ever-growing backlog.
                    try:
                        frames.get_nowait()
                    except queue.Empty:
                        pass
                    try:
                        frames.put_nowait(item)
                    except queue.Full:
                        pass
            except (OSError, ValueError):
                # Reset replaces the body server; reconnect without affecting control ownership.
                if body:
                    body.close()
                body = None
                stopping.wait(0.1)
            stopping.wait(max(0, 1 / 30 - (time.monotonic() - start)))
    finally:
        if body:
            body.close()
        renderer.close()
        frames.cancel_join_thread()


class VideoStream:
    def __init__(self, port, scene):
        context = multiprocessing.get_context('spawn')
        self.frames = context.Queue(maxsize=2)
        self.enabled = context.Event()
        self.stopping = context.Event()
        self.changed = threading.Condition()
        self.latest = None
        self.discard_before = 0
        self.process = context.Process(target=render_worker, args=(port, scene, self.frames, self.enabled, self.stopping), daemon=True)
        self.process.start()
        self.receiver = threading.Thread(target=self.receive, daemon=True)
        self.receiver.start()

    def reset(self):
        with self.changed:
            self.discard_before = time.monotonic()
            self.latest = None
            self.changed.notify_all()

    def receive(self):
        while not self.stopping.is_set():
            try:
                latest = self.frames.get(timeout=0.5)
            except queue.Empty:
                continue
            self.publish_latest(latest)

    def publish_latest(self, latest=None):
        while True:
            try:
                latest = self.frames.get_nowait()
            except queue.Empty:
                break
        with self.changed:
            if latest and latest[0] >= self.discard_before:
                self.latest = latest
                self.changed.notify_all()

    def next_frame(self, after):
        with self.changed:
            self.changed.wait_for(lambda: self.stopping.is_set() or (self.latest and self.latest[0] > after), timeout=0.5)
            return self.latest if self.latest and self.latest[0] > after else None

    def close(self):
        self.stopping.set()
        self.enabled.set()
        with self.changed:
            self.changed.notify_all()
        self.process.join(timeout=4)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join(timeout=2)
        self.receiver.join(timeout=1)
        self.frames.close()
