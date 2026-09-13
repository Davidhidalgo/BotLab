"""Render read-only body truth with the same model; never advance a second physics world."""
from io import BytesIO
import mujoco
from PIL import Image
from .session import RL

JOINTS = ('left_hip_yaw', 'left_hip_roll', 'left_hip_pitch', 'left_knee', 'left_ankle',
          'neck_pitch', 'head_pitch', 'head_yaw', 'head_roll', 'mouth',
          'right_hip_yaw', 'right_hip_roll', 'right_hip_pitch', 'right_knee', 'right_ankle')


class Renderer:
    def __init__(self):
        self.model = mujoco.MjModel.from_xml_path(str(RL / 'src/mjlab_microduck/robot/microduck/scene.xml'))
        self.data = mujoco.MjData(self.model)
        self.renderer = mujoco.Renderer(self.model, height=480, width=640)
        self.camera = mujoco.MjvCamera()
        self.camera.distance = 0.8
        self.camera.azimuth = 135
        self.camera.elevation = -20
        self.joints = []
        for wire, name in enumerate(JOINTS):
            actuator = mujoco.mj_name2id(self.model, mujoco.mjtObj.mjOBJ_ACTUATOR, name)
            if actuator >= 0:
                self.joints.append((wire, self.model.jnt_qposadr[self.model.actuator_trnid[actuator, 0]]))
        self.trunk = self.model.joint('trunk_base_freejoint').qposadr[0]

    def frame(self, truth):
        self.data.qpos[self.trunk:self.trunk + 3] = truth['trunk']
        self.data.qpos[self.trunk + 3:self.trunk + 7] = truth['imu']['quat']
        for wire, address in self.joints:
            self.data.qpos[address] = truth['positions'][wire]
        mujoco.mj_forward(self.model, self.data)
        self.camera.lookat[:] = truth['trunk']
        self.camera.lookat[2] += 0.04
        self.renderer.update_scene(self.data, camera=self.camera)
        # Floor reflections cost an extra scene pass; retain shadows and robot geometry.
        self.renderer.scene.flags[mujoco.mjtRndFlag.mjRND_REFLECTION] = False
        output = BytesIO()
        Image.fromarray(self.renderer.render()).save(output, format='JPEG', quality=85)
        return output.getvalue()

    def close(self):
        self.renderer.close()
