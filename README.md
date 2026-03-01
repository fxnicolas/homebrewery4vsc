# Homebrewery for VS Code

Edit your favorite RPG content in your favorite editor.

This VS Code extension provides an editor for the [Homebrewery](https://homebrewery.naturalcrit.com/) content with completion snippets and a built-in live preview.

Inspired by some [related projects](#related-projects) which do not support the new elements and is no longer updated.

## Installation

Requires [Visual Studio Code](https://code.visualstudio.com/download). Once VSCode is installed, search for the extension or install it from [here](https://marketplace.visualstudio.com/items?itemName=fxnicolas.homebrewery4vsc).

## Features

This extension provides the following features:

* **Extended Markdown editor** to generate beautiful documents in the style of the Dungeons & Dragons books and resources.
* Snippets for the **Homebrewery syntax**.
* **Live Preview** with synchronized scrolling. Click in the preview to scroll the editor.
* **Generate HTML** for PDF printing.

### Commands

From a markdown editor:

* **Homebrewery: Open Preview** opens a live preview.
* **Homebrewery: Open Preview to the Side** opens a preview to the side of the current editor.
* **Homebrewery: Generate HTML** generates a plain HTML file named after the markdown file. This file can be viewed and printed as PDF from a web browser.

From the preview:

* **Homebrewery: Change Layout to ...** switches the layout to single page, two pages and flow.
* **Homebrewery: Change Zoom In/Out Preview** zooms the preview.
* **Homebrewery: Reset Preview Zoom** resets the zoom.

### Preview and HTML Output

The preview automatically scrolls with the editor position. To scroll the editor to a specific page, click that page in the preview.

You can configure the preview behavior and HTML output in the [extension settings](#extension-settings).

### Snippets

Snippets provide access to the extended Markdown syntax implemented by Homebrewery.

Snippets can be accessed with `CTRL+Space` in Markdown documents. Homebrewery snippets start with `Homebrewery`.

Font icons provided in Homebrewery are also available as snippets. These start with `Font Icon`. As these snippets can clutter the completion dropdown, you can disable them with the `homebrewery4vsc.enableFontIconCompletions` [setting](#extension-settings).

## Extension Settings

This extension exposes the following settings:

* `homebrewery4vsc.enableFontIconCompletions`: Enable/disable the font icon completion snippers.
* `homebrewery4vsc.scrollPreviewWithEditor`: Enable/disable preview scrolling with the editor.
* `homebrewery4vsc.theme`: The theme (Player's Hanbook, Dungeon Master's Guide, etc) used in preview and the HTML output.
* `homebrewery4vsc.pageFormet`: Preview and HTML output page format (A4 or Letter).
* `homebrewery4vsc.hideBackground`: Hide the background image and color in the preview or the HTML output.

## Credits

This extension is inspired from the [**Dungeon and Markdown**](https://marketplace.visualstudio.com/items?itemName=SpjakSoftware.dungeonsandmarkdown) extension by Spjak Software (Jacob Olesen).

This extension uses the Themes and Markdown Renderer from [**The Homebrewery**](https://github.com/naturalcrit/homebrewery), under the MIT license.
The Homebrewery is copyright (c) 2016 Scott Tolksdorf

## FAQ

### How to hide the default Markdown Preview button?

VS Code comes with a default markdown preview, which adds to the markdown editor's toolbar a button labelled *Open Preview to the Side*. To hide it from the toolbar, right-click the button and select *Hide 'Open Preview to the Side'*, as shown below. You can restore it later if needed.

<img src="./media/images/hide-default-markdown-preview-button.png" alt="Hide 'Open Preview to the Side'" style="width:400px;"/>

## Known Issues

* Editor scrolling not precise when clicking a page in the preview.

## Release Notes

### 1.0.0

Initial release of Homebrewery for VS Code

## Related Projects

- [Homebrewery](https://github.com/naturalcrit/homebrewery)
- [Dungeon and Markdown](https://marketplace.visualstudio.com/items?itemName=SpjakSoftware.dungeonsandmarkdown)
