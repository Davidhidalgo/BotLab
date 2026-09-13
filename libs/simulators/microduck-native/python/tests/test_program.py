import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from botlab_microduck_native.program import Program, validate_program
from botlab_microduck_native.gateway import Gateway


def state(x=0, yaw=0):
    return {'odom': {'position': [x, 0, 0.1], 'yaw': yaw},
            'safety': {'fallen': False, 'limp': False}, 'policy': 'stand'}


class NativeProgramTests(unittest.TestCase):
    def test_wait_holds_zero_and_completes(self):
        program = Program('run', [{'kind': 'wait', 'value': 1}], 0)
        self.assertEqual(program.tick(state(), 0), {})
        self.assertEqual(program.tick(state(), 1), {})
        self.assertEqual(program.status, 'completed')

    def test_walk_uses_displacement_then_settles(self):
        program = Program('run', [{'kind': 'walk', 'value': .25}], 0)
        self.assertEqual(program.tick(state(), 0), {'vx': .25})
        self.assertEqual(program.tick(state(.26), 1), {})
        self.assertEqual(program.status, 'running')
        program.tick(state(.27), 2)
        self.assertEqual(program.status, 'completed')

    def test_fall_stops_and_never_resumes(self):
        program = Program('run', [{'kind': 'walk', 'value': 1}], 0)
        fallen = state()
        fallen['safety']['fallen'] = True
        self.assertEqual(program.tick(fallen, 0), {})
        self.assertEqual(program.status, 'failed')
        self.assertEqual(program.tick(state(), 1), {})

    def test_stalled_walk_fails(self):
        program = Program('run', [{'kind': 'walk', 'value': 1}], 0)
        program.tick(state(), 0)
        self.assertEqual(program.tick(state(), 9), {})
        self.assertEqual(program.status, 'failed')

    def test_invalid_program_rejected_before_start(self):
        for steps in ([], [{'kind': 'walk', 'value': float('nan')}],
                      [{'kind': 'wait', 'value': -1}], [{'kind': 'leds', 'value': 1}]):
            with self.assertRaises(ValueError):
                validate_program(steps)


class LeaseTests(unittest.TestCase):
    def setUp(self):
        self.gateway = Gateway()
        self.gateway.state = state()
        self.gateway.session = SimpleNamespace(rpc=Mock(), tof=SimpleNamespace(latest={}))
        self.gateway.session.rpc.call.return_value = {'result': {'accepted': True}}
        self.token = 'test-session-token-123'
        self.gateway.request('/claim', {'token': self.token}, 0)

    def test_other_tab_cannot_take_control(self):
        with self.assertRaises(PermissionError):
            self.gateway.request('/claim', {'token': 'other-session-token-123'}, 1)

    def test_stop_fences_late_run(self):
        self.gateway.request('/stop', {'token': self.token, 'sequence': 2}, 1)
        with self.assertRaises(ValueError):
            self.gateway.request('/run', {'token': self.token, 'sequence': 1,
                'runId': 'old', 'steps': [{'kind': 'walk', 'value': 1}]}, 1)
        self.assertIsNone(self.gateway.program)

    def test_release_revokes_old_commands(self):
        self.gateway.request('/release', {'token': self.token, 'sequence': 1}, 1)
        with self.assertRaises(PermissionError):
            self.gateway.request('/run', {'token': self.token, 'sequence': 2}, 2)
        self.gateway.session.rpc.call.assert_called_with('robot.stop', None)

    def test_repeat_claim_cannot_reset_sequence(self):
        self.gateway.request('/stop', {'token': self.token, 'sequence': 10}, 1)
        self.gateway.request('/claim', {'token': self.token}, 2)
        with self.assertRaises(ValueError):
            self.gateway.request('/stop', {'token': self.token, 'sequence': 9}, 3)


class ExternalPresentationTests(unittest.TestCase):
    @patch('botlab_microduck_native.gateway.NativeMicroDuckSession')
    def test_external_reset_reopens_native_session_without_video(self, session):
        gateway = Gateway('external')
        gateway.start()
        gateway.session.rpc.call.return_value = {'result': {}}
        gateway.session.tof.latest = {}
        token = 'external-viewer-session'
        snapshot = gateway.request('/claim', {'token': token}, 0)
        self.assertEqual(snapshot['presentation'], 'external')
        self.assertEqual(snapshot['protocolVersion'], 1)
        self.assertEqual(snapshot['frameTime'], 0)
        gateway.request('/reset', {'token': token, 'sequence': 1}, 1)
        self.assertEqual(session.call_count, 2)
        session.assert_called_with('app', viewer=True)
        self.assertIsNone(gateway.video)
        session.return_value.start.return_value.close.assert_called_once()

    def test_closed_window_ends_the_session(self):
        from botlab_microduck_native.session import NativeMicroDuckSession, ViewerClosed
        session = NativeMicroDuckSession.__new__(NativeMicroDuckSession)
        session.viewer = True
        session.procs = [Mock()]
        session.procs[0].poll.return_value = 0
        with self.assertRaises(ViewerClosed):
            session.check_health()

    def test_failed_service_is_not_a_normal_window_close(self):
        from botlab_microduck_native.session import NativeMicroDuckSession
        session = NativeMicroDuckSession.__new__(NativeMicroDuckSession)
        session.viewer = True
        session.procs = [Mock(), Mock()]
        session.procs[0].poll.return_value = None
        session.procs[1].poll.return_value = 1
        with self.assertRaises(RuntimeError):
            session.check_health()
