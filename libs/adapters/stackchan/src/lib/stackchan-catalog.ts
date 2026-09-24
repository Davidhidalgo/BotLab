import type { Policy, RobotCatalog, Skill } from '@botlab/model';

export const stackChanExpressionSkill: Skill = {
  id: 'set-stackchan-expression',
  name: 'Set StackChan Expression',
  description: 'Display a facial expression on a future StackChan target.',
  capabilityIds: ['stackchan-expression'],
  policyIds: ['planned-targets-disabled'],
  requiredCapabilities: ['expression'],
  inputs: [
    {
      id: 'expression',
      name: 'Expression',
      type: 'enum',
      required: true,
      description: 'Expression preset to display.',
    },
  ],
  outputs: [],
  generatedBlock: {
    blockType: 'stackchan_set_expression',
    label: 'set StackChan expression',
    category: 'StackChan',
    color: '#047857',
  },
};

/** The generic runtime target stays planned; Bluetooth programs run outside the runtime. */
export const stackChanPlannedTargetPolicy: Policy = {
  id: 'planned-targets-disabled',
  name: 'Deny planned targets',
  rules: [
    {
      id: 'deny-planned-target',
      category: 'target',
      effect: 'deny',
      description:
        'Do not execute behavior plans against targets that are not implemented.',
      targetIds: ['stackchan-planned'],
    },
  ],
};

/** StackChan skills and policies contributed to host runtimes. */
export const stackChanCatalog: RobotCatalog = {
  skills: [stackChanExpressionSkill],
  policies: [stackChanPlannedTargetPolicy],
  behaviors: [],
};
