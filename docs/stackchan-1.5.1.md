# StackChan factory firmware 1.5.1 compatibility

Investigated 2026-09-16. Device: owner's Kickstarter StackChan, version 1.5.1 as reported by the owner. The owner successfully connected through DANCE Bluetooth and confirmed the −10°/0°/+10° manual head positions.

## Verified upstream implementation

Official repository revision: `1b5765599fba8aaad1811d9a79358ccc7051f5f3`. Its [firmware CMakeLists.txt](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/CMakeLists.txt) declares 1.5.1. This is source compatibility evidence, not proof that the installed binary exactly matches that revision. M5Stack notes that public source updates can lag released firmware.

- [Avatar WebSocket service](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/hal/hal_ws_avatar.cpp): robot connects outbound to `/stackChan/ws?deviceType=StackChan`, with Authorization. It is not a documented local HTTP expression endpoint.
- [Relay](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/server/internal/web_socket/web_socket.go): app uses `deviceType=App` and `deviceId`, with authentication. Expression frame is type `0x03`, four-byte big-endian payload length, then 12 ASCII target-MAC characters and UTF-8 JSON. Relay removes the MAC and rebuilds the frame for the robot. Do not send the app frame directly to the firmware.
- [JSON parser](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/stackchan/json/json_helper.cpp): `leftEye`, `rightEye`, and `mouth` objects accept integer feature settings. It does not accept a named `emotion` field on this route.
- [Default eye presets](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/stackchan/avatar/skins/default/eyes.cpp): happy uses weight 72 and opposite rotations of 1550; neutral uses weight 100 and rotation zero. BotLab's first encoder changes only those eye fields.
- [AVATAR app](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/apps/app_avatar/app_avatar.cpp): subscribes to avatar messages. BLE handlers exist, but its BLE startup call is commented out. BLE cannot yet be assumed to provide an available control route in this mode.

## Current priority: horizontal servo trial

### Direct DANCE Bluetooth route

Further source inspection found [DANCE](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/apps/app_dance/app_dance.cpp), which starts BLE and applies motion JSON. This is the current trial route. The owner confirmed DANCE is open and the robot is nearby. The cloud URL/public key are placeholders in the public mobile app, so the relay route remains unconfigured.

Service `e2e5e5e0-1234-5678-1234-56789abcdef0`, motion characteristic `e2e5e5e1-1234-5678-1234-56789abcdef0`. The [GATT handler](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/hal/utils/bleprph/gatt_svr.c) exposes writes with response. Its read operation returns the last incoming buffer, not measured servo position. Do not use it as position feedback.

BotLab uses the [firmware fragmentation protocol](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/hal/hal_ble.cpp): `AA 55 C3 01`, big-endian uint16 packet index/count/total JSON length, followed by up to 10 payload bytes. Sequential packets fit the minimum 20-byte ATT payload. No WebSocket MAC prefix or message-type byte is included.

The panel requests a device only after a user click, writes nothing on connection, and offers absolute yaw -10/0/+10 degrees at speed 100 after the owner checks the head is near its calibrated center. Browser GATT acknowledgement is recorded/displayed as sent, not physically completed. Disconnect does not stop a command already received. Project switch/unmount aborts pending operations and closes the connection. Bounded block execution is now implemented in a separate DANCE executor; it does not enable the generic hardware runtime.

[Chrome requires a secure context and a user gesture for the Bluetooth picker](https://developer.chrome.com/docs/capabilities/bluetooth). Open the local app in Chrome and press Connect Bluetooth. No firmware flashing or cloud credentials are needed by this route.

The owner selected servo movement before expressions. The expression encoder remains a tested preparation utility, not the next physical action.

[Servo hardware mapping](https://github.com/m5stack/StackChan/blob/1b5765599fba8aaad1811d9a79358ccc7051f5f3/firmware/main/hal/hal_servo.cpp) establishes angle units of tenths of a degree. The JSON parser accepts `yawServo: {angle, speed}` via message type `0x04`; an integer `rotate` field takes precedence and selects continuous rotation, so the trial encoder never includes it. `speed` is a 0–1000 control scale, not degrees per second.

`encodeStackChanYawFrame` restricts absolute destinations to -20…+20 whole degrees and fixes speed at 100. These are conservative trial restrictions, not the device's full range. A destination bound does not bound travel from an unknown initial pose.

Before sending, establish a known starting pose with the owner and a working authenticated connection. The intended first trial is a 10-degree horizontal displacement from that known pose and return, with each destination within the trial range. Do not automatically center an unknown pose. Do not treat a timed delay as proof of arrival or a return-to-origin command as an emergency stop.

The relay and app define `GetAvatarPosture` (`0x15`), but the inspected firmware WebSocket handler has no matching case. Automatic initial-pose readback and stop acknowledgement are unresolved. The owner has confirmed the manual trial positions. Position/stall feedback and an acknowledged emergency stop remain unavailable on this route.

## Expression trial (deferred)

1. Owner powers on the robot, connects Wi-Fi, and confirms StackChan World binding and working AVATAR control.
2. Verify a supported authenticated client session for the owner's robot. Do not derive private service keys, reuse unrelated credentials, or assume public source supplies production access. No credentials belong in this repository or chat.
3. Read connection/device status and confirm exact target identity before enabling sending. The current encoder alone does not implement this step.
4. Send one happy eye frame, then neutral after a short visible interval. This duration is scheduled by the client; firmware does not provide a duration field or automatic restoration in this message. A lost connection can leave the expression displayed; reopening AVATAR is the manual fallback to check on the device.
5. Record owner-observed display change separately from transport acknowledgement. This route has no per-command completion acknowledgement in the inspected handler. A successful send must be recorded as `dispatched`, never hardware `completed` merely because bytes were sent.

The expression/cloud route remains deferred. Horizontal motion and LEDs use DANCE Bluetooth directly, without cloud credentials or firmware replacement. The generic target retains `planned` status; the dedicated BLE executor is available from the StackChan panel.

## Bounded head and LED programs

<!-- implementation limits from ../libs/adapters/stackchan/src/lib/program.ts, bluetooth.ts, factory-protocol.ts and ../apps/botlab-web/src/app/stackchan-execution-machine.ts -->

- Whole-degree absolute yaw ±20°, speed 100/1000, changes at most 10° from the last commanded position. The first position assumes the owner-checked calibrated center. No pitch or continuous rotation.
- After a motion write finishes, a scheduling pause of 1 second plus 0.2 seconds per commanded degree applies (1–3 seconds within the permitted change). Every 12th motion adds a 10-second rest, including manual controls; further movements require no reconnection. Programs are checked before writes for 90 seconds scheduled time including rests and 40 expanded actions. There is no cumulative travel or session move cap. Repeats allow 0–10 iterations and four levels of nesting. These timings are application scheduling rules, not measured arrival times or a thermal model. The executor also waits for any pending connection cooldown before a new movement.
- RGB characteristic `e2e5e5e4-1234-5678-1234-56789abcdef0` accepts `leftRgbDuration`, `leftRgbColor`, `rightRgbDuration`, `rightRgbColor`, as verified in the upstream JSON parser. Brightness scales color channels to at most 25%. Duration 0.5 s means a color transition, not an automatic off timer. Each LED action waits one second before the next action.
- The executor snapshots and preflights the complete program. Edits/cancel/unmount disconnect and prevent later writes; no automatic retry, center, or LED-off commands are sent after cancellation. BLE has a 10-second operation timeout; the UI aborts a program after 120 seconds.
- Dispatch acknowledgement does not establish physical position or absence of a stall. Limits reduce risk but cannot guarantee mechanical safety. Disconnect does not stop a movement already accepted. Keep the head and cables clear; the vertical axis stays unavailable pending calibration.

Validation covers encoding, unsafe-plan rejection before writes, cooldown/session limits, expansion, snapshot isolation, cancellation, and failed writes. Browser acceptance uses real Scratch blocks and a mocked Bluetooth device to execute LED → +10° yaw → center → off and cancel a second sequence. New LED and automated sequence behavior still require physical observation by the owner.
