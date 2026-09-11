# BotLab Simulators

Simulator packages are split by responsibility:

- `core` contains shared contracts and helpers only.
- `microduck` contains MicroDuck-specific simulator integration code.

Heavy dependencies such as physics engines, WebAssembly assets, policy runtimes, meshes, or robot-specific bridges should stay in the robot simulator package that needs them.
