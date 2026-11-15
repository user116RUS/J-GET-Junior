# Windows baseline verification — 2026-11-15

Artifact checked: ScratchJr-Classroom-Setup-classroom.4.exe (1.3.2-classroom.4), before the J-GET Junior rename.

- Installer: 97,891,760 bytes; SHA-256 `45bbbf7a79363321fd71246a8ce9f046bd996f251accaa35d1273e40f091ef6e`.
- 7-Zip NSIS integrity/extraction passed: 9,010 extracted files, including installer helpers.
- All 9,006 application payload files matched the separately built portable ZIP byte for byte.
- Current alias `ScratchJr-Classroom-Setup.exe` was byte-identical; stored SHA-256 matched.
- Executable is Windows x64; installer manifest requests `asInvoker`.
- 474 packaged JS/CSS/SVG/JSON source files matched the working source at baseline verification; 21 changed JS modules had fresh Babel production caches. Both synchronous and asynchronous electron-compile production loaders returned expected compiled modules.
- All 43 sound WAVs and attribution text matched source bytes. Main/database/library modules also matched directly.

Native validation was attempted in the available UTM Windows 11 ARM64 VM (build 26300.9711). Its guest agent runs as SYSTEM in session 0 with an empty profile, no existing ScratchJr install and no project library. The installer was transferred and an isolated silent install attempted. The VM stopped during the attempt, and no completed installer result was obtained after restart. This is **not** a native installation or application pass. No existing user library was opened or changed. Native x64 Windows CI installation/application checks remain required for the final release; this report does not cover the forthcoming J-GET Junior package.
