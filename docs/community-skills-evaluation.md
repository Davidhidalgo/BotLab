# Community MicroDuck skills: first import probe

Tested in the isolated native MuJoCo simulator on 2026-09-22. No physical robot was connected.

BotLab's native setup already downloads the pinned official ONNX policies from [Pollen Robotics on Hugging Face](https://huggingface.co/pollen-robotics/microduck-policies). The local daemon also supports `robot.setSkill`, so an additional ONNX file can be registered in one simulator session and discovered through `robot.skills` plus `robot.subscribe`.

The first community candidate was [fffiloni/microduck-polite-bow-b1d864](https://huggingface.co/fffiloni/microduck-polite-bow-b1d864), downloaded as `policy.onnx` from commit `9a9d21a85cf7b5cbd1854c03ad58bd949502a5ea` (`main` at download time). Its SHA-256 was `f2f777919cee080d2d172c635d4b6ead14c0e01a7065ac64bd21cc5fad14158c`. The test registered it as `polite-bow` with a 4-second duration, matching the [upstream MicroDuck example](https://github.com/pollen-robotics/microduck/blob/main/docs/robot/cheatsheet.md#adding-a-skill).

| Check                           | Observation                            |
| ------------------------------- | -------------------------------------- |
| `robot.setSkill`                | Accepted                               |
| Configured and loaded discovery | Both reported `polite-bow`             |
| `robot.do`                      | Accepted                               |
| Policy telemetry                | `stand → polite-bow → stand` in 4.08 s |
| Physical safety state           | `fallen: true` at the end              |

This candidate is available as an **experimental imported-skill block** in the native simulator. RPC acceptance and a return to the standing policy did not mean the simulated body had recovered. Skill execution therefore requires stable posture observations and fails on a fall. The importer records provenance, the resolved commit and the ONNX SHA-256; registration is not a successful movement test.

The project controls accept a public Hugging Face model URL, skill name and duration. Model page URLs use `main` and `policy.onnx`; tree and ONNX file URLs can specify a revision or file. The definitions persist with the project, and the block dropdown lists those names. On native connection, the app loads only models used in the connected program. The gateway resolves the revision to an immutable commit, downloads the ONNX into a local cache, calls `robot.setSkill`, and exposes the name only after the daemon reports it loaded. The block runs only in the native simulator and checks observed start, recovery and falls. GitHub release assets, automatic ONNX compatibility checks and an isolated preflight rehearsal remain future work.

To try it in the application, select MicroDuck, add the model URL beside the project controls, choose its name in an **execute imported skill** block under the green flag, then connect **MuJoCo native**. Wait for the model to load before running. The CLI [`tools/microduck/native/try-huggingface-skill.py`](../tools/microduck/native/try-huggingface-skill.py) remains available for an isolated trial with explicit revision and file arguments.
