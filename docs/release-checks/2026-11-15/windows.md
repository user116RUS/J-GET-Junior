# Windows baseline verification — 2026-11-15

Artifact checked: ScratchJr-Classroom-Setup-classroom.4.exe (1.3.2-classroom.4), before the J-GET Junior rename.

- Installer: 97,891,760 bytes; SHA-256 `45bbbf7a79363321fd71246a8ce9f046bd996f251accaa35d1273e40f091ef6e`.
- 7-Zip NSIS integrity/extraction passed: 9,010 extracted files, including installer helpers.
- All 9,006 application payload files matched the separately built portable ZIP byte for byte.
- Current alias `ScratchJr-Classroom-Setup.exe` was byte-identical; stored SHA-256 matched.
- Executable is Windows x64; installer manifest requests `asInvoker`.
- 474 packaged JS/CSS/SVG/JSON source files matched the working source at baseline verification; 21 changed JS modules had fresh Babel production caches. Both synchronous and asynchronous electron-compile production loaders returned expected compiled modules.
- All 43 sound WAVs and attribution text matched source bytes. Main/database/library modules also matched directly.

Native validation was attempted in the available UTM Windows 11 ARM64 VM (build 26300.9711). Its guest agent runs as SYSTEM in session 0 with an empty profile, no existing ScratchJr install and no project library. The installer was transferred and an isolated silent install attempted. The VM stopped during the attempt, and no completed installer result was obtained after restart. This is **not** a native installation or application pass. No existing user library was opened or changed. This unsuccessful baseline VM attempt was superseded by the successful final-package Windows x64 CI verification documented below.

## Final J-GET Junior package

Final `J-GET-Junior-Setup.exe` and versioned copy `J-GET-Junior-Setup-1.3.2-jget.1.exe` are byte-identical: 67,591,587 bytes, SHA-256 `09f2f9e0125ae7b5582b67ace7ccbb8b69db7844a510fcfe241cb4d2e90fb4b8`.

- Package/source/cache verification passed: 859 source resources, 66 changed text resources, 24 compiled JavaScript modules, 51 synchronous and 51 asynchronous production loader checks, no stale orphan cache payloads, no unexpected inherited documents or project/private data. See `windows-package.json`.
- Final NSIS extraction passed; all 8,965 application payload files matched the final portable ZIP and verified stage byte for byte. See `windows-installer.json`.
- The application EXE remains AMD64. Its icon has six verified sizes; application, installer and uninstaller report J-GET Junior and numeric version 1.3.2.5. LIEF changes preserved all non-resource PE sections and entrypoint. Original production bootstrap is unchanged; no native QA instrumentation is shipped.
- The installer preserves the existing Classroom installation/data locations and registry key for upgrading; visible app and shortcuts use J-GET Junior. It checks both old and new executables are closed and replaces the old shortcuts. It requires no elevation.
- Native installation and final application integration passed on the Windows x64 CI runner; evidence and limitations are documented below.

Build-only resource editor dependency: `scripts/requirements-build.txt` (`lief==1.0.0`). The portable archive SHA-256 is `03f09c56c1fefcb5eeae9096b43f9b86794233ac7b272d2e2a63c1e3eb158c11`.


## Native Windows x64 CI — passed

[GitHub Actions run 43754172618](https://github.com/user116RUS/J-GET-Junior/actions/runs/43754172618) completed successfully in 2 minutes 19 seconds, testing source commit `25658b70d77fd2d7e5accba37d20af50dfa0c72c` on the `windows-2022` AMD64 runner (Windows build 20348). The downloaded draft installer SHA-256 exactly matched the final installer above.

- Silent installation and product/version registration passed.
- All 12 regression programs passed on Windows.
- The installed native Electron application created its own test project, ran the keyboard movement script, detected target collision and non-collision, saved a paint edit as a new SVG costume, decoded all 43 sounds, and completed audio playing/ended events.
- Native window close saved the dirty project. After a repeated installation, reopening restored the exact costume and keyboard/collision/sound scripts. Runtime coordinates remained stored in the project; the displayed stage correctly returned to the saved home coordinates.
- Reinstall and uninstall preserved both the test project database and a sentinel in the standard Classroom project library. Uninstall removed the application executable and its registry entry.

Sanitized machine-readable evidence: `windows-ci-summary.json`, `windows-native-create.json`, and `windows-native-reopen.json`. The native probes call application APIs and use isolated synthetic data; this is not a physical mouse/keyboard, school laptop, or classroom test. Audio ran with `--mute-audio`: decoding and playback completion were verified, physical audible output was not.
