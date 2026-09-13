/** Real Unix-socket smoke check of the browser-safe native library client. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import nativeLibrary from '../../../dist/libs/simulators/microduck-native/src/index.js';
const { createNativeMicroDuckClient } = nativeLibrary;

const socket = createConnection(process.argv[2]);
socket.setEncoding('utf8');
await once(socket, 'connect');
let stateCount = 0;
const client = createNativeMicroDuckClient(
  {
    send: (line) => {
      socket.write(line);
    },
    subscribe: ({ data, closed }) => {
      const ended = () => closed();
      socket.on('data', data);
      socket.on('error', closed);
      socket.on('close', ended);
      return () => {
        socket.off('data', data);
        socket.off('error', closed);
        socket.off('close', ended);
      };
    },
    close: () => {
      socket.destroy();
    },
  },
  {
    onNotification: ({ method }) => {
      if (method === 'robot.state') stateCount++;
    },
  }
);

try {
  const subscription = await client.subscribeRobot();
  assert.equal(subscription.accepted, true);
  let health;
  const deadline = Date.now() + 5000;
  do {
    health = await client.health();
    if (health.healthy) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  assert.equal(health.healthy, true, 'native control loop did not become healthy');
  const stopped = await client.stop();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(stateCount > 0, 'expected native telemetry');
  assert.equal(stopped.accepted, true);
  console.log(JSON.stringify({ subscription, health, stopped, stateCount }));
} finally {
  client.dispose();
}
