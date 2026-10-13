import {
  createMicroduckMujocoSession,
  loadMicroduckMujocoManifest,
} from '@botlab/simulators-microduck-mujoco';
import {
  createJumperWalkingSession,
  loadJumperWalkingManifest,
} from '@botlab/simulators-jumper';
export async function probeProximity(robot: 'microduck' | 'jumper') {
  const session =
    robot === 'microduck'
      ? createMicroduckMujocoSession()
      : createJumperWalkingSession();
  const manifest = await (robot === 'microduck'
    ? loadMicroduckMujocoManifest(undefined, 'obstacles')
    : loadJumperWalkingManifest(undefined, 'obstacles'));
  const trace = [];
  try {
    const loaded = await session.load(manifest);
    for (let i = 0; i < 15; i++) {
      const reading = await session.command({
        kind: 'proximity',
        thresholdMeters: 0.3,
      });
      trace.push(reading);
      if (reading.proximity?.value)
        return {
          robot,
          manifestId: manifest.id,
          initial: loaded.frame.rootPosition,
          trace,
        };
      const result = await session.command({
        kind: 'distance',
        distanceMeters: 0.15,
        speed: robot === 'microduck' ? 0.25 : 0.24,
        timeoutSeconds: 18.75,
      });
      trace.push(result);
    }
    throw new Error('No obstacle reached in 15 advances');
  } catch (error) {
    return { robot, error: String(error), trace };
  } finally {
    session.dispose();
  }
}
