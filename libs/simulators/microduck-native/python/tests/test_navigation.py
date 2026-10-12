import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from botlab_microduck_native.circuit import write_circuit_scene
from botlab_microduck_native.program import Program


def state(x=0, yaw=0):
    return {'odom': {'position': [x, 0, .12], 'yaw': yaw},
            'safety': {'fallen': False, 'limp': False}, 'policy': 'stand'}


def depth(seq, millimetres):
    distances = [0] * 64
    statuses = [255] * 64
    for index in (27, 28, 35, 36):
        distances[index] = millimetres
        statuses[index] = 5
    return {'seq': seq, 'rows': 8, 'cols': 8,
            'distance_mm': distances, 'status': statuses}


class NavigationTests(unittest.TestCase):
    def test_circuit_compiles_and_is_seen_by_front_sensor(self):
        try:
            import mujoco
            from mjlab_microduck.sim.tof import Tof
        except ImportError:
            self.skipTest('Prepared MuJoCo bundle is unavailable.')
        with tempfile.TemporaryDirectory() as directory:
            scene = write_circuit_scene(pathlib.Path(directory) / 'circuit.xml')
            model = mujoco.MjModel.from_xml_path(str(scene))
            data = mujoco.MjData(model)
            stand = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, 'STAND')
            mujoco.mj_resetDataKeyframe(model, data, stand)
            mujoco.mj_forward(model, data)
            site = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, 'tof')
            distances, statuses = Tof(model, site).frame(data)
            self.assertTrue(all(statuses[i] == 5 for i in (27, 28, 35, 36)))
            self.assertTrue(all(800 < distances[i] < 1300 for i in (27, 28, 35, 36)))

    def test_walk_stops_after_three_distinct_near_frames(self):
        program = Program('navigation', [{'kind': 'walk-until-obstacle', 'value': 1}], 0)
        self.assertEqual(program.tick(state(), 0, depth=depth(1, 1000)), {'vx': .25})
        self.assertEqual(program.tick(state(.01), .02, depth=depth(1, 1000)), {'vx': .25})
        self.assertEqual(program.tick(state(.01), .3, depth=depth(1, 1000)), {})
        self.assertEqual(program.tick(state(.5), 1, depth=depth(2, 390)), {})
        self.assertEqual(program.tick(state(.5), 1.1, depth=depth(2, 390)), {})
        self.assertEqual(program.tick(state(.5), 1.2, depth=depth(3, 390)), {})
        walking = state(.5)
        walking['policy'] = 'walk'
        program.tick(walking, 1.3, depth=depth(4, 390))
        self.assertEqual(program.status, 'running')
        program.tick(state(.5), 1.4, depth=depth(5, 390))
        self.assertEqual(program.status, 'completed')

    def test_turn_uses_sensor_and_fails_closed_when_readings_stop(self):
        program = Program('navigation', [{'kind': 'turn-until-clear', 'value': -1}], 0)
        self.assertEqual(program.tick(state(), 0, depth=depth(1, 250)), {'vyaw': 1.2})
        self.assertEqual(program.tick(state(yaw=1.2), 1, depth=depth(2, 900)), {})
        self.assertEqual(program.tick(state(yaw=1.2), 1.1, depth=depth(3, 900)), {})
        program.tick(state(yaw=1.2), 1.2, depth=depth(4, 900))
        self.assertEqual(program.status, 'completed')
        drift = Program('drift', [{'kind': 'turn-until-clear', 'value': -1}], 0)
        drift.tick(state(), 0, depth=depth(1, 250))
        turning = state(yaw=1.2)
        turning['policy'] = 'walk'
        for seq in (2, 3, 4):
            drift.tick(turning, 1 + seq / 10, depth=depth(seq, 900))
        self.assertEqual(drift.status, 'running')
        drift.tick(state(yaw=.4), 1.5, depth=depth(5, 300))
        self.assertEqual(drift.tick(state(yaw=.4), 1.6, depth=depth(6, 300)), {'vyaw': 1.2})
        lost = Program('lost', [{'kind': 'walk-until-obstacle', 'value': 1}], 0)
        self.assertEqual(lost.tick(state(), 0), {})
        self.assertEqual(lost.tick(state(), 2.1), {})
        self.assertEqual(lost.status, 'failed')


if __name__ == '__main__':
    unittest.main()
