import * as vscode from 'vscode';
import * as constants from './constants';


/**
 * Replaces ${placeholders} in a template string with values from a dictionary.
 *
 * The function searches the template for patterns of the form `${key}`
 * and replaces them with the corresponding value from the `values` object.
 *
 * If a placeholder key is not found in `values`, it is replaced with an empty string.
 *
 * Example:
 * ```ts
 * const template = "Insert the *${snippetName}* icon from the *${fontName}* font";
 *
 * const result = format(template, {
 *   snippetName: "dragon",
 *   fontName: "FantasyIcons"
 * });
 *
 * // result:
 * // "Insert the *dragon* icon from the *FantasyIcons* font"
 * ```
 *
 * @param template - The string containing `${key}` placeholders.
 * @param values - An object mapping placeholder names to replacement strings.
 * @returns The formatted string with all placeholders replaced.
 */
export function formatString(template: string, values: Record<string, string>) {
    return template.replace(/\$\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

/**
 * Retrieves the configuration settings for the current VS Code extension.
 *
 * This function wraps `vscode.workspace.getConfiguration()` using the
 * extension’s unique identifier defined in `constants.EXTENSION_ID`.
 * It provides easy access to user- or workspace-level configuration values
 * declared under that namespace (as defined in the extension’s `package.json`).
 *
 * @function getConfig
 * @returns {vscode.WorkspaceConfiguration}
 * A `WorkspaceConfiguration` object representing the settings for this extension.
 * Use `.get()`, `.update()`, or `.has()` on this object to read or modify specific settings.
 *
 * @example
 * const config = getConfig();
 * const enablePreview = config.get<boolean>('enablePreview');
 *
 * @see vscode.workspace.getConfiguration
 * @see https://code.visualstudio.com/api/references/vscode-api#WorkspaceConfiguration
 */
export function getConfig() {
    return vscode.workspace.getConfiguration(constants.EXTENSION_ID);
}