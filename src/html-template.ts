'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as constants from './constants';
import { formatString } from './utils';
const THEMES_FOLDER = './media/themes/';
import { getConfig } from './utils';

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
                    {{ inlined_styles }}
                    <div class="pages" id="pagesContainer">
                        {{ body }}
                    </div>
                </div>
            </div>
        </div>
    {{ scrollEventsScript }}
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
            @media print {
                .page {
                    background-image: none;
                    background-color: #FFFFFF;
                    }
            }` : "";
    backgroundHandlingStyles += (backgroundHandling === "always") ? `
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
            .page {
                width: 210mm;
                height: 296.8mm;
            }
        `;
    };
    return pageLayoutStyles;
}

const scrollEventScript = `
        <script>
            // Listens to scroll events from the extension
            window.addEventListener('message', event => {

                type = event.data.type;

                // scroll: Jumps to the corresponding page in the preview.
                if (type === 'scroll') {
                    const { type, page, mode } = event.data;
                    anchor = "p" + page;
                    const el = document.getElementById(anchor);
                    if (el) {
                        el.scrollIntoView({
                            behavior: mode,
                            block: 'start',
                            inline: 'start'
                        });
                    }
                }
                
                // layout: switches the layout to single page, two-pages or flow.
                if (type == 'layout') {
                    const { layout } = event.data;
                    const el = document.getElementById('pagesContainer');
                    el.className = 'pages ' + layout
                }
                
                // zoom: changes the preview zoom level. 
                if (type == 'zoom') {
                    const { zoomLevel } = event.data;
                    const el = document.getElementById('pagesContainer');
                    el.style.zoom= zoomLevel + '%';
                }
                    
            });

            const vscode = acquireVsCodeApi();

            // Detect a click and send the corresponding page number to VS Code. The markdown editor scrolls to that page.
            document.addEventListener('click', (event) => {
                let el = event.target;
                while (el && el !== document.body) {
                    if (el.classList?.contains('page')) {
                        const id = el.id; // e.g. "page-12"

                        const match = id.match(/\\d+/);
                        if (match) {
                            const pageNumber = parseInt(match[0], 10);
                            vscode.postMessage({
                                type: 'goToPage',
                                page: pageNumber
                            });
                        }
                        break;
                    }
                    el = el.parentElement;
                }
            });
        </script>
        `;

export const htmlTemplate = async (context: vscode.ExtensionContext, addScrollEventsScript: boolean, theme?: string): Promise<string> => {
    let template = TEMPLATE_HTML;

    // Add Blank styles as default. 
    let cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/Blank/', 'style.css');

    let cssContent = await fs.promises.readFile(cssPath, 'utf8');

    template = template.replace('{{ base_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Theme styles
    const config = getConfig();
    const currentTheme = theme || config.get<string>('theme') || "5ePHB";

    if (currentTheme === 'Journal') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', currentTheme, 'style.css');
        cssContent = await fs.promises.readFile(cssPath, 'utf8');
    }

    if (currentTheme === '5ePHB' || currentTheme === '5eDMG') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/5ePHB/', 'style.css');
        cssContent = await fs.promises.readFile(cssPath, 'utf8');

        if (currentTheme === '5eDMG') {
            cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', currentTheme, 'style.css');

            cssContent += await fs.promises.readFile(cssPath, 'utf8');
        }
    }

    template = template.replace('{{ theme_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Bundle styles
    cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', 'bundle.css');

    cssContent = await fs.promises.readFile(cssPath, 'utf8');

    template = template.replace('{{ bundle_styles }}', `<style>\n${cssContent}\n</style>`);

    // Page layout styles
    template = template.replace('{{ page_layout_styles }}', `<style>\n${getPageLayoutStyles()}\n</style>`);

    // Background styles
    template = template.replace('{{ background_handling_styles }}', `<style>\n${getBackgroundHandlingStyles()}\n</style>`);

    // Scroll events
    template = template.replace('{{ scrollEventsScript }}', addScrollEventsScript ? scrollEventScript : '');

    // Custom styles (now async)
    const customStyles = await getCustomStyles(context);

    template = template.replace('{{ custom_styles }}', `<style>\n${customStyles}\n</style>`);

    return template;
};