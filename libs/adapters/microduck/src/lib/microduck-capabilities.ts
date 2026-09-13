import type { Capability } from '@botlab/model';

/** Convert discovered, executable native features to BotLab capability contracts. */
export function nativeMicroDuckCapabilities(
  discovery:
    | { skills: readonly string[]; postures: readonly string[] }
    | undefined,
  targetId: string
): Capability[] {
  if (!discovery?.skills.includes('sit_toggle')) return [];
  const postures = ['sit', 'stand'].filter((p) =>
    discovery.postures.includes(p)
  );
  if (!postures.length) return [];
  return [
    {
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
    },
  ];
}
