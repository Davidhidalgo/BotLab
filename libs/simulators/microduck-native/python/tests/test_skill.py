import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from botlab_microduck_native.program import Program, validate_program
from botlab_microduck_native.skill import SkillAction
from botlab_microduck_native.gateway import Gateway


class SkillTests(unittest.TestCase):
    def test_requires_observed_start_and_stable_recovery(self):
        action = SkillAction('kick_left', 0)
        standing = SimpleNamespace(stable='stand')
        unstable = SimpleNamespace(stable=None)
        self.assertEqual(action.tick({'policy': 'stand'}, standing, 0), 'kick_left')
        action.accepted = True
        self.assertIsNone(action.tick({'policy': 'stand'}, standing, 0.2))
        self.assertFalse(action.completed)
        action.tick({'policy': 'kick_left'}, unstable, 0.4)
        action.tick({'policy': 'kick_left:unwind'}, unstable, 1)
        self.assertFalse(action.completed)
        action.tick({'policy': 'stand'}, unstable, 2)
        self.assertFalse(action.completed)
        action.tick({'policy': 'stand'}, standing, 2.7)
        self.assertTrue(action.completed)

    def test_refuses_unstable_posture_and_missing_start(self):
        with self.assertRaises(ValueError):
            SkillAction('kick_right', 0).tick({'policy': 'stand'}, SimpleNamespace(stable=None), 0)
        action = SkillAction('kick_right', 0)
        action.tick({'policy': 'stand'}, SimpleNamespace(stable='stand'), 0)
        action.accepted = True
        with self.assertRaises(TimeoutError):
            action.tick({'policy': 'stand'}, SimpleNamespace(stable='stand'), 3.1)

    def test_program_dispatches_once_then_advances_after_recovery(self):
        state = {'safety': {'fallen': False, 'limp': False}, 'policy': 'stand'}
        posture = SimpleNamespace(stable='stand')
        program = Program('test', [{'kind': 'skill', 'value': 'kick_left'}], 0)
        program.tick(state, 0, posture)
        self.assertEqual(program.skill_request, 'kick_left')
        program.skill_request = None
        program.skill_action.accepted = True
        state['policy'] = 'kick_left'
        program.tick(state, .2, SimpleNamespace(stable=None))
        state['policy'] = 'stand'
        program.tick(state, 2, posture)
        self.assertEqual(program.status, 'completed')

    def test_rejects_unknown_skill(self):
        with self.assertRaises(ValueError):
            validate_program([{'kind': 'skill', 'value': '../unknown'}])
        self.assertEqual(validate_program([{'kind': 'skill', 'value': 'polite-bow'}]),
                         [{'kind': 'skill', 'value': 'polite-bow'}])

    def test_gateway_import_advertises_only_loaded_skill(self):
        gateway = Gateway()
        gateway.owner = 'a-long-valid-session-token'
        gateway.session = SimpleNamespace(tof=SimpleNamespace(latest={}))
        gateway.rpc = Mock(side_effect=[
            {'accepted': True},
            {'skills': ['polite-bow']},
            {'skills': [{'name': 'polite-bow'}]},
            {'skills': ['polite-bow']},
            {'skills': [{'name': 'polite-bow'}]},
        ])
        skill = {'repo': 'owner/model', 'revision': 'a' * 40, 'filename': 'policy.onnx',
                 'name': 'polite-bow', 'duration': 4, 'path': '/tmp/policy.onnx', 'sha256': 'b' * 64}
        with patch('botlab_microduck_native.gateway.fetch_skill', return_value=skill):
            snapshot = gateway.request('/import-skill', {
                'token': gateway.owner, 'sequence': 1, 'repo': 'owner/model',
                'name': 'polite-bow', 'duration': 4,
            }, 1)
        self.assertEqual(snapshot['capabilities']['executableSkills'], ['polite-bow'])
        self.assertEqual(snapshot['importedSkills'][0]['name'], 'polite-bow')
        self.assertNotIn('path', snapshot['importedSkills'][0])


if __name__ == '__main__':
    unittest.main()
