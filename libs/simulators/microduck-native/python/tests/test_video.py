import pathlib
import queue
import sys
import threading
import time
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from botlab_microduck_native.video import VideoStream


class VideoTests(unittest.TestCase):
    def stream(self):
        video = VideoStream.__new__(VideoStream)
        video.frames = queue.Queue(maxsize=2)
        video.changed = threading.Condition()
        video.stopping = threading.Event()
        video.latest = None
        video.discard_before = 0
        return video

    def test_slow_consumer_gets_latest_without_backlog(self):
        video = self.stream()
        video.frames.put((1, b'old'))
        video.frames.put((2, b'new'))
        video.publish_latest()
        self.assertEqual(video.next_frame(0), (2, b'new'))
        self.assertTrue(video.frames.empty())

    def test_reset_discards_frames_from_the_previous_body(self):
        video = self.stream()
        video.frames.put((time.monotonic(), b'old-body'))
        video.reset()
        video.publish_latest()
        self.assertIsNone(video.latest)
        video.frames.put((time.monotonic(), b'new-body'))
        video.publish_latest()
        self.assertEqual(video.latest[1], b'new-body')

    def test_stream_wait_can_be_interrupted_on_shutdown(self):
        video = self.stream()
        video.stopping.set()
        before = time.monotonic()
        self.assertIsNone(video.next_frame(0))
        self.assertLess(time.monotonic() - before, 0.1)
