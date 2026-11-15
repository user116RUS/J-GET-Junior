# ScratchJr Classroom 1.3.2-classroom.4 packaging verification

Date: 2026-11-15. Packages preserve Electron 1.8.2-beta.3 and the existing platform runtime.

## Source and production cache

- Both staged packages match all 474 JS/CSS/SVG/JSON source files (line endings normalized).
- 26 changed resources relative to the verified fix1 base have correct source hashes and cache content; all 21 changed JS modules exactly match Babel 6.26 compilation.
- 24 changed JS/CSS/SVG resources loaded successfully both synchronously and asynchronously through the actual production electron-compile host. The two new JSON metadata files were verified as raw data plus cache payloads; the packaged MIME table intentionally does not compile JSON.
- All 43 new WAV files and bundled ATTRIBUTION.txt byte-match source assets in each package. provenance.json also matches source.
- This is packaging verification, not native audio-device or classroom testing.

## Mac Intel

- Bundle version: 1.3.2.4. All 12 Mach-O files: x86_64.
- ZIP CRC test passed; all 9057 regular files match the staged application byte-for-byte.
- App: Mac/ScratchJr-Sounds.app
- Archive: Mac/ScratchJr-Classroom-1.3.2-classroom.4-mac-Intel.zip
- SHA256: 26d1952206db6054b1b414575e4998594c2c2d1d51933bc02c3edb964385d778

## Windows

- Installer extracted into a fresh directory with 7-Zip; all 9006 application files exactly match both portable ZIP and verified stage.
- Installer/uninstaller version: 1.3.2.4; both request asInvoker. Application PE machine: x64.
- Current installer: Windows/ScratchJr-Classroom-Setup.exe
- Versioned identical copy: Windows/ScratchJr-Classroom-Setup-classroom.4.exe
- Size: 97891760 bytes.
- SHA256: 45bbbf7a79363321fd71246a8ce9f046bd996f251accaa35d1273e40f091ef6e
- Previous installer preserved as Windows/ScratchJr-Classroom-Setup-classroom.3.exe with checksum.
- Native Windows installation and playback were not tested in this packaging task. Installer is unsigned.

The existing Mac/ScratchJr.app was preserved by this packaging task. Current Windows installer was promoted only after final verification, with a verified backup of the previous version. No installed /Applications files or user project libraries were modified by this packaging task; root handled Mac installation separately.

Native Mac probe by sound_assets agent: all 43 new sounds decode via real IPC audio sources on Electron 1.8.2-beta.3 / Chromium 59. Cat and rain played through both script and independent preview channels with playing→ended events. Preview did not mutate original script audio. Evidence: /private/tmp/sjr-sound-native/result.json. This does not establish Windows-device playback or classroom results.
