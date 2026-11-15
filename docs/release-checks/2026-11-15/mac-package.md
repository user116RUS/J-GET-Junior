# J-GET Junior 1.3.2-jget.1 — Mac packaging verification

Date: 15 November 2026.

**Status: PASS for the final staged application.** The frozen J-GET Junior 1.3.2-jget.1 application passed all packaging checks below. Native execution and the final download archive are checked separately.

## Method

The portable verifier is `test/packaging/verify.cjs`. Run it with the packaged `Contents/Resources/app` directory, the trusted pre-change application resources and an output JSON path. Set `NODE_PATH` to a separate directory containing Babel 6.26.0 and the presets/plugins used by the packaging scripts. No absolute developer paths are required in the verifier.

The verifier compares every source resource under `src/` with the staged application. Text comparisons normalize CRLF/LF; binary assets are compared byte-for-byte. For changed JS, HTML, SVG, CSS and JSON relative to the trusted baseline it independently checks the source hash and cached content; JavaScript is compiled again with Babel. The actual packaged `electron-compile` host is then used in both synchronous and asynchronous read-only modes. JSON is verified as raw data/cache content because this legacy distribution does not compile JSON through its MIME loader.

It also checks current installation guides and notices, absence of explicitly removed assets and obsolete documents, absence of orphaned cache payloads, and a bounded scan for the invoking user's home path and project/private-data filenames. These checks do not modify the staged application.

## Final source and compiler results

- All 859 source resources matched: 473 normalized text files and 386 exact byte comparisons, including HTML, JavaScript, SVG, CSS, JSON, PNG, platform icons, fonts and audio.
- All 66 changed text resources matched their production-cache payloads; 24 JavaScript modules matched independent Babel compilation.
- All 51 changed non-JSON resources loaded correctly using the real production host, both synchronously and asynchronously.
- All 43 additional WAV assets are included in the above exact comparisons, along with attribution and provenance.
- The staged resource scan found no copy of the invoking user's home path or unexpected project database/private-data filenames. This is a bounded check, not a claim that every possible sensitive-data format was recognized.

## Bundle and preserved runtime

- Main application name, display name and executable: `J-GET Junior`.
- Bundle identifier: `it.jget.junior`; bundle version: `1.3.2.5`; short version: `1.3.2`.
- All 12 Mach-O executables/libraries are x86_64 and byte-identical to the preserved Intel runtime; only the main executable's filename changes.
- All three helper application bundles, executables and display names use J-GET Junior, with `it.jget.junior` identifiers. Each executable exists at its declared path. No previous-brand bundle/executable names remain in the framework helpers.
- The final application ICNS icon is byte-identical to `src/icons/mac/icon.icns`. All other packaged icon resources also passed source comparison.

## Packaging issues found during preparation

The review identified six inherited documentation files and screenshots from the base application, plus unreferenced cache payloads holding previous artwork. The packaging scripts were corrected and the final app was rebuilt. All 24 explicitly removed source/document assets are now absent from both files and cache index. There are no unreferenced hash payloads left in the production cache. Only the current installation and audio documentation allowlist is packaged.

## Evidence

- [Resource and production-cache verification](mac-package.json): 8855 packaged resource files scanned; no failures.
- [Bundle, icon and runtime architecture verification](mac-bundle.json).

## Limits

Packaging checks establish what is inside the app and how the production resource loader resolves it. They do not establish native runtime behavior, Gatekeeper approval, installation on every macOS version, or classroom outcomes. Native Mac checks and final archive integrity/checksums are recorded separately.
