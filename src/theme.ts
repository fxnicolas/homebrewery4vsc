'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as constants from './constants';
import { formatString } from './utils';
const THEMES_FOLDER = './media/themes/';
import Renderer from './renderer';

export interface Theme {
    code: string;
    label: string;
    description?: string;
    css: string[];

}

export const DEFAULT_THEMES: Theme[] = [
    {
        code: "5ePHB",
        label: "Player's Handbook",
        description: '',
        css: ["/homebrewery/Blank/style.css", "/homebrewery/5ePHB/style.css"]
    },
    {
        code: "5eDMG",
        label: "Dungeon Master's Guide",
        description: '',
        css: ["/homebrewery/Blank/style.css", "/homebrewery/5ePHB/style.css", "/homebrewery/5eDMG/style.css"]
    },
    {
        code: "Journal",
        label: "Journal",
        description: '',
        css: ["/homebrewery/Blank/style.css", "/homebrewery/Journal/style.css"]
    },
    {
        code: "None",
        label: "None",
        description: '',
        css: ["/homebrewery/Blank/style.css"]
    }
];

async function getThemeFromFile(context: vscode.ExtensionContext, themeFile: string): Promise<string> {
    const wsFolder = vscode.workspace.workspaceFolders?.[0];
    let css = "";
    if (wsFolder) {
        const fullUri = vscode.Uri.joinPath(wsFolder.uri, themeFile);
        try {
            // Read the Theme File
            const fileBuffer = await vscode.workspace.fs.readFile(fullUri);
            const themeFilePayload = Buffer.from(fileBuffer).toString("utf8");
            // Use a Renderer to extract the Theme File metadata (contains its Base Theme) and CSS.
            const renderer = new Renderer(fullUri, context);
            const themeFileMetadata = renderer.getMetadata(themeFilePayload);
            if (themeFileMetadata && themeFileMetadata.theme) {
                // Get the styles from the **Base Theme** specified in the Metadata
                //FIXME: There is a risk of circular logic if a theme file references another theme file (or itself) as its base theme.
                const baseThemeCss = await getThemeStyles(context, themeFileMetadata.theme);
                // Get the styles of the Theme, from CSS Fenced Block
                const themeCss = renderer.getInlineStyles(themeFilePayload);
                css = `/* Base Theme Content for ${themeFileMetadata.theme} */\n${baseThemeCss}\n\n/* File Theme Content */\n${themeCss}`;
            }
        }
        catch (err: any) {
            if (err instanceof vscode.FileSystemError &&
                err.code === 'FileNotFound') {
                vscode.window.showErrorMessage(formatString(constants.ErrorMessages.THEME_FILE_NOT_FOUND, { themeFile }));
            } else {
                vscode.window.showErrorMessage(formatString(constants.ErrorMessages.THEME_FILE_NOT_FOUND, { themeFile }));
            }
        }
    }
    return css;
};

export async function getThemeStyles( context: vscode.ExtensionContext, themeCodeOrFileName: string ): Promise<string> {

    const theme = DEFAULT_THEMES.find(t => t.code === themeCodeOrFileName);

    // Not a default theme. The code is a themeFile
    if (!theme) {
        return await getThemeFromFile(context, themeCodeOrFileName);
    }

    // Default Theme. Each CSS file is read and appended to the CSS.
    return theme.css
        .map(cssPath => {
            try {
                const fullPath = path.join(context.extensionPath, THEMES_FOLDER, cssPath);
                return `/* Styles from ${cssPath} */\n\n${fs.readFileSync(fullPath, 'utf-8')}`;
            } catch (err) {
                console.warn(`Could not read CSS file: ${cssPath}`, err);
                return '';
            }
        })
        .join('\n\n');
}