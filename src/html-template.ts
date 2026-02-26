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
        <link href="https://use.fontawesome.com/releases/v5.15.1/css/all.css" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css?family=Open+Sans:400,300,600,700" rel="stylesheet" type="text/css" />
        <!--
        <link href='https://homebrewery.naturalcrit.com/homebrew/bundle.css' rel='stylesheet' />
        -->
        {{ bundle_styles }}
        <base target="_blank">
    </head>
    <body>
        <div>
            <div class="frame-content">
                <div class="brewRenderer">
                    <!-- 
                    <link href="https://homebrewery.naturalcrit.com/themes/V3/Blank/style.css" rel="stylesheet">
                    <link href="https://homebrewery.naturalcrit.com/themes/V3/5ePHB/style.css" rel="stylesheet">
                    -->
                    {{ base_styles }}
                    {{ theme_styles }}
                    {{ page_layout_styles }}
                    <style>
                    /* Added for VS Code Preview, to override the default theme */
                        .page p {
                            color: black
                        }
                        .page span {
                            color: black
                        }
                        .page li {
                            color: black
                        }
                        .page table {
                            color: black
                        }
                        .page h5 {
                            color: black
                        }
                        .page h6 {
                            color: black
                        }
                        .page dl {
                            color: black
                        }
                        .page .monster hr:last-of-type~:is(dl,p) {
                            color: black
                        }
                        .page #example + table td {
                            border:1px dashed #00000030;
                        }
                        .page {
                            padding-bottom : 1.1cm
                        }
                        .page .watermark {
                            z-index: -500
                        }

                        .page 
                    </style>
                    <style> 
                        /* Added by FX for PDF and Printing */
                        .block.note {
                            -webkit-print-color-adjust:exact;
                            -webkit-filter:opacity(1);
                        }

                        .monster.frame {
                            -webkit-print-color-adjust:exact;
                            -webkit-filter:opacity(1);
                        }

                        .descriptive {
                            -webkit-print-color-adjust:exact;
                            -webkit-filter:opacity(1);
                        }
                        .page ul {
                        margin-top:0px;
                        padding-top:0px;
                        }
                    </style>
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
            // Jump to the corresponding page in the preview when a scroll event is received from the extension.
            function jumpToPage(page) {
                const anchor = "p" + page;
                const el = document.getElementById(anchor);
                if (el) {
                    el.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            };

            // Listens to scroll events from the extension and jumps to the corresponding page in the preview.
            window.addEventListener('message', event => {
            type = event.data.type;
                if (type === 'scroll') {
                    const { type, page } = event.data;
                    anchor = "p" + page;
                    jumpToPage(page);
                }
                if (type == 'layout') {
                    const { layout } = event.data;
                    const el = document.getElementById('pagesContainer');
                    el.className = 'pages ' + layout
                }
                if (type == 'zoom') {
                    const { zoomLevel } = event.data;
                    const el = document.getElementById('pagesContainer');
                    el.style.zoom= zoomLevel + '%';
                }
            });
        </script>
        `;

export const htmlTemplate = (context: vscode.ExtensionContext, addScrollEventsScript: boolean) => {

    let template = TEMPLATE_HTML;

    // Add Blank styles as default. 
    let cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/V3/Blank/', 'style.css');
    let cssContent = fs.readFileSync(cssPath, 'utf8');
    template = template.replace('{{ base_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Theme styles. 
    const config = getConfig();
    const currentTheme = config.get<string>('theme') || '5ePHB';
    // Journal Theme
    if (currentTheme === 'Journal') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/V3/', currentTheme, 'style.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
    }
    // PHB or DMG Theme
    if (currentTheme === '5ePHB' || currentTheme === '5eDMG') {
        cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/V3/5ePHB/', 'style.css');
        cssContent = fs.readFileSync(cssPath, 'utf8');
        // DMG Only
        if (currentTheme === '5eDMG') {
            cssPath = path.join(context.extensionPath, THEMES_FOLDER, '/V3/', currentTheme, 'style.css');
            cssContent = cssContent + fs.readFileSync(cssPath, 'utf8');
        }
    }
    template = template.replace('{{ theme_styles }}', `<style>\n${cssContent}\n</style>`);

    // Add Bundle styles. 
    //FIXME: Added Bundle.css temporarily by copying it from the Homebrewery website. Assets inlining is not done yet.
    cssPath = path.join(context.extensionPath, THEMES_FOLDER, 'bundle.css');
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