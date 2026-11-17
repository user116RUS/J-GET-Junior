# Native packaged application probe

Use a **disposable copy** of the final application. Never modify the installed app or the artifact distributed to users.

1. Create an empty absolute `JGET_QA_ROOT` with `Documents`, `Profile`, and `Local` subdirectories. Copy `renderer.js` and `project-sounds.js` into it.
2. Prepend `bootstrap.js` to the copy's `resources/app/es6-shim.js` (macOS: `Contents/Resources/app/es6-shim.js`). The original shim must follow it unchanged.
3. Launch the copied executable with `JGET_QA_ROOT` and `JGET_QA_PHASE=create`. Require `create.json` with `readyForClose: true` and `native-close.txt` after process exit.
4. Launch the same copy with `JGET_QA_PHASE=reopen`. Require `reopen.json` with `pass: true`.

The probe creates its own project and uses the packaged production modules and IPC. It checks keyboard execution, targeted collision, a paint edit and new SVG resource, 43 audio decodes, sound playback, native close/save and exact restoration of scripts/costume after restart, persisted runtime coordinates and the normal return to saved home coordinates on project load. It is an integration test driven through application APIs, not a physical mouse/keyboard or classroom test. Renderer timers may be throttled when the app is in the background, so movement is allowed 2.5 seconds.

On macOS the create phase additionally requires a visible, focused window. It exercises the Space picker and DOM `KeyboardEvent`, checks the immediate return from the asset library, and records five character-click and five green-flag latency samples. These use synthetic DOM mouse events, with the real stage hit test and runtime. Measurements distinguish synchronous handler time from time to the first position change; they are not physical input-to-screen latency. PNG captures show the Space picker, chosen block, and stage. Outside macOS, enable these foreground checks explicitly with `JGET_QA_INPUT=1`; otherwise their omission is recorded in the result. A locked desktop cannot pass the foreground checks.

On Windows, the bootstrap redirects `LOCALAPPDATA` before the application opens its library. Installation testing is a separate check and must use a disposable Windows profile or VM. Do not ship an instrumented test copy.

The Windows release script additionally sets `JGET_QA_LEGACY=1` and runs
`legacy-cancel`, `create`, then `reopen`. The first phase requires a fresh QA
library and writes an invalid synthetic old database plus journal and media
sentinels in its isolated `Documents/ScratchJR`. The installed application's
actual startup code must request recovery. The bootstrap intercepts that dialog
and selects Cancel, then requires process exit with no browser window, new
database or recovery note. In `create`, the same old files remain: the bootstrap
selects the explicit empty-library choice and requires a valid empty database
and durable recovery note before the normal renderer probe starts. In `reopen`,
no recovery prompt is allowed and the saved project must already exist.

Each phase writes `startup-<phase>.json`. The release script independently checks
the old file hashes after every process exits. These checks exercise the
packaged production startup and storage on Windows; dialog choices are supplied
programmatically and do not prove physical mouse/keyboard interaction or repair
of a real damaged user database. Generic probes without `JGET_QA_LEGACY` retain
the normal clean-library behavior.
