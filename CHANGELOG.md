# Change Log

All notable changes to the "homebrewery4vsc" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.3.1]

### Fixed

* Local Images used Custom CSS files (for example, as background-image) are not inlined and do not appaer in preview and HTML output.

## [1.3.0]

### Added

* New **Homebrewery** view container added to the VSCode Activity Bar.
* New **SRD 5e Reference** tree view in the Homebrewery view container lists (with tooltip) the races, sub-races, classes, sub-classes, monsters, spells and magic items from the *5e System Reference Document*, using the *D&D 5e SRD API*.
* Clicking an item in the SRD 5e Reference tree view adds the Homebrewery content for that element to the currently open brew.

## [1.2.2]

### Fixed

* Fix the incorrect example for the Custom Stylesheet local path.
* Fix local image rendering and inlining in Markdown: Local images in markdown did not render in the webview, due to sandboxing (no local resource access). They are now handled with paths that are both relative (to the brew file) or absolute (assumed to be under the workspace root directory).
* Fix the listener disposal on the Preview object.

### Added

* Preview optimization: Single reusable Renderer instance per document
* Preview optimization: Fix local image inlining excessive triggering
* Inline styles now support local images in webviews, in HTML output (inlined or not)
* Local Themes now support local images in webviews, in HTML output (inlined or not). Inlining is forced for theme files referenced in brews to circumvent local directory access issues.

## [1.2.1]

### Fixed

* Preview no longer scrolls to the top when changing the active editor window.
* Removed useless “Reloading snippets” message appearing in the log.
* Removed useless instances of the “Current editor is not showing Markdown content” information message box.

## [1.2.0]

### Added

* Added page and column breaks highlighting in the markdown editor.
* Added a None theme.
* Added better support for local Themes
* Added live preview refresh when theme or inline styles are changed.
* Added support for brew snippets

## [1.1.0]

### Added

* Optimized scrolling synchronization
* Preview lazy reload on markdown edits to prevent flickering effect

## [1.0.0]

Initial release of Homebrewery for VS Code.
