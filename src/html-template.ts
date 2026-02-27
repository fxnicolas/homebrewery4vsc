'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { EXTENSION_ID } from './constants';
const THEMES_FOLDER = './media/themes/';

// FIXME: Add Content Security Policy (CSP) to the HTML Template.
// FIXME: Inline the fonts linked in TEMPLATE_HTML

const TEMPLATE_HTML = `
<!DOCTYPE html>
<html>
    <head>
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
                        html, body, blockquote {
                            all:unset;
                        }
                    </style>
                    {{ base_styles }}
                    {{ theme_styles }}
                    {{ page_layout_styles }}
                    {{ custom_styles }}
                    {{ background_handling_styles }}
                    <div class="pages" id="pagesContainer">
                        {{ body }}
                    </div>
                </div>
            </div>
        </div>
    {{ scrollEventsScript }}
    </body>
</html>`;

function getConfig() {
    return vscode.workspace.getConfiguration(EXTENSION_ID);
}

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

function getCustomStyles(context: vscode.ExtensionContext, panel?: vscode.WebviewPanel) {
    //FIXME: Inline Custom Styles as Needed
    let styleElements = "";
    let conf = getConfig();
    const styleFiles = conf.get("customStyleSheets") ? conf.get("customStyleSheets") as [] : [];
    for (let file of styleFiles) {
        // File path is a web url e.g. https://example.com/custom.css. Works in preview and generate html
        if (isWebUrl(file)) {
            styleElements += `<link href='${file}' rel='stylesheet' />\n`;
        }
        // File path is local
        else {
            let wsPath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : vscode.Uri.parse("");
            let fullPath = vscode.Uri.joinPath(wsPath, file);
            // Rewrite file path for preview
            if (context && panel) {
                styleElements += `<link href='${panel.webview.asWebviewUri(fullPath)}' rel='stylesheet' />\n`;
            }
            // Rewrite file path for generate html
            else {
                styleElements += `<link href='${fullPath}' rel='stylesheet' />\n`;
            }
        }
    }
    return styleElements;
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

export const htmlTemplate = (context: vscode.ExtensionContext, addScrollEventsScript: boolean) => {

    let template = TEMPLATE_HTML;

    // Add Blank styles as default. 
    let cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/Blank/', 'style.css');
    let cssContent = fs.readFileSync(cssPath, 'utf8');
    template = template.replace('{{ base_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Theme styles. 
    const config = getConfig();
    const currentTheme = config.get<string>('theme') || '5ePHB';
    // Journal Theme
    if (currentTheme === 'Journal') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', currentTheme, 'style.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
    }
    // PHB or DMG Theme
    if (currentTheme === '5ePHB' || currentTheme === '5eDMG') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/5ePHB/', 'style.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
        // DMG Only
        if (currentTheme === '5eDMG') {
            cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', currentTheme, 'style.css');
            cssContent = cssContent + fs.readFileSync(cssPath, 'utf8');
        }
    }
    template = template.replace('{{ theme_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Bundle styles. 
    cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', 'bundle.css');
    cssContent = fs.readFileSync(cssPath, 'utf8');
    template = template.replace('{{ bundle_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add page layout styles based on the settings.
    template = template.replace('{{ page_layout_styles }}', `<style>\n${getPageLayoutStyles()}\n</style>`);

    // Add Background Styles per the settings..
    template = template.replace('{{ background_handling_styles }}', `<style>\n${getBackgroundHandlingStyles()}\n </style>`);

    // Add Scroll Events Script if enabled in settings.
    template = template.replace('{{ scrollEventsScript }}', addScrollEventsScript ? scrollEventScript : '');

    // Add Custom styles configured in the settings
    template = template.replace('{{ custom_styles }}', getCustomStyles(context));

    return template;
};