import type { Capability } from '@botlab/model';

/** Convert discovered, executable native features to BotLab capability contracts. */
export function nativeMicroDuckCapabilities(
  discovery:
    | { skills: readonly string[]; postures: readonly string[] }
    | undefined,
  targetId: string,
): Capability[] {
  if (!discovery) return [];
  const capabilities: Capability[] = [];
  const postures = ['sit', 'stand'].filter((p) =>
    discovery.postures.includes(p),
  );
  if (discovery.skills.includes('sit_toggle') && postures.length) {
    capabilities.push({
      id: 'microduck-posture',
      kind: 'motion',
      name: 'Posture',
      description: 'Observed native posture transitions.',
      targetIds: [targetId],
      schema: {
        commands: [
          {
            id: 'set-posture',
            name: 'Set posture',
            description: 'Reach and settle in a requested posture.',
            inputs: [
              {
                name: 'posture',
                type: 'enum',
                required: true,
                enumValues: postures,
              },
            ],
          },
        ],
        telemetry: [],
      },
    });
  }
  const skills = ['kick_left', 'kick_right'].filter((name) =>
    discovery.skills.includes(name),
  );
  if (skills.length)
    capabilities.push({
      id: 'microduck-native-skills',
      kind: 'motion',
      name: 'Native skills',
      description:
        'Observed one-shot actions on the connected native simulator.',
      targetIds: [targetId],
      schema: {
        commands: [
          {
            id: 'run-skill',
            name: 'Run skill',
            description:
              'Run one available native skill and wait for recovery.',
            inputs: [
              {
                name: 'skill',
                type: 'enum',
                required: true,
                enumValues: skills,
              },
            ],
          },
        ],
        telemetry: [],
      },
    });
  return capabilities;
}
