'use strict';
export module ErrorMessages {
    export const NOT_MARKDOWN = "Current editor is not showing Markdown content.";
    export const SAVE_FIRST = "Saving is required before proceeding.";
    export const NO_ACTIVE_EDITOR = "No active editor.";
    export const NO_FILE_SELECTED = "No Markdown file selected.";
    export const HTML_GENERATION_FAILED = "HTML Generation failed.";
    export const CUSTOM_CSS_FAILED_FETCH = "Failed to fetch Custom CSS: ${file} (${status})";
    export const CUSTOM_CSS_FAILED_FETCH_NETWORK = "Failed to fetch Custom CSS: ${file} (${message})";
    export const CUSTOM_CSS_FILE_NOT_FOUND = "Custom CSS file not found: ${file}";
    export const CUSTOM_CSS_FILE_ERROR = "Error reading CSS file: ${file}";
    export const CUSTOM_CSS_ERROR = "Error loading CSS: ${file}";
    export const THEME_FILE_NOT_FOUND = "Default theme/theme file not found: ${themeFile}";
    export const DEFAULT_THEME_FILE_NOT_FOUND = "Missing file in default theme ${themeCode}: ${themeFile}";
    export const THEME_FILE_ERROR = "Error reading Theme file: ${themeFile}";
    export const GENERIC_ERROR = "Error: ${error}";
}

export module InfoMessages {
    export const HTML_GENERATION_SUCCESSFUL = "Generated HTML output in ${file}";
}

export module extensionLabels {
    export const OPEN_IN_BROWSER = "Open in Browser";
}
export module iconFontProviderCompletionsTexts {
    export const LABEL_PATTERN = "Font Icon: ${snippetName}";
    export const DESCRIPTION_PATTERN = "Insert ${fontName} Icon`";
    export const DOCUMENTATION_PATTERN = "Insert the *${snippetName}* icon from the *${fontName}* font";
}

export const EXTENSION_ID = 'homebrewery4vsc';
