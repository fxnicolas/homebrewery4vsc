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
import { PAGE_REGEX, COLUMN_REGEX } from './utils';
import _ from 'lodash';
import { Token, TokensList } from 'marked';

// @ts-ignore
declare module './markdown';

const CSS_REGEX = /```css\s*([\s\S]*?)\s*```/;
const METADATA_REGEX = /```metadata\s*([\s\S]*?)\s*```/;
const TRANSCLUSION_REGEX = /^!\[([^\]]*)\]\(([^)]+\.(?:md|txt))\)(?:\{HEADING_OFFSET=(\d+)\})?/gim;
const REFERENCE_REGEX = /\[([^\]]*)\]\(([^)]+\.(?:md|txt))\)/gim;


interface Metadata {
    title?: string;
    description?: string;
    tags?: string[];
    language?: string;
    systems?: string[];
    renderer?: string;
    theme?: string;
    snippets?: SnippetsBlock[];
}

interface TranscludeMatch {
    fullMatch: string;
    fileTitle: string;
    relativeFilePath: string;
    headingOffset: number;
}


export default class Renderer {
    public context: vscode.ExtensionContext;
    public documentUri: vscode.Uri;
    public isCollapseTransclusions: boolean = false;
    private isVscPreview: boolean = true;
    private panel: vscode.WebviewPanel | undefined;
    private loggerChannel = vscode.window.createOutputChannel('Homebrewery for VS Code', { log: true });


    constructor(documentUri: vscode.Uri, context: vscode.ExtensionContext, panel: vscode.WebviewPanel | undefined = undefined, collapseTransclusion: boolean = false) {
        this.documentUri = documentUri;
        this.context = context;
        this.panel = panel;
        this.isCollapseTransclusions = collapseTransclusion;
    };

    /**
     * Preprocessor for markdown text.
     * @param markdownText input markdown text
     * @returns processed markdown text.
     * 
     * @remarks
     * Pipeline:
     * 1. **Add RootPage IDs**: Add speciifc root page IDs (page numbers for root document pages)
     * 2. **Transclusion**: Add to the markdown content the markdown/text documents using the transclusion syntax, or show them as styles links.
     * 3. **Prepare References**: Transform .md and .txt references to html counterparts.
     * 4. **Inject Footnotes**: Dynamically replace {footnote H1...H6} with the H1...H6 text.
     *
     */
    private async preProcessText(markdownText: string) {
        // This function is used to preprocess the markdown text before rendering. It can be used to add any custom syntax or transformations that we want to support in our markdown files. For example, we can use it to inject footnotes, handle custom directives, etc.

        markdownText = await this.addRootPagesIds(markdownText);

        if (this.isVscPreview && this.isCollapseTransclusions) {
            markdownText = this.collapseTransclusions(markdownText);
        } else {
            markdownText = await this.processTransclusions(markdownText, this.documentUri.fsPath);
        }

        if (!this.isVscPreview) {
            // Transform .md and .txt references to html counterparts.
            markdownText = this.prepareReferences(markdownText);
        }

        markdownText = this.injectFootnotes(markdownText);
        return markdownText;
    }

    private collapseTransclusions(markdownText: string): string {
            return markdownText.replace(TRANSCLUSION_REGEX, (match, alias, url, offset) => {
            const offsetPart = offset !== undefined ? ` (Headings Offset ${offset})` : '';
            return `[${alias}${offsetPart}](${url}){hb-transclusion}`;
        });
    }


    private prepareReferences(markdownText: string): string {
        return markdownText.replace(REFERENCE_REGEX, (match, alias, path) => {
            const newPath = path.replace(/\.(md|txt)$/i, '.html');
            return `[${alias}](${newPath})`;
        });
    }


    private async addRootPageId(pageText: string, index: number) {
        // Adds a root-id attribute on the page elements of the root document.
        // root-id is the page number in the root document, to support correct scrolling with transclusion.

        const rootPageId = index + 1;
        if (pageText.startsWith('\\page{')) {
            pageText = pageText.replace('\\page{', `\\page{root-id=${rootPageId},`)
        } else if (pageText.startsWith('\\page')) {
            pageText = pageText.replace('\\page', `\\page{root-id=${rootPageId}}`)
        } else {
            pageText = `\\page{root-id=${rootPageId}} \n\n ${pageText}`
        }
        return pageText;
    }

    private async addRootPagesIds(markdownText: string) {
        // Adds to all pages of the root document a "root-id" attribute to enable scrolling,
        // including with transclusion.
        const pages = markdownText.split(new RegExp(PAGE_REGEX.source, 'gm'));

        // All pages rendering start simultaneously
        const renderPromises = pages.map((pageContent, i) => this.addRootPageId(pageContent, i));

        // Wait for ALL promises to settle
        const anchoredPages = await Promise.all(renderPromises);

        // Join all pages
        return anchoredPages.join("");
    }

    private async processTransclusions(
        markdownText: string,
        filePath: string,               // absolute path of the file markdownText came from
        rootFilePath: string = filePath, // stays constant across the whole recursion
        visited: Set<string> = new Set(),
        headingsOffset: number = 0
    ): Promise<string> {
        const scanRegex = new RegExp(TRANSCLUSION_REGEX.source, TRANSCLUSION_REGEX.flags);
        const transclusionsFound: TranscludeMatch[] = [];

        let scanResult: RegExpExecArray | null;
        while ((scanResult = scanRegex.exec(markdownText)) !== null) {
            transclusionsFound.push({
                fullMatch: scanResult[0],
                fileTitle: scanResult[1],
                relativeFilePath: scanResult[2].trim(),
                headingOffset: scanResult[3] ? parseInt(scanResult[3], 10) + headingsOffset : headingsOffset
            });
        }

        if (transclusionsFound.length === 0) {
            return markdownText;
        }

        const replacements = await Promise.all(
            transclusionsFound.map(transclusionMatch => this.resolveTransclusion(transclusionMatch, filePath, rootFilePath, visited))
        );

        const substRegex = new RegExp(TRANSCLUSION_REGEX.source, TRANSCLUSION_REGEX.flags);
        let result = '';
        let lastIndex = 0;
        let i = 0;
        let sm: RegExpExecArray | null;
        while ((sm = substRegex.exec(markdownText)) !== null) {
            result += markdownText.slice(lastIndex, sm.index);
            result += replacements[i++];
            lastIndex = sm.index + sm[0].length;
        }
        result += markdownText.slice(lastIndex);

        return result;
    }

    private async resolveTransclusion(
        transclusionMatch: TranscludeMatch,
        parentFilePath: string,
        rootFilePath: string,
        visitedFiles: Set<string>
    ): Promise<string> {
        this.loggerChannel.trace(`Transcluding ${transclusionMatch.relativeFilePath} into ${parentFilePath}`);
        const parentFileFolder = path.dirname(parentFilePath);
        const absoluteFilePath = path.resolve(parentFileFolder, transclusionMatch.relativeFilePath);

        if (visitedFiles.has(absoluteFilePath)) {
            this.loggerChannel.error(`Transclusion cycle detected into "${parentFilePath}": ${transclusionMatch.relativeFilePath}`);
            return `Cycle detected into "${parentFilePath}" while inserting ${transclusionMatch.relativeFilePath}. This file is referred twice, with a circular dependency (A->B...->A)`;
        }

        let fileContents: string;
        try {
            fileContents = await fs.readFile(absoluteFilePath, 'utf-8');
        } catch (err) {
            this.loggerChannel.error(`Failed to transclude "${transclusionMatch.relativeFilePath}" into "${parentFilePath}": ${(err as Error).message}.`);
            return `Unable to read file "${transclusionMatch.relativeFilePath}" to insert into "${parentFilePath}".`;
        }

        const body = this.getBody(fileContents);

        // Fix this file's own images in one shot, directly relative to the root document
        const bodyWithFixedImages = this.recomputeLocalPath(body, absoluteFilePath, rootFilePath);

        const offsetBody = transclusionMatch.headingOffset > 0
            ? this.applyHeadingOffset(bodyWithFixedImages, transclusionMatch.headingOffset)
            : bodyWithFixedImages;

        const childVisited = new Set(visitedFiles);
        childVisited.add(absoluteFilePath);

        // Recurse: currentFilePath becomes this file, but rootFilePath is unchanged
        return this.processTransclusions(offsetBody, absoluteFilePath, rootFilePath, childVisited, transclusionMatch.headingOffset);
    }

    /**
     * Shifts every ATX heading (# ... ######) down by `offset` levels, clamped at 6.
     * Skips content inside fenced code blocks so ```# comment``` isn't touched.
     */
    private applyHeadingOffset(markdown: string, offset: number): string {
        const lines = markdown.split('\n');
        let inFence = false;

        return lines
            .map(line => {
                if (/^\s*(```|~~~)/.test(line)) {
                    inFence = !inFence;
                    return line;
                }
                if (inFence) return line;

                const headingMatch = line.match(/^(#{1,6})(\s+.*)$/);
                if (!headingMatch) return line;

                const newLevel = Math.min(headingMatch[1].length + offset, 6);
                return '#'.repeat(newLevel) + headingMatch[2];
            })
            .join('\n');
    }

    private recomputeLocalPath(markdown: string, currentFileAbsPath: string, rootFilePath: string): string {
        const currentDir = path.dirname(currentFileAbsPath);
        const rootDir = path.dirname(rootFilePath);

        const imageRegex = /(!\[[^\]]*\]\()([^)\s]+)((?:\s+"[^"]*")?\))/g;

        return markdown.replace(imageRegex, (match, prefix, url, suffix) => {
            if (this.isRemoteOrAbsolute(url) || this.isTransclusion(url)) {
                return match;
            }

            // Resolve the image relative to the file it's literally written in
            const imageAbsPath = path.resolve(currentDir, decodeURIComponent(url));

            // Recompute directly relative to the ROOT document, not the immediate parent
            let newRelativePath = path.relative(rootDir, imageAbsPath);
            newRelativePath = newRelativePath.split(path.sep).join('/');

            if (!newRelativePath.startsWith('.') && !newRelativePath.startsWith('/')) {
                newRelativePath = './' + newRelativePath;
            }

            return `${prefix}${encodeURI(newRelativePath)}${suffix}`;
        });
    }

    private isRemoteOrAbsolute(url: string): boolean {
        return /^(https?:)?\/\//i.test(url)   // http://, https://, protocol-relative //
            || /^data:/i.test(url)             // data URIs
            || /^[a-zA-Z]:[\\/]/.test(url)     // Windows absolute (C:\ or C:/)
            || url.startsWith('/');            // POSIX absolute
    }

    private isTransclusion(url: string): boolean {
        return /\.(md|txt)$/i.test(url);
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

    private async inlineCssAssetImages(
        css: string,
        documentUri: vscode.Uri = this.documentUri
    ): Promise<string> {

        return css;
    };

    private async convertCssLocalImagesUrl(
        css: string,
        inlineImages: boolean = false,
        cssDocumentUri: vscode.Uri = this.documentUri
    ): Promise<string> {
        const documentUri = cssDocumentUri;
        const baseDir = path.dirname(documentUri.fsPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? baseDir;
        const regex = /url\(\s*(['"]?)([^)'"]+)\1\s*\)/g;


        // Première passe : collecter tous les matches et leurs remplacements en parallèle
        const matches: { fullMatch: string; replacement: string }[] = [];
        const promises: Promise<void>[] = [];

        let m: RegExpExecArray | null;
        while ((m = regex.exec(css)) !== null) {
            const [fullMatch, quote, src] = m;

            // URL is HTTP or Data
            if (/^(https?:|data:|vscode-webview-resource:)/.test(src)) {
                continue;
            }
            const fsPath = path.isAbsolute(src)
                ? path.join(workspaceRoot, src)
                : path.resolve(baseDir, src);

            const entry = { fullMatch, replacement: fullMatch }; // fallback = inchangé
            matches.push(entry);

            promises.push((async () => {
                if (inlineImages) {
                    // HTML output with image inlining
                    try {
                        const fileBuffer = await fs.readFile(fsPath);
                        const mimeType = this.getMimeType(fsPath);
                        const base64 = fileBuffer.toString('base64');
                        entry.replacement = `url(${quote}data:${mimeType};base64,${base64}${quote})`;
                    } catch {
                        console.warn(`CSS image not found, skipping: ${fsPath}`);
                    }
                } else if (this.isVscPreview && this.panel) {
                    // Webview : Transform to Webview Uri
                    const webviewUri = this.toWebviewUri(this.panel, fsPath);
                    entry.replacement = `url(${quote}${webviewUri}${quote})`;
                } else {
                    // HTML output without image inlining
                    const imagePath = path.isAbsolute(src)
                        ? path.join(workspaceRoot, src)
                        : src;
                    entry.replacement = `url(${quote}${imagePath}${quote})`;
                }
            })());
        }

        await Promise.all(promises);

        // Deuxième passe : substitution simple chaîne par chaîne
        for (const { fullMatch, replacement } of matches) {
            css = css.replace(fullMatch, replacement);
        }

        return css;
    }

    private toWebviewUri(panel: vscode.WebviewPanel, fsPath: string): string {
        // Converts a local file path to a webview Uri
        return panel.webview.asWebviewUri(vscode.Uri.file(fsPath)).toString();
    }

    private async convertLocalImagesUrl(
        html: string,
        inlineImages: boolean = false
    ): Promise<string> {
        const documentUri = this.documentUri;
        const baseDir = path.dirname(documentUri.fsPath);
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? baseDir;

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

                // Resolve relative to base and workspace root directory
                // Used for HTML inlining and webview Uris.
                const imagePath = path.isAbsolute(src)
                    ? path.join(workspaceRoot, src)
                    : path.resolve(baseDir, src);

                if (inlineImages) {
                    // HTML output with Inline Images
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
                } else if (this.isVscPreview) {
                    // Webview
                    // Transform image URL to webview Uri
                    if (this.panel) {
                        const webviewUri = this.toWebviewUri(this.panel, imagePath);
                        // const webviewUri = this.panel.webview.asWebviewUri(vscode.Uri.file(imagePath)).toString();
                        img.setAttribute('src', `${webviewUri}`);
                    }
                } else {
                    // HTML Output with no image inlining
                    // - Resolve absolute paths to workspace root directory
                    // - Do not resolve relative path.
                    const imagePath = path.isAbsolute(src)
                        ? path.join(workspaceRoot, src)
                        : src;
                    img.setAttribute('src', `${imagePath}`);
                }

            } catch (err) {
                console.warn(`Failed to ${inlineImages ? 'inline' : 'render'} image '${src}':`, err);
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
        // Webview: Change image URLs to Webview URIs
        if (this.isVscPreview) {
            pageHtml = await this.convertLocalImagesUrl(pageHtml, false);
        }
        // Inline Local Images
        else {
            if (getConfig().get('inlineLocalImages')) {
                pageHtml = await this.convertLocalImagesUrl(pageHtml, true);
            }
            else {
                pageHtml = await this.convertLocalImagesUrl(pageHtml, false);
            }
        }
        return pageHtml;
    }

    public async postProcessCss(
        css: string,
        cssDocumentUri: vscode.Uri = this.documentUri,
        forceImageInlining: boolean = false
    ): Promise<string> {
        css = await this.inlineCssAssetImages(css);
        // Webview: Change image URLs to Webview URIs
        if (this.isVscPreview && !forceImageInlining) {
            css = await this.convertCssLocalImagesUrl(css, false, cssDocumentUri);
        }
        // Inline Local Images
        else {
            if (getConfig().get('inlineLocalImages') || forceImageInlining) {
                css = await this.convertCssLocalImagesUrl(css, true, cssDocumentUri);
            }
            else {
                css = await this.convertCssLocalImagesUrl(css, false, cssDocumentUri);
            }
        }
        return css;
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
    public async getInlineStyles<T = any>(
        markdownText: string,
        cssDocumentUri: vscode.Uri = this.documentUri,
        forceImageInlining: boolean = false
    ): Promise<string> {
        let cssContent: string = "";
        const match = markdownText.match(CSS_REGEX);
        if (match) {
            cssContent = match[1];
        };
        return await this.postProcessCss(cssContent, cssDocumentUri, forceImageInlining);
    }


    /**
     * Get a Brew's body content from the markdown input.
     * and returns this content as a string.
     */
    public getBody<T = any>(markdownText: string): string {
        return markdownText.replace(CSS_REGEX, "").replace(METADATA_REGEX, "").trim();
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
     * Determines whether the first page of a Homebrewery markdown document is empty.
     *
     * A "first page" is considered empty if, after stripping out the CSS and
     * metadata fenced blocks, there is no content before the first `\page`
     * directive (or no content at all).
     *
     * @param markdownText - The raw markdown source of the brew.
     * @returns `true` if the first page has no renderable content before the
     * first `\page` marker (or the document is empty/whitespace only);
     * `false` otherwise.
     */
    public isEmptyFirstPage(markdownText: string): boolean {
        // Remove CSS and Metadata fenced blocks
        const cleanedText = markdownText
            .replace(CSS_REGEX, '')
            .replace(METADATA_REGEX, '')
            .trim();
        // Split text in lines
        const lines = cleanedText.split(/\r\n|\r|\n/);
        // Find first non empty line
        const firstContentLine = lines.find((line) => line.trim().length > 0);
        // Return true if the first non-empty line is a page break.
        return firstContentLine === undefined || PAGE_REGEX.test(firstContentLine.trim());
    }

    public ComputeLinePositionForPage(markdownText: string, targetPagePosition: number): number {
        let targetLine = 0;
        let pagesCount = 1;


        // Entire do number of lines
        let rawLinesNb = markdownText.split(/\r\n|\r|\n/).length;

        // Remove markdown and CSS fenced blocks
        const cleanMarkdownText = markdownText
            .replace(CSS_REGEX, '')
            .replace(METADATA_REGEX, '')

        const markdownLines = cleanMarkdownText.split(/\r\n|\r|\n/);

        const fencedBlocksLinesNb = rawLinesNb - markdownLines.length;
        let startPageCount = false;

        for (let i = 0; i < markdownLines.length; i++) {
            const lineText = markdownLines[i];
            if (startPageCount && PAGE_REGEX.test(lineText)) {
                // Count instances of the page regexp, only if a non-empty line preceeds.
                pagesCount++;
                if (pagesCount === targetPagePosition) {
                    // We found the delimiter. The content starts on the NEXT line.
                    targetLine = Math.min(i + fencedBlocksLinesNb, rawLinesNb - 1);
                    break;
                }
            }

            // First non-empty line triggers page count.
            if (lineText.trim() !== "") {
                startPageCount = true;
            };
        }
        return targetLine;
    }

    /**
     * Renders one page of markdown as HTML
     *  Each page has an ID and key with its number.
     */
    private async renderPage(pageText: string, index: number) {
        let styles = {
            // ...(!displayOptions.pageShadows ? { boxShadow: 'none' } : {})
            // Add more conditions as needed
        };
        let classes = 'page';
        let attributes = {};

        // EXtracting tags injected on the page element. 
        if (pageText.startsWith('\\page')) {
            const firstLine = pageText.split('\n', 1)[0];
            const firstToken = Markdown.marked.lexer(firstLine)[0];
            const firstLineTokens = 'tokens' in firstToken ? firstToken.tokens : undefined;
            type TokenWithInjectedTags = Token & { injectedTags?: { styles: Record<string, string>; classes: string; attributes: any } };
            const injectedTags = (firstLineTokens as TokenWithInjectedTags[])?.find((obj) => obj.injectedTags !== undefined)?.injectedTags;
            // const injectedTags = firstLineTokens?.find((obj)=>obj.injectedTags !== undefined)?.injectedTags;
            if (injectedTags) {
                styles = { ...styles, ...injectedTags.styles };
                classes = [classes, injectedTags.classes].join(' ').trim();
                attributes = injectedTags.attributes;
            }
            pageText = pageText.includes('\n') ? pageText.substring(pageText.indexOf('\n') + 1) : ''; // Remove the \page line
        }

        // Page Styles
        let styleString = styles ? Object.entries(styles)
            .map(([key, value]) => `${_.kebabCase(key)}:${value}`)
            .join(';') : '';
        if (styleString.length > 0) {
            styleString = `style="${styleString}"`;
        }

        // Page Attributes
        const attributeString = attributes ? Object.entries(attributes)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ') : '';

        // Page Text
        pageText = this.preProcessPageText(pageText);
        pageText += `\n\n&nbsp;\n\\column\n&nbsp;`;

        // <div class="${classes}" id="p${index + 1}" key="${index}" >
        let pageBody = `
        <div class="${classes}" ${styleString} ${attributeString} id="p${index + 1}" key="${index}" >
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
     * and page split markers.
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
     * 3. **Preprocess text**: Cleans and normalizes Markdown-like syntax, splitting into pages at page markers.
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
        let inlineStyles = await this.getInlineStyles(markdownText);

        let body = this.getBody(markdownText);
        // Render the Body (all pages)
        let htmlBody = await this.renderBody(body);

        // Generate the template
        let template = await htmlTemplate(this.context, isVscPreview, theme);

        // Insert metadata (if any)
        template = template.replace('{{ metadata }}', htmlMetaTags);

        // Insert Language
        const language = metadata?.language || getConfig().get<string>("defaultLanguage") || "en";
        template = template.replace('{{ language }}', language);

        // Insert inlined CSSS
        template = template.replace('{{ inline_styles }}', `<style id="inline_styles">\n${inlineStyles}\n</style>`);

        // Insert the Body
        let htmlOutput = template.replace('{{ body }}', htmlBody);

        return htmlOutput;
    }

    public async renderBody(markdownText: string): Promise<string> {

        // Get the body content (no CSS, not metadata)
        let body = this.getBody(markdownText);

        // Preprocess Text
        const preProcessedText = await this.preProcessText(body);

        // Split the boby into pages after proprocessing.
        const pages = preProcessedText.split(new RegExp(PAGE_REGEX.source, 'gm'));

        // All pages rendering start simultaneously
        const renderPromises = pages.map((pageContent, i) => this.renderPage(pageContent, i));

        // Wait for ALL promises to settle
        // Results will be an array of strings in the correct order
        const htmlPages = await Promise.all(renderPromises);

        // 4. Join them into the final body
        return htmlPages.join("");
    }

};