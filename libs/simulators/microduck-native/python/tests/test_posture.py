import pathlib
import sys
import unittest
from unittest.mock import Mock
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from botlab_microduck_native.posture import PostureObserver
from botlab_microduck_native.program import Program
from botlab_microduck_native.gateway import Gateway


def state(policy='stand', height=.116):
    return {'policy': policy, 'odom': {'position': [0, 0, height], 'yaw': 0},
            'imu': {'gyro': [0, 0, 0]}, 'safety': {'fallen': False, 'limp': False}}


def settled(policy='stand', height=.116):
    observer = PostureObserver()
    observer.observe(state(policy, height), 0)
    observer.observe(state(policy, height), .7)
    return observer


class PostureTests(unittest.TestCase):
    def test_policy_label_alone_is_not_completion(self):
        observer = PostureObserver()
        observer.observe(state('sit', .116), 0)
        observer.observe(state('sit', .095), .7)
        self.assertIsNone(observer.stable)
        observer.observe(state('sit', .06), 1.4)
        self.assertIsNone(observer.stable)
        observer.observe(state('sit', .06), 2.1)
        self.assertEqual(observer.stable, 'sit')

    def test_repeated_stand_never_toggles(self):
        observer = settled()
        program = Program('repeat', [{'kind': 'posture', 'value': 'stand'}] * 2, 0)
        for now in (1, 2):
            program.tick(state(), now, observer)
            self.assertIsNone(program.skill_request)
        self.assertEqual(program.status, 'failed')
        self.assertEqual(program.index, 0)
        self.assertEqual(program.snapshot()['errorCode'], 'posture-already-stand')

    def test_toggle_is_sent_once_and_waits_for_observed_settling(self):
        observer = settled()
        program = Program('sit', [{'kind': 'posture', 'value': 'sit'}], 0)
        program.tick(state(), 1, observer)
        self.assertEqual(program.skill_request, 'sit_toggle')
        observer.observe(state('sit', .11), 1.1)
        program.tick(state('sit', .11), 1.1, observer)
        self.assertIsNone(program.skill_request)
        self.assertEqual(program.status, 'running')
        observer.observe(state('sit', .06), 2)
        observer.observe(state('sit', .06), 2.7)
        program.tick(state('sit', .06), 2.7, observer)
        self.assertEqual(program.status, 'completed')

    def test_cancel_does_not_dispatch_the_next_posture(self):
        observer = settled()
        program = Program('cancel', [{'kind': 'posture', 'value': 'sit'}, {'kind': 'posture', 'value': 'stand'}], 0)
        program.tick(state(), 1, observer)
        program.skill_request = None  # First one-shot already dispatched.
        program.stop()
        observer.observe(state('sit', .06), 2)
        observer.observe(state('sit', .06), 3)
        program.tick(state('sit', .06), 3, observer)
        self.assertEqual(program.index, 0)
        self.assertIsNone(program.skill_request)
        self.assertEqual(program.status, 'stopped')

    def test_missing_transition_times_out_without_retry(self):
        observer = settled()
        program = Program('timeout', [{'kind': 'posture', 'value': 'sit'}], 0)
        program.tick(state(), 1, observer)
        program.tick(state(), 14, observer)
        self.assertEqual(program.status, 'failed')
        self.assertIn('timeout', program.error)

    def test_motion_from_sitting_fails_without_movement(self):
        program = Program('walk', [{'kind': 'walk', 'value': 1}], 0)
        self.assertEqual(program.tick(state('sit', .06), 1), {})
        self.assertEqual(program.status, 'failed')

    def test_discovery_intersects_loaded_and_configured_skills(self):
        gateway = Gateway()
        gateway.rpc = Mock(side_effect=[
            {'skills': ['kick_left'], 'sitstand': 'loaded.onnx'},
            {'skills': [{'name': 'kick_left'}, {'name': 'kick_right'}], 'built_in': ['sit_toggle']},
        ])
        gateway.refresh_capabilities()
        self.assertEqual(gateway.capabilities, {'skills': ['kick_left', 'sit_toggle'], 'executableSkills': ['kick_left'], 'postures': ['sit', 'stand'], 'postureConditions': ['sit', 'stand', 'transitioning']})

    def test_configured_but_unloaded_posture_is_unavailable(self):
        gateway = Gateway()
        gateway.rpc = Mock(side_effect=[{'skills': []}, {'skills': [], 'built_in': ['sit_toggle']}])
        gateway.refresh_capabilities()
        self.assertEqual(gateway.capabilities['postures'], [])

    def test_daemon_refusal_fails_program_without_advancing(self):
        from types import SimpleNamespace
        import threading
        gateway = Gateway()
        gateway.posture = settled()
        rpc = Mock()
        rpc.latest = {'robot.state': state()}
        rpc.messages = [{'at': 2, 'message': {'method': 'robot.state'}}]
        rpc.cv = threading.Condition()
        rpc.call.side_effect = lambda method, params: {'result': {'accepted': method != 'robot.do', 'reason': 'posture disabled'}}
        gateway.session = SimpleNamespace(check_health=Mock(), rpc=rpc, tof=SimpleNamespace(cv=threading.Condition(), messages=[], latest={}))
        gateway.program = Program('refused', [{'kind': 'posture', 'value': 'sit'}, {'kind': 'walk', 'value': 1}], 0)
        gateway.tick(2)
        self.assertEqual(gateway.program.status, 'failed')
        self.assertEqual(gateway.program.index, 0)
        self.assertEqual(gateway.program.error, 'posture disabled')
        self.assertEqual(gateway.posture.observed, 'unknown')

    def test_active_walk_allows_native_policy_to_switch_to_walk(self):
        program = Program('walking', [{'kind': 'walk', 'value': 1}], 0)
        self.assertEqual(program.tick(state(), 1), {'vx': .25})
        self.assertEqual(program.tick(state('walk'), 2), {'vx': .25})
        self.assertEqual(program.status, 'running')
