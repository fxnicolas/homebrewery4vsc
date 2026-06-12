
'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as constants from './constants';
import { formatString } from './utils';
import { getConfig } from './utils';
import { isWebUrl } from './utils';
import Renderer from './renderer';

export async function getCustomStyles(context: vscode.ExtensionContext, panel?: vscode.WebviewPanel): Promise<string> {
    const conf = getConfig();
    const styleFiles: string[] = conf.get("customStyleSheets") ?? [];
    let customStyles = "";
    for (const file of styleFiles) {
        try {

            // Remote CSS (http/https)
            if (isWebUrl(file)) {
                try {
                    const response = await fetch(file);
                    if (!response.ok) {
                        const status = response.status.toString();
                        vscode.window.showErrorMessage(formatString(constants.ErrorMessages.CUSTOM_CSS_FAILED_FETCH, { file, status }));
                        continue;
                    }
                    const css = await response.text();
                    customStyles += `\n/* Source: ${file} */\n${css}\n`;
                } catch (err: any) {
                    const message = err.message;
                    vscode.window.showErrorMessage(
                        formatString(constants.ErrorMessages.CUSTOM_CSS_FAILED_FETCH_NETWORK, { file, message })
                    );
                    continue;
                }
            }
            // Local file
            else {
                const wsFolder = vscode.workspace.workspaceFolders?.[0];
                if (!wsFolder) { continue; };

                const fullUri = vscode.Uri.joinPath(wsFolder.uri, file);
                try {
                    const fileBuffer = await vscode.workspace.fs.readFile(fullUri);
                    const css = Buffer.from(fileBuffer).toString("utf8");
                    const renderer = new Renderer(fullUri, context);
                    const inlined_css = await renderer.postProcessCss(css, fullUri, true);
                    customStyles += `\n/* Source: ${fullUri.fsPath} */\n${inlined_css}\n`;
                }
                catch (err: any) {
                    if (err instanceof vscode.FileSystemError &&
                        err.code === 'FileNotFound') {
                        vscode.window.showErrorMessage(formatString(constants.ErrorMessages.CUSTOM_CSS_FILE_NOT_FOUND, { file }));
                    } else {
                        vscode.window.showErrorMessage(formatString(constants.ErrorMessages.CUSTOM_CSS_FILE_ERROR, { file }));
                    }
                }
            }
        } catch (err) {
            console.warn(formatString(constants.ErrorMessages.CUSTOM_CSS_ERROR, { file }), err);
        }
    }

    return customStyles;
}