/** Pinned bundle controls; each reference starts on entry and returns through the official FSM. */
export const jumperPerformances = {
  jump: {
    mode: 'jump',
    file: 'jump.onnx',
    key: 'key_space',
    ctrl: false,
    observations: 167,
    actions: 20,
  },
  'gesture-hello': {
    mode: 'gesture_hello',
    file: 'gesture_hello.onnx',
    key: 'key_1',
    ctrl: false,
    observations: 209,
    actions: 22,
  },
  'gesture-bow': {
    mode: 'gesture_bow',
    file: 'gesture_bow.onnx',
    key: 'key_2',
    ctrl: false,
    observations: 209,
    actions: 22,
  },
  'gesture-paw': {
    mode: 'gesture_paw',
    file: 'gesture_paw.onnx',
    key: 'key_3',
    ctrl: false,
    observations: 209,
    actions: 22,
  },
  'gesture-salute': {
    mode: 'gesture_salute',
    file: 'gesture_salute.onnx',
    key: 'key_4',
    ctrl: false,
    observations: 209,
    actions: 22,
  },
  'dance-brazilian': {
    mode: 'dance_brazilian',
    file: 'dance_brazilian.onnx',
    key: 'key_2',
    ctrl: true,
    observations: 209,
    actions: 22,
  },
  'dance-crab': {
    mode: 'dance_crab',
    file: 'dance_crab.onnx',
    key: 'key_1',
    ctrl: true,
    observations: 209,
    actions: 22,
  },
  'dance-maze': {
    mode: 'dance_maze',
    file: 'dance_maze.onnx',
    key: 'key_3',
    ctrl: true,
    observations: 209,
    actions: 22,
  },
  'dance-dream-wings': {
    mode: 'dance_dream_wings',
    file: 'dance_dream_wings.onnx',
    key: 'key_4',
    ctrl: true,
    observations: 209,
    actions: 22,
  },
} as const;
export type JumperPerformance = keyof typeof jumperPerformances;
export function isJumperPerformance(name: string): name is JumperPerformance {
  return Object.prototype.hasOwnProperty.call(jumperPerformances, name);
}
