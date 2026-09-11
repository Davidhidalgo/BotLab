# BotLab Glossary

This glossary keeps shared language stable across the editor, runtime, adapters, simulators, and docs.

## Adapter

A package that describes and connects a robot family or target type to BotLab. Adapters expose targets and capabilities through shared model contracts.

## Arbitration

The strategy used when multiple behaviors want to control the same capability. Initial strategies include priority, exclusive lock, and cooperative control.

## Artifact

A generated or stored piece of BotLab data. Examples include block workspaces, compiled plans, traces, logs, simulator outputs, and deployment payloads.

## Behavior

A user-authored program, usually created visually, that combines skills and execution rules into something BotLab can schedule or run.

## Blocks Workspace

The editable visual programming state owned by the block editor boundary. It may be stored as XML, JSON, or a normalized internal format in later milestones.

## Capability

A robot or simulator affordance that BotLab can command or observe, such as lights, motion, sound, sensors, expressions, vision, or simulation controls.

## Compiled Behavior

A behavior transformed from editor data into a runtime-ready representation. The compiled form should be explicit enough for policy checks, scheduling, and dispatch.

## Introspection

Runtime state exposed for inspection, including target health, active behaviors, policy results, telemetry, diagnostics, and recent events.

## MicroDuck

The first planned physical robot target family for BotLab.

## Policy

Rules evaluated before or during execution. Policies can cover safety, resource limits, target compatibility, environment constraints, and user confirmation.

## Runtime

The package responsible for loading behaviors, applying policy, scheduling work, arbitrating conflicts, dispatching commands, and publishing introspection.

## Scheduler

The part of the runtime that decides when behaviors run. Initial modes include manual, event-driven, and timed execution.

## Simulator Integration

A bridge between BotLab and an official simulator package or process. Shared simulator contracts should stay behind `@botlab/simulators-core`; robot-specific simulator work should live in packages such as `@botlab/simulators-microduck`.

## Skill

A reusable robot ability backed by one or more capabilities and constrained by policy. Skills are expected to become block metadata in the visual editor.

## StackChan

A planned future robot target family, currently represented as an adapter placeholder.

## Target

A specific robot or simulator destination that can receive behavior execution through an adapter or simulator integration.
