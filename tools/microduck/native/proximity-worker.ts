import { createInterface } from 'node:readline';
import { createMicroDuckProximityTrigger } from '../../../libs/adapters/microduck/src/lib/microduck-proximity.ts';
const trigger = createMicroDuckProximityTrigger({
  enterDistanceM: 0.45,
  exitDistanceM: 0.6,
});
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.cancel) {
    trigger.cancel();
    process.stdout.write(JSON.stringify({ cancelled: true }) + '\n');
  } else {
    process.stdout.write(JSON.stringify(trigger.update(request.frame)) + '\n');
  }
}
