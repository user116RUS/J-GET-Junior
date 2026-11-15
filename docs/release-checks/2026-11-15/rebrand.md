# J-GET Junior UI and original artwork

The application uses the independent J-GET Junior name in window/page titles and ordinary localized product text. Upstream author, supporter and license acknowledgements remain factual and preserved in About. Internal JavaScript API names, saved project identifiers and project format are unchanged.

Original artwork replaces the splash/lobby/editor wordmarks, loading/project-info images, application icon, installer artwork and three former mascots. The new blue, violet and amber robots are built from simple geometric shapes. Existing `Blue.svg`, `Purple.svg` and `Red.svg` filenames remain stable; previously absent `Cat.svg`/`Cat2.svg` IDs now resolve to an original mint robot as hidden compatibility assets. This intentionally changes the appearance of those built-in characters in existing projects.

Four bundled sample files now reference the available blue robot. All sample sprite asset references and all catalog/compatibility SVG files resolve. Four sample previews formerly containing the upstream mascot were replaced with original robot cards. Unused upstream promotional app-store listings, the introduction video/poster, obsolete Sketch masters and two old mascot screenshots were removed. The quick-start page now contains an offline text guide, and both reference pages expose the existing localized descriptions through selectable sections.

## Verification

- Keyboard UI/runtime, target-collision UI/runtime, sound-library/client, paint regression and editor-close tests all passed after the rebrand.
- Reference-page initialization produced 16 interface sections and 13 paint sections; selecting a section updated its description and selected state. Both subpage root IDs match the existing page loader.
- Quick-start code no longer attempts the mobile `AndroidInterface` video call.
- All 12 localization JSON files and all new SVGs parsed successfully.
- All sample sprite references and catalog/compatibility resources exist.
- Generated application icon and project-info wordmark inspected visually; `git diff --check` passed.

Native rendering/painting of the replacement robots and final package verification remain covered by the separate platform checks, not by these source tests.

## Final icon correction

The initial raster J contained small gaps from connected thick line segments. It was replaced with one filled polygon following a cubic outline; the SVG uses the equivalent filled path. Every PNG size, ICO/ICNS copy, installer GIF/frame and UI wordmark was regenerated. The final 1024 px icon was inspected with the local image viewer: the white J is continuous, with no gaps or blue radial artifacts. SVG UI wordmarks use filled paths as well.

Browser preview was not completed: the in-app browser and browser inventory were unavailable, and native Safari selection did not return. No browser-based GUI verification is claimed here. Native application verification is performed separately.

## Windows verification-script review

Reviewed `test/native/windows-release.ps1`, `.github/workflows/release-check.yml` and `scripts/windows-installer.nsi` for consistency. Installer destination and PowerShell expectations agree; the NSIS initializer intentionally ignores `/D`. The test bootstrap redirects Documents/Profile and Windows LOCALAPPDATA into its disposable QA directory. No confirmed launch-blocking error was identified in that review.

Two coverage improvements were reported to the release owner: verify a sentinel in the normal project-library location as well as the redirected QA database after uninstall; and assert the executable and uninstall registry entry have actually disappeared. A successful uninstaller exit code alone does not establish complete removal. The NSIS manifest itself limits deletion to application payload paths.
