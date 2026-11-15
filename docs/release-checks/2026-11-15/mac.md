# Native Mac verification

Date: 15 November 2026. Hardware: one Apple Silicon Mac running the existing Intel Electron runtime through Rosetta.

Before rebranding, the packaged Classroom .4 application was extracted into a fresh directory. Only a disposable copy was instrumented by prepending a QA bootstrap to its original entry shim. The production source, compiled cache and audio files were unchanged. Documents, Electron profile and test project data used isolated temporary directories.

`mac-baseline-create.json` records successful keyboard-trigger execution (x=240→264), collision with the selected target and rejection of a distant target, a paint-editor change saved as a new SVG, decoding of all 43 new audio files, and a sound reaching playing→ended. The project remained dirty and the native window was closed through the application's normal save-before-close handler.

`mac-baseline-reopen.json` records a second launch: costume, all four scripts (including keyboard, selected collision and sound), and coordinates were restored exactly; audio decoding and playback passed again.

The native probe is reproducible using `test/native/`. It calls real application APIs and IPC; it is not a physical input-device or classroom test. macOS Intel hardware and other macOS versions were not separately tested. Final J-GET Junior artifact results are added after packaging.
