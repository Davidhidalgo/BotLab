/** Typed robot actions and branches, independent of editor XML and native transport. */
export interface ProgramIteration {
  sourceBlockId?: string;
  iteration: number;
  count: number;
}

export type RobotPosture = 'sit' | 'stand';
export type PostureCondition = {
  type: 'posture';
  posture: RobotPosture | 'transitioning';
  sourceBlockId?: string;
};
export type MicroDuckProgramStep = { sourceBlockId?: string } & (
  | { type: 'leds'; pattern: string }
  | { type: 'walk'; distanceMeters: number; backward?: boolean }
  | { type: 'turn'; angleDegrees: number }
  | { type: 'walk-until-obstacle' }
  | { type: 'turn-until-clear'; direction: 'left' | 'right' }
  | { type: 'wait'; seconds: number }
  | { type: 'posture'; posture: RobotPosture }
  | { type: 'skill'; skill: string }
  | { type: 'repeat'; count: number; body: MicroDuckProgramStep[] }
  | {
      type: 'if';
      condition: PostureCondition;
      then: MicroDuckProgramStep[];
      else: MicroDuckProgramStep[];
    }
);
