# Native packaged application probe

Use a **disposable copy** of the final application. Never modify the installed app or the artifact distributed to users.

1. Create an empty absolute `JGET_QA_ROOT` with `Documents`, `Profile`, and `Local` subdirectories. Copy `renderer.js` into it.
2. Prepend `bootstrap.js` to the copy's `resources/app/es6-shim.js` (macOS: `Contents/Resources/app/es6-shim.js`). The original shim must follow it unchanged.
3. Launch the copied executable with `JGET_QA_ROOT` and `JGET_QA_PHASE=create`. Require `create.json` with `readyForClose: true` and `native-close.txt` after process exit.
4. Launch the same copy with `JGET_QA_PHASE=reopen`. Require `reopen.json` with `pass: true`.

The probe creates its own project and uses the packaged production modules and IPC. It checks keyboard execution, targeted collision, a paint edit and new SVG resource, 43 audio decodes, sound playback, native close/save and exact restoration of scripts/costume/position after restart. It is an integration test driven through application APIs, not a physical mouse/keyboard or classroom test. Renderer timers may be throttled when the app is in the background, so movement is allowed 2.5 seconds.

On Windows, the bootstrap redirects `LOCALAPPDATA` before the application opens its library. Installation testing is a separate check and must use a disposable Windows profile or VM. Do not ship an instrumented test copy.
