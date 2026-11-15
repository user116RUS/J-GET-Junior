# Independent regression and source review — Classroom 1.3.2-classroom.4

Date: 15 November 2026. Reviewed working tree based on upstream `919482d724904a560d6c77dab06240341584c502`.

Result: all 12 existing regression programs passed. No release-blocking defect was found in the reviewed changes. This report covers source behavior and local automated checks; native application and installer results are recorded separately.

## Environment and method

- macOS host, Apple Silicon, Node.js v18.15.0 (`darwin arm64`).
- Checkout has no `node_modules`. Storage tests used `NODE_PATH` pointing to `Mac/ScratchJr.app/Contents/Resources/app/node_modules`, using the SQL.js dependency actually distributed with the Mac application.
- Command: `NODE_PATH="<workspace>/Mac/ScratchJr.app/Contents/Resources/app/node_modules" node --experimental-vm-modules test/<name>.js` for each file below. Tests generated isolated temporary data; no user project library was opened or changed.
- Node printed the expected experimental VM module notice and SQL.js legacy asm.js optimization warning; every reported test exited with status 0.
- `git diff --check` passed.

## Automated results

| Program | Verified behavior | Result |
| --- | --- | --- |
| `editor-close.js` | Open drawing confirmation, discard, stage-update wait, close only after successful save | PASS |
| `keyboard-runtime.js` | 33 Russian letters, physical mapping with English layout, four arrows, repeat, active page, hidden sprites, editor guards, old hats and handler lifecycle | PASS |
| `keyboard-ui.js` | 37 choices, palette/start shape, serialize/reopen/copy, picker and undo | PASS |
| `library-load.js` | Synthetic 75.20 MiB library, migration, durable edits, reopen, resource checksums and SQLite integrity | PASS |
| `library-migration.js` | Original preservation, failed-import retry, independent updates, offline/first launch and restore precedence | PASS |
| `media-storage.js` | Inline-media migration, interrupted commit, deduplication, backup restore, missing/corrupt backup | PASS |
| `paint-regression.js` | Formerly hanging Bézier curve, crossing calculation, stroke spacing, undo/redo, bounded history and save retry | PASS |
| `sound-client.js` | Restart/stop, completion, absent audio, play rejection, cancellation races, decode error and legacy play API | PASS |
| `sound-library.js` | 44 catalog entries including existing pop, resources/preload, persistence/copy, nested playback continuation, picker/undo, recordings and preview cancellation | PASS |
| `storage.js` | Immediate durable saves, 18 MiB media, disk-error retry with unchanged previous bytes, statement disposal, asset cleanup and restore | PASS |
| `target-collision-runtime.js` | Exact ID, pixel-hit gate, page/hidden/text/deleted/self/dragged guards, repeat/stop, original trigger and launch lifecycle | PASS |
| `target-collision-ui.js` | Target choices, thumbnails, picker/undo, persistence/copy, same-name sprites, rename/delete/restore and original collision | PASS |

Load-test detail: the migrated metadata file was 76 KiB; 100 projects, all 300 original assets and 10 new drawings survived reopening. Fifty durable writes measured p50 8.4 ms / p95 13.9 ms. Ten drawing-plus-project save cycles measured p50 41.2 ms / p95 51.9 ms. These are measurements on this Mac, not a Windows laptop performance result.

## Source review

Reviewed database and media commit order, retry/reopen handling after failed writes, legacy-library migration/restore, save-before-close protocol, delayed paint/stage completion, bounded paint sampling/history, keyboard handler guards, exact-target collision lifecycle, sound serialization/copy, preview isolation and playback completion.

No confirmed critical defect was found in that scope. Important existing constraints remain documented: new built-in sounds require Classroom .4 or later on the destination computer because the upstream project export does not embed built-in assets; this is not backward compatibility with unmodified ScratchJr.

## Assets and publication contents

- Recomputed SHA-256 and byte length for every one of the 43 new WAV files against `src/app/sounds/library/provenance.json`: all match.
- All 43 WAV files are mono, 16-bit PCM, 22050 Hz and at most six seconds. Full decoding with `ffmpeg -v error -xerror -i <file> -f null -` succeeded for every file.
- Attribution, original asset IDs/URLs, modification description and the CC BY-SA 2.0 link are present in `ATTRIBUTION.txt` and `provenance.json`.
- The cited official [Scratch terms, section 5.2](https://github.com/scratchfoundation/scratch-www/blob/93fefda5bb67774de2ef31a8139cd4517aebd6d7/src/views/terms/terms.jsx#L251-L266) were independently inspected: the description of the support-material license and requested source acknowledgement matches the attribution file.
- The repository `LICENSE` contains BSD-3-Clause terms. The upstream `package.json` says MIT; publication text should describe the actual `LICENSE` and keep the audio license separate. No license text was removed or changed during this check.
- Scanned 925 tracked/untracked nonignored repository files for common GitHub/AWS/Google credential formats, private-key headers and sensitive filenames: no matches. No project SQLite database, private key, credential file or personal media library was present among those publishable source files. This was a bounded pattern/file-inventory check, not a guarantee against every possible secret format.

## Limits

The module/UI tests use stubs around browser interfaces. They do not establish native Windows installation, audio-device behavior, every macOS version, physical school laptop performance or classroom outcomes. The separate Mac and Windows checks must be considered before publication.
