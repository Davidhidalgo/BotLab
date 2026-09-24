/** Typed MicroDuck actions and branches, independent of editor XML and native transport. */
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
  | { type: 'wait'; seconds: number }
  | { type: 'posture'; posture: RobotPosture }
  | { type: 'repeat'; count: number; body: MicroDuckProgramStep[] }
  | {
      type: 'if';
      condition: PostureCondition;
      then: MicroDuckProgramStep[];
      else: MicroDuckProgramStep[];
    }
);
