'use strict';
import * as vscode from 'vscode';
import Markdown from './homebrewery/renderer/markdown.js';
import { htmlTemplate } from './html-template';
import * as yaml from "js-yaml";
import * as path from 'path';
import * as fs from 'fs/promises';
import { parse } from 'node-html-parser';
import { getConfig } from './utils';
import { SnippetsBlock } from './snippets-completions.js';

// @ts-ignore
declare module './markdown';

const CSS_REGEX = /```css\s*([\s\S]*?)\s*```/;
const METADATA_REGEX = /```metadata\s*([\s\S]*?)\s*```/;

interface Metadata {
    title?: string;
    description?: string;
    tags?: string[];
    systems?: string[];
    renderer?: string;
    theme?: string;
    snippets?: SnippetsBlock[];
}


export default class Renderer {
    public context: vscode.ExtensionContext;
    public documentUri: vscode.Uri;
    private isVscPreview: boolean = true;

    constructor(documentUri: vscode.Uri, context: vscode.ExtensionContext) {
        this.documentUri = documentUri;
        this.context = context;
    };

    /**
     * Preprocessor for markdown text.
     * @param markdownText input markdown text
     * @returns processed markdown text.
     * 
     * @remarks
     * Pipeline:
     * 1. **Inject Footnotes**: Dynamically replace {footnote H1...H6} with the H1...H6 text.
     *
     */
    private preProcessText(markdownText: string) {
        // This function is used to preprocess the markdown text before rendering. It can be used to add any custom syntax or transformations that we want to support in our markdown files. For example, we can use it to inject footnotes, handle custom directives, etc.
        markdownText = this.injectFootnotes(markdownText);
        return markdownText;
    }

    /**
     * Preprocessor for markdown page text.
     * @param text input markdown page text
     * @returns processed markdown page text.
     * 
     * @remarks
     * Pipeline:
     * This function's pipeline is currently empty.
     *
     */
    private preProcessPageText(pageText: string) {
        // This function is used to preprocess each page of the markdown text before rendering. It can be used to add any custom syntax or transformations that we want to support in our markdown files on a per-page basis. For example, we can use it to inject footnotes, handle custom directives, etc.
        return pageText;
    }

    private getMimeType(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();

        switch (ext) {
            case '.png': return 'image/png';
            case '.jpg':
            case '.jpeg': return 'image/jpeg';
            case '.gif': return 'image/gif';
            case '.svg': return 'image/svg+xml';
            case '.webp': return 'image/webp';
            default: return 'application/octet-stream';
        }
    }

    private async inlineAssetImages(
        html: string,
        documentUri: vscode.Uri = this.documentUri
    ): Promise<string> {

        const root = parse(html);
        const images = root.querySelectorAll('img');
        await Promise.all(images.map(async (img) => {
            let src = img.getAttribute('src');
            try {
                if (!src) { return; };
                if (src.startsWith('/assets/')) {
                    const assetUri = vscode.Uri.joinPath(this.context.extensionUri, decodeURIComponent(src));
                    let fileBuffer: Buffer;
                    try {
                        fileBuffer = await fs.readFile(assetUri.fsPath);
                    } catch {
                        console.warn(`Image ${src} not found in assets, skipping.`);
                        return; // Skip missing files silently
                    }
                    const mimeType = this.getMimeType(src);
                    const base64 = fileBuffer.toString('base64');
                    img.setAttribute(
                        'src',
                        `data:${mimeType};base64,${base64}`
                    );
                }
            }
            catch (err) {
                console.warn(`Failed to inline image ${src} from Assets:`, err);
            }
        }));
        // Re-serialize
        const finalHtml = root.toString();
        return finalHtml;
    };

    private async inlineLocalImages(
        html: string,
        documentUri: vscode.Uri = this.documentUri
    ): Promise<string> {
        const baseDir = path.dirname(documentUri.fsPath);

        const root = parse(html);
        const images = root.querySelectorAll('img');
        await Promise.all(images.map(async (img) => {
            let src = img.getAttribute('src');
            if (!src) { return; };

            // Skip external URLs or already inlined
            if (/^(https?:|data:)/.test(src)) { return; };

            try {
                // Remove file:// if present
                if (src.startsWith('file://')) {
                    src = src.replace(/^file:\/\//, '');
                }

                // Decode URL encoding (%20 etc.)
                src = decodeURIComponent(src);

                // Resolve relative to base directory
                const imagePath = path.isAbsolute(src)
                    ? src
                    : path.resolve(baseDir, src);

                // Read file, skip if it doesn't exist
                let fileBuffer: Buffer;
                try {
                    fileBuffer = await fs.readFile(imagePath);
                } catch {
                    console.warn(`Image not found, skipping: ${imagePath}`);
                    return; // Skip missing files silently
                }

                const mimeType = this.getMimeType(imagePath);
                const base64 = fileBuffer.toString('base64');

                img.setAttribute(
                    'src',
                    `data:${mimeType};base64,${base64}`
                );

            } catch (err) {
                console.warn(`Failed to inline image '${src}':`, err);
            }
        }));

        // Re-serialize
        const finalHtml = root.toString();
        return finalHtml;
    }

    /**
     * Postprocessor for HTML page text.
     * @param text input HTML page text
     * @returns processed HTML page text.
     * 
     * @remarks
     * Pipeline:
     * This function's pipeline is currently empty.
     *
     */
    private async postProcessPageHtml(pageHtml: string): Promise<string> {
        pageHtml = await this.inlineAssetImages(pageHtml);
        if (this.isVscPreview || getConfig().get('inlineLocalImages')) {
            pageHtml = await this.inlineLocalImages(pageHtml);
        }
        return pageHtml;
    }



    /**
     * Generates HTML <title> and <meta> tags from metadata.
     */
    private generateHeadTags(metadata: Metadata | null): string {

        if (!metadata) {
            return "";
        };

        const escapeHtml = (value: string) =>
            value
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;");

        const parts: string[] = [];

        // Title
        if (metadata.title) {
            parts.push(`<title>${escapeHtml(metadata.title)}</title>`);
            parts.push(`<meta property="og:title" content="${escapeHtml(metadata.title)}">`);
        }

        // Description
        if (metadata.description) {
            parts.push(
                `<meta name="description" content="${escapeHtml(metadata.description)}">`
            );
            parts.push(
                `<meta property="og:description" content="${escapeHtml(metadata.description)}">`
            );
        }

        // Tags → keywords
        if (metadata.tags?.length) {
            parts.push(
                `<meta name="keywords" content="${escapeHtml(metadata.tags.join(", "))}">`
            );
        }

        // Systems
        if (metadata.systems?.length) {
            parts.push(
                `<meta name="systems" content="${escapeHtml(metadata.systems.join(", "))}">`
            );
        }

        // Renderer
        if (metadata.renderer) {
            parts.push(
                `<meta name="renderer" content="${escapeHtml(metadata.renderer)}">`
            );
        }

        // Theme
        if (metadata.theme) {
            parts.push(
                `<meta name="theme" content="${escapeHtml(metadata.theme)}">`
            );
        }

        return parts.join("\n");
    }

    /**
     * Get Brew's metadata block from the markdown input, parses it
     * as YAML, and returns the parsed metadata
     */
    public getMetadata<T = any>(markdownText: string): Metadata | null {
        let metadata: Metadata | null = null;
        const match = markdownText.match(METADATA_REGEX);
        if (match) {
            try {
                metadata = yaml.load(match[1]) as Metadata;
            } catch (err: any) {
                throw new Error(`Invalid metadata YAML: ${err.message}`);
            }
        }
        return metadata;
    };

    /**
     * Get a Brew's CSS fenced block from the markdown input.
     * and returns this css content as a string.
     */
    public getInlineStyles<T = any>(markdownText: string): string {
        let cssContent : string = "";
        const match = markdownText.match(CSS_REGEX);
        if (match) {
            cssContent = match[1];
        };
        return cssContent;
    }


    /**
     * Get a Brew's body content from the markdown input.
     * and returns this content as a string.
     */
    public getBody<T = any>(markdownText: string): string {
        return  markdownText.replace(CSS_REGEX, "").replace(METADATA_REGEX, "").trim();
    }

    /**
     * Footnotes from H1, H2, etc, into the markdown text. 
     * It looks for {footnote H1}, {footnote H2}, etc. and replaces them with 
     * the corresponding heading text.
     */
    private injectFootnotes(markdownText: string) {
        const lines = markdownText.split('\n');
        const headings: { [key: number]: string } = {}; // {1: "", 2: "", ...}

        return lines.map(line => {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

            if (headingMatch) {
                const level = headingMatch[1].length;
                headings[level] = headingMatch[2].trim();
                return line;
            }

            return line.replace(/\{footnote H(\d)\}/g, (_, level) => {
                return `{footnote ${headings[level] || ''}}`;
            });
        }).join('\n');
    }

    /**
     * Renders one page of markdown as HTML
     *  Each page has an ID and key with its number.
     */
    private async renderPage(pageText: string, index: number) {
        pageText = this.preProcessPageText(pageText);
        pageText += `\n\n&nbsp;\n\\column\n&nbsp;`;
        let pageBody = `
        <div class="page phb" id="p${index + 1}" key="${index}" >
            <div class="columnWrapper">${Markdown.render(pageText)}</div>
        </div>`;
        pageBody = await this.postProcessPageHtml(pageBody);
        return pageBody;
    }

    /**
     * Renders Markdown-like text into a complete HTML document, applying metadata, styles, and template structure.
     *
     * This function takes a text input (potentially containing metadata, CSS sections, and page delimiters) 
     * and transforms it into a fully formatted HTML document. It integrates metadata-defined properties, 
     * applies inlined CSS, and supports optional scroll events for dynamic rendering inside a VS Code extension webview.
     *
     * @async
     * @function renderHTML
     * @param {string} markdownText 
     * The source text to render. It may include optional metadata headers, inlined CSS blocks, 
     * and page split markers (`\page`).
     *
     * @param {vscode.ExtensionContext} context 
     * The VS Code extension context, used to resolve resources (e.g., templates, scripts, or assets) 
     * when generating the final HTML output.
     *
     * @param {boolean} [isVscPreview=false] 
     * Whether to include JavaScript for handling scroll-related events in the final document. 
     * Useful if the HTML will be rendered in a scrollable webview.
     *
     * @returns {Promise<string>} 
     * A `Promise` resolving to a complete HTML string that includes `<head>` metadata, inlined CSS, 
     * and the fully rendered `<body>` content.
     *
     * @throws {Error} Propagates any errors from helper functions such as `htmlTemplate()`, 
     * `extractMetadata()`, or `renderPage()`.
     *
     * @example
     * const html = await renderHTML(markdownSource, context, true);
     * panel.webview.html = html;
     *
     * @remarks
     * The function pipeline:
     * 1. **Extract metadata**: Parses metadata from the input text to derive HTML `<head>` tags and the theme.
     * 2. **Extract inline CSS**: Separates custom CSS blocks for injection into the final document.
     * 3. **Preprocess text**: Cleans and normalizes Markdown-like syntax, splitting into pages at `\page` markers.
     * 4. **Render individual pages**: Converts each page segment into HTML using `renderPage()`.
     * 5. **Build HTML template**: Loads and injects metadata, styles, and body content into the base template 
     *    from `htmlTemplate()`.
     *
     */
    public async renderHTML(markdownText: string, isVscPreview: boolean = false): Promise<string> {

        this.isVscPreview = isVscPreview;

        // Extract Metadata
        let metadata = this.getMetadata(markdownText);
        const htmlMetaTags = this.generateHeadTags(metadata);
        let theme = "";
        if (metadata && metadata.theme) {
            theme = metadata.theme;
        }
        // Extract inline styles CSS
        let inlineStyles = this.getInlineStyles(markdownText);
        
        let body = this.getBody(markdownText);
        // Render the Body (all pages)
        let htmlBody = await this.renderBody(body);

        // Generate the template
        let template = await htmlTemplate(this.context, isVscPreview, theme);

        // Insert metadata (if any)
        template = template.replace('{{ metadata }}', htmlMetaTags);

        // Insert inlined CSSS
        template = template.replace('{{ inline_styles }}', `<style id="inline_styles">\n${inlineStyles}\n</style>`);

        // Insert the Body
        let htmlOutput = template.replace('{{ body }}', htmlBody);

        return htmlOutput;
    }

    public async renderBody(markdownText: string): Promise<string> {

        // Get the body content (no CSS, not metadata)
        let body = this.getBody(markdownText);

        // Split the boby into pages after proprocessing.
        const pages = this.preProcessText(body).split(/^\\page$/gm);

        // All pages rendering start simultaneously
        const renderPromises = pages.map((pageContent, i) => this.renderPage(pageContent, i));

        // Wait for ALL promises to settle
        // Results will be an array of strings in the correct order
        const htmlPages = await Promise.all(renderPromises);

        // 4. Join them into the final body
        return htmlPages.join("");
    }

};