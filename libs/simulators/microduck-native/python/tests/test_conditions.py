import pathlib
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from botlab_microduck_native.program import Program, validate_program
from botlab_microduck_native.posture import PostureObserver
from botlab_microduck_native.gateway import Gateway
from test_posture import state, settled


def branch(posture='sit', yes=None, no=None, block='if'):
    return {'kind': 'if', 'condition': {'posture': posture, 'sourceBlockId': 'predicate'},
            'then': yes or [], 'else': no or [], 'sourceBlockId': block}


def wait(block):
    return {'kind': 'wait', 'value': 0, 'sourceBlockId': block}


class ConditionTests(unittest.TestCase):
    def test_selects_only_one_branch_and_continues_after_it(self):
        for observed, expected in [('sit', 'yes'), ('stand', 'no')]:
            observer = settled(observed, .06 if observed == 'sit' else .116)
            steps = [branch(yes=[wait('yes')], no=[wait('no')]), wait('after')]
            program = Program('if', steps, 0)
            visited = []
            for tick in range(3):
                visited.append(program.snapshot()['step']['sourceBlockId'])
                program.tick(state(observed), 1 + tick, observer)
            self.assertEqual(visited, ['if', expected, 'after'])
            self.assertEqual(program.status, 'completed')
            self.assertEqual(program.decisions[0]['result'], observed == 'sit')
            self.assertEqual(len(steps), 2)  # Execution must not mutate the submitted tree.

    def test_nested_branch_uses_observation_at_execution_time(self):
        program = Program('nested', [branch('stand', [branch('sit', [wait('changed')], [wait('old')])])], 0)
        program.tick(state(), 1, settled())
        program.tick(state('sit', .06), 2, settled('sit', .06))
        self.assertEqual(program.snapshot()['step']['sourceBlockId'], 'changed')
        self.assertEqual([d['observed'] for d in program.decisions], ['stand', 'sit'])

    def test_empty_branches_complete(self):
        program = Program('empty', [branch()], 0)
        program.tick(state(), 1, settled())
        self.assertEqual(program.status, 'completed')

    def test_unknown_is_an_error_not_false(self):
        program = Program('unknown', [branch(no=[wait('must-not-run')])], 0)
        program.tick(state(), 1, PostureObserver())
        self.assertEqual(program.status, 'failed')
        self.assertEqual(program.snapshot()['errorCode'], 'posture-unknown')
        self.assertEqual(program.index, 0)
        self.assertEqual(program.decisions, [])

    def test_transition_is_observable_after_cancel_and_expires(self):
        observer = settled()
        observer.invalidate(1)
        observer.observe(state('sit', .11), 1.1)
        program = Program('transition', [branch('transitioning', [wait('yes')])], 1)
        program.tick(state('sit', .11), 1.2, observer)
        self.assertTrue(program.decisions[0]['result'])
        observer.observe(state('sit', .11), 14)
        self.assertEqual(observer.observed, 'unknown')

    def test_cancel_before_decision_or_inside_branch_dispatches_nothing_more(self):
        for ticks in (0, 1):
            program = Program('cancel', [branch('stand', [{'kind': 'posture', 'value': 'sit'}])], 0)
            if ticks:
                program.tick(state(), 1, settled())
            program.stop()
            program.tick(state(), 2, settled())
            self.assertIsNone(program.skill_request)
            self.assertEqual(program.index, ticks)
            self.assertEqual(program.status, 'stopped')

    def test_validates_unselected_branches_and_total_size(self):
        for steps in ([branch(no=[{'kind': 'wait', 'value': -1}])],
                      [branch(yes=[wait('a')] * 128, no=[wait('b')] * 128)],
                      [dict(branch(), condition={'posture': 'flying'})]):
            with self.assertRaises(ValueError):
                validate_program(steps)

    def test_nesting_is_bounded(self):
        nested = [wait('leaf')]
        for _ in range(17):
            nested = [branch(yes=nested)]
        with self.assertRaises(ValueError):
            validate_program(nested)

    def test_fall_invalidates_observation(self):
        observer = settled()
        fallen = state()
        fallen['safety']['fallen'] = True
        observer.observe(fallen, 1)
        self.assertEqual(observer.observed, 'unknown')

    def test_walk_cannot_start_during_transition(self):
        observer = settled()
        observer.invalidate(1)
        program = Program('walk', [{'kind': 'walk', 'value': 1}], 1)
        self.assertEqual(program.tick(state(), 1.1, observer), {})
        self.assertEqual(program.status, 'failed')

    def test_gateway_allows_conditions_during_transition_and_checks_nested_capability(self):
        gateway = Gateway()
        gateway.session = SimpleNamespace(tof=SimpleNamespace(latest={}))
        gateway.owner = 'condition-test-token'
        gateway.refresh_capabilities = Mock()
        gateway.posture.invalidate(1)
        gateway.request('/run', {'token': gateway.owner, 'sequence': 1, 'runId': 'if',
                                'steps': [branch('transitioning')]}, 1)
        self.assertEqual(gateway.program.status, 'running')
        gateway.program.stop()
        with self.assertRaisesRegex(ValueError, 'capability'):
            gateway.request('/run', {'token': gateway.owner, 'sequence': 2, 'runId': 'if',
                                    'steps': [branch(no=[{'kind': 'posture', 'value': 'sit'}])]}, 2)

    def test_movement_hands_off_only_after_standing_stabilizes(self):
        program = Program('handoff', [{'kind': 'walk', 'value': .25}, branch('stand')], 0)
        observer = settled()
        program.tick(state(), 0, observer)
        arrived = state('walk')
        arrived['odom']['position'][0] = .26
        observer.observe(arrived, 1)
        program.tick(arrived, 1, observer)
        program.tick(arrived, 2, observer)
        self.assertEqual(program.index, 0)
        self.assertEqual(program.status, 'running')
        arrived['policy'] = 'stand'
        observer = settled()
        program.tick(arrived, 3, observer)
        program.tick(arrived, 4, observer)
        self.assertTrue(program.decisions[0]['result'])
        self.assertEqual(program.status, 'completed')
