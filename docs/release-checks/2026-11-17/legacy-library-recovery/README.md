# Windows legacy-library startup fix — 1.3.2-jget.4

17 November 2026. Local unpublished Windows candidate. The reported screenshot
shows failure while importing `Documents/ScratchJR/scratchjr.sqllite` on first
launch. The user confirmed old ScratchJr was installed but there were no projects.
The affected file was not obtained, so its underlying format/damage is unknown.

## Behavior

Only a structural failure reading the legacy database offers an explicit empty
library choice. Cancel, Escape and the default button close without creating a
database. The original folder and all adjacent files are retained. Existing
destination libraries, source changes, inaccessible files, missing/corrupt media,
disk failures and out-of-memory errors cannot authorize a reset.

Before creating an empty library, the application saves a durable recovery note.
It writes a complete new database to a temporary file and publishes it with an
atomic hard link, which fails if another process has already created the target.
Filesystems without hard-link support fail safely. Normal subsequent saves keep
using the existing atomic save mechanism.

## Evidence

- All 15 source regression programs passed on Node 22 using the packaged SQL.js.
- Final recovery tests also cover concurrent destination creation, unsupported
  hard links, retained source/sidecars/media, cancellation and failed writes.
- Bundled Electron Node 8.2.1 on Mac completed migration, media, recovery and
  startup tests; the final recovery test was repeated after the concurrency fix.
- The 18 MiB storage stress test on bundled Node 8.2.1 printed its assertion PASS
  but did not exit within 180 seconds and was terminated by the test timeout.
  It is not counted as a successful native process check. Node 22 completed this
  same storage suite successfully.
- Package/cache verification: 860 source resources, 31 changed JavaScript
  payloads, 57 synchronous and 57 asynchronous production-cache loads; no
  failures, private paths or project data detected.
- Extracted NSIS installer, final ZIP and staging tree: 8,972 files byte-equal.
  AMD64, numeric version 1.3.2.8, icons, asInvoker manifests, unchanged executable
  code sections and an uninstrumented production bootstrap verified.

No Windows runtime, physical classroom computer or real affected database was
tested in this run. The candidate was not published or substituted for the
existing public .3 download. These checks do not prove recovery of old projects.

## Artifacts

- `Windows/ScratchJGET-Setup-1.3.2-jget.4.exe`: 67,683,192 bytes.
  SHA-256 `e514bbfa221e4d23eb4303fed2ca1dd631889545661cd222612e8f5422e2f8ce`.
- `Windows/ScratchJGET-1.3.2-jget.4-win-x64.zip`: 101,406,115 bytes.
  SHA-256 `e2e6847fbde6ac14cd44b9dc0cf1e918565058c4781de8a11bbd778088ee87d3`.

Both files have adjacent `.sha256` files. Paths above are relative to the parent
workspace. Detailed verification outputs are stored beside this report.
