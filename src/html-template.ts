'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as constants from './constants';
import { formatString } from './utils';
const THEMES_FOLDER = './media/themes/';
import { getConfig } from './utils';
import { getThemeStyles} from './theme';
import { getCustomStyles } from './custom-styles';
import { isWebUrl} from './utils';

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
                    {{ theme_styles }}
                    {{ page_layout_styles }}
                    {{ background_handling_styles }}
                    {{ custom_styles }}
                    {{ inline_styles }}
                    <div class="pages" id="pagesContainer" lang="{{ language }}">
                        {{ body }}
                    </div>
                </div>
            </div>
        </div>
    {{ preview-script }}
    </body>
</html>`;




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

    // Select theme: The one set in file metadata or the default one.
    const currentTheme = theme || getConfig().get<string>('theme') || "None";

    // Get the styles from the Theme
    const themeStyles = await getThemeStyles(context, currentTheme, true);
    template = template.replace('{{ theme_styles }}', `
        <style id="base_theme_styles">\n/* Base Theme Styles*/\n${themeStyles[0]}\n</style>\n
        <style id="theme_styles">\n/* Theme Styles*/\n${themeStyles[1]}\n</style>\n
        `);

    // Add Bundle styles
    const bundleCssPath = path.join(context.extensionPath, THEMES_FOLDER, '/homebrewery/', 'bundle.css');

    const bundleCssContent = await fs.promises.readFile(bundleCssPath, 'utf8');

    template = template.replace('{{ bundle_styles }}', `<style id="bundle_styles">\n${bundleCssContent}\n</style>`);

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