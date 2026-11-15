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
