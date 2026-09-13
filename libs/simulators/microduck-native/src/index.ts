export { createNativeMicroDuckClient } from './lib/native-client';
export type {
  NativeMicroDuckClientOptions,
  NativeMicroDuckNotification,
  NativeMicroDuckTransport,
  NativeMicroDuckVelocity,
} from './lib/native-client';
export {
  createNativeAppConnection,
  createNativeProgram,
} from './lib/app-connection';
export type {
  NativeAppConnection,
  NativeAppSnapshot,
  NativeProgramStep,
} from './lib/app-connection';
