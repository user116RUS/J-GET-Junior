# Native Mac verification

Date: 15 November 2026. Hardware: one Apple Silicon Mac running the existing Intel Electron runtime through Rosetta.

Before rebranding, the packaged Classroom .4 application was extracted into a fresh directory. Only a disposable copy was instrumented by prepending a QA bootstrap to its original entry shim. The production source, compiled cache and audio files were unchanged. Documents, Electron profile and test project data used isolated temporary directories.

`mac-baseline-create.json` records successful keyboard-trigger execution (x=240→264), collision with the selected target and rejection of a distant target, a paint-editor change saved as a new SVG, decoding of all 43 new audio files, and a sound reaching playing→ended. The project remained dirty and the native window was closed through the application's normal save-before-close handler.

`mac-baseline-reopen.json` records a second launch: costume, all four scripts (including keyboard, selected collision and sound), and coordinates were restored exactly; audio decoding and playback passed again.

The native probe is reproducible using `test/native/`. It calls real application APIs and IPC; it is not a physical input-device or classroom test. macOS Intel hardware and other macOS versions were not separately tested.
## Final J-GET Junior 1.3.2-jget.1

The final package passed the same native create/close/reopen sequence after rebranding, including the new robot costume and renamed executable/helper bundles. Evidence: `mac-native-create.json` and `mac-native-reopen.json`.

The final probe waits for all media and the loading curtain to finish. It checks both persisted runtime coordinates and the existing application behavior that returns sprites to their saved home coordinates on project load (`Project.getStarted` calls `Stage.resetPages`). The early baseline probe could observe a transient runtime position before that reset; it must not be interpreted as a promise to preserve the last animated stage position on screen.

Final result: native create/draw/keyboard/collision/audio/close/reopen PASS. All 12 source regression programs passed again after rebranding. The independently verified archive contains 9,016 matching regular files and 19 matching symlinks; executable permissions survive extraction with macOS `ditto`. See `mac-archive.json`, `mac-package.md`, and `mac-bundle.json`.

The Mac screen was locked during the final native probe, so this final pass does not claim a visual inspection of the running application. New icon/robot assets were visually checked separately. Tests used an isolated library and did not open the user's projects.
