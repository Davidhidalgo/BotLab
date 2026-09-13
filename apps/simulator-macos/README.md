# BotLab Simulator for macOS

Simulator companion for the web editor, initially bundling MicroDuck. The editor remains a web app; the companion owns the local simulator and its MuJoCo window.

## Build and open

<!-- build and output from build.py, project.json and ../../package.json -->

On an Apple Silicon Mac, prepare the pinned native cache following [the native setup](../../tools/microduck/native/README.md), then run:

```sh
npm run build:simulator-macos
open 'dist/apps/simulator-macos/BotLab Simulator.app'
```

The build requires Python 3 and Xcode command-line tools. The resulting `.app` includes standalone CPython, MuJoCo, ONNX Runtime, the compiled robot/ToF daemons, policies and scene resources. Opening it requires none of the build tools or the source repository. The build checks for escaping symlinks and applies a local ad-hoc signature. Developer ID signing, notarization and the complete distribution/license audit remain release work; this is a local development build.

## Use

<!-- application lifecycle from Simulator.swift and ../../libs/simulators/microduck-native/python/botlab_microduck_native/gateway.py -->

Double-click **BotLab Simulator.app**. The host reads `simulators.json`. A single installed simulator starts automatically; multiple entries show a selector and Start button, allowing one active simulator at a time. The startup window hides when the native scene is ready. The Dock icon reopens the status window; **Open Editor** opens `http://localhost:4200`. Start the web editor separately during development (`npm run dev`), select **Native MuJoCo**, then **Connect**. The editor detects the external presentation, shows commands/progress/sensors and requests no video. The iframe and embedded MJPEG modes remain available.

Closing the native scene exits the companion and cleans up its services. **Quit BotLab Simulator** also stops the owned gateway and services. Disconnecting or losing the browser stops the active program and leaves the viewer idle; reconnecting does not resume it. Reset replaces the scene and opens a fresh native window. The companion watches its parent process and refuses conflicting local ports; it never kills another simulator to take its place. Opening the same app again through Finder uses the existing application instance.

Logs and traces are written to `~/Library/Logs/BotLab Simulator`, outside the bundle. **Show Logs** opens that directory. The gateway allows only the local editor origins on port 4200, binds to loopback port 4401, and uses body port 17831. Close other native probes/gateways before launching the companion. A hosted editor URL, custom URL scheme and automatic updates are not configured in this prototype.

## Verify

<!-- verification from ../../tools/microduck/native/verify-app.mjs and native body_server.py -->

With the companion and web editor open:

```sh
BOTLAB_NATIVE_PRESENTATION=external npm run test:simulator-native-app
```

Set `BOTLAB_PLAYWRIGHT_MODULE` if Playwright is installed outside the workspace. The check covers movement/turn/wait, reset, posture, explicit stop, iframe fallback and browser loss, and asserts zero video requests in external mode. Library tests cover presentation compatibility, reset ownership and service/window termination. Verify packaging by copying the whole `.app` outside the checkout and opening that copy.

The native presentation loop synchronizes the scene once per 50 Hz physics pass. Session logs include `viewer-metrics.json` on a clean close, containing scene synchronization rate and p95 intervals. These are not display FPS measurements. Physics, protocol and robot dynamics remain in the pinned upstream implementation.

## Simulator packages

<!-- installed catalog and launch descriptors from simulators.json and Simulator.swift -->

The Mac host does not hard-code a robot module, Python path or editor endpoint. Catalog version 1 supplies simulator ID/name, bundled executable, arguments, environment, health URL and editor URL. Resource/log/parent-PID placeholders are expanded at launch. Readiness requires matching protocol version, simulator ID, external presentation and owned process PID. Only MicroDuck is installed and tested today; the build still assembles its pinned resources.

Downloadable simulator packages and optional all-included/offline bundles are planned in [the implementation plan](../../docs/implementation-plan.md#multi-simulator-distribution-direction). The current app contains all MicroDuck dependencies (approximately 332 MB uncompressed); it has no downloader yet. Windows is deferred, sharing the simulator protocol/package approach while using its own launcher and runtime packaging.
