'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as constants from './constants';
import { formatString } from './utils';
const THEMES_FOLDER = './media/themes/';
import { getConfig } from './utils';
import { getThemeStyles} from './theme';

// FIXME: Add Content Security Policy (CSP) to the HTML Template.
// FIXME: Inline the fonts linked in TEMPLATE_HTML
const TEMPLATE_HTML = `
<!DOCTYPE html>
<html>
    <head>
        {{ metadata }}
        <meta http-equiv="Content-Type" content="text/html;charset=utf-8" />
        <meta name="color-scheme" content="light">
        <link href="https://use.fontawesome.com/releases/v5.15.1/css/all.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,300,600,700" rel="stylesheet" type="text/css" />
        {{ bundle_styles }}
        <base target="_blank">
    </head>
    <body>
        <div>
            <div class="frame-content">
                <div class="brewRenderer">
                     <style>
                        /* Prevents VS Code dark theme bleed in Preview */
                        html, body, blockquote,img {
                            all:unset;
                        }
                    </style>
                    {{ base_styles }}
                    {{ theme_styles }}
                    {{ page_layout_styles }}
                    {{ background_handling_styles }}
                    {{ custom_styles }}
                    {{ inline_styles }}
                    <div class="pages" id="pagesContainer">
                        {{ body }}
                    </div>
                </div>
            </div>
        </div>
    {{ preview-script }}
    </body>
</html>`;

function isWebUrl(url: string) {
    let res: URL;
    try {
        res = new URL(url);
    }
    catch {
        return false;
    }
    return res.protocol === "http:" || res.protocol === "https:";
}

async function getCustomStyles(context: vscode.ExtensionContext, panel?: vscode.WebviewPanel): Promise<string> {
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
                    customStyles += `\n/* Source: ${fullUri.fsPath} */\n${css}\n`;
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

function getBackgroundHandlingStyles(): string {
    const config = getConfig();
    const backgroundHandling = config.get<string>('hideBackground') || 'never';
    let backgroundHandlingStyles = "";
    backgroundHandlingStyles += (backgroundHandling === "onPrint" || backgroundHandling === "always") ? `
        /* Remove Background on Printouts */
            @media print {
                .page {
                    background-image: none;
                    background-color: #FFFFFF;
                    }
            }` : "";
    backgroundHandlingStyles += (backgroundHandling === "always") ? `
        /* Remove Background on HTML and Printouts */
            .page {
                background-image: none;
                background-color: #FFFFFF;
            } !important
            ` : "";
    return backgroundHandlingStyles;

};

function getPageLayoutStyles(): string {
    const config = getConfig();
    const pageFormat = config.get<string>('pageFormat') || 'A4';
    let pageLayoutStyles = '';
    if (pageFormat === 'A4') {
        pageLayoutStyles = `
        /* Page Layout             */    
        /* Force Page Layout to A4 */
            .page {
                width: 210mm;
                height: 296.8mm;
            }
        `;
    };
    return pageLayoutStyles;
}

function getPreviewScript(context: vscode.ExtensionContext): string {
    const previewScriptFile = path.join(context.extensionPath, 'media', "scripts", 'preview-script.js');
    const previewScript = fs.readFileSync(previewScriptFile, { encoding: 'utf8' });
    return `<script>\n${previewScript}\n</script>`;

}

export const htmlTemplate = async (context: vscode.ExtensionContext, addPreviewScript: boolean, theme?: string): Promise<string> => {
    let template = TEMPLATE_HTML;

    // Add Blank styles as default. 
    let cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/Blank/', 'style.css');

    let cssContent = await fs.promises.readFile(cssPath, 'utf8');

    template = template.replace('{{ base_styles }}', `<style id="base_styles">\n${cssContent}\n</style>`);

    // Select theme: The one set in file metadata or the default one.
    const config = getConfig();
    const currentTheme = theme || config.get<string>('theme') || "5ePHB";

    // Get the styles from the Theme
    const themeStyles = await getThemeStyles(context, currentTheme, true);
    template = template.replace('{{ theme_styles }}', `<style id="theme_styles">\n/* Theme Styles*/\n${themeStyles}\n</style>`);

    // Add Bundle styles
    cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', 'bundle.css');

    cssContent = await fs.promises.readFile(cssPath, 'utf8');

    template = template.replace('{{ bundle_styles }}', `<style id="bundle_styles">\n${cssContent}\n</style>`);

    // Page layout styles
    template = template.replace('{{ page_layout_styles }}', `<style  id="page_layout_styles">\n${getPageLayoutStyles()}\n</style>`);

    // Background styles
    template = template.replace('{{ background_handling_styles }}', `<style id="background_handling_styles">\n${getBackgroundHandlingStyles()}\n</style>`);

    // Custom styles (now async)
    const customStyles = await getCustomStyles(context);

    template = template.replace('{{ custom_styles }}', `<style id="custom_styles">\n${customStyles}\n</style>`);

    // Scroll events
    template = template.replace('{{ preview-script }}', addPreviewScript ? `${getPreviewScript(context)}` : '');

    return template;
};