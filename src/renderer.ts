'use strict';
import * as vscode from 'vscode';
import Markdown from './homebrewery/renderer/markdown.js';
import { htmlTemplate } from './html-template';
import * as yaml from "js-yaml";

// @ts-ignore
declare module './markdown';

function preProcessText(text: string) {
    // This function is used to preprocess the markdown text before rendering. It can be used to add any custom syntax or transformations that we want to support in our markdown files. For example, we can use it to inject footnotes, handle custom directives, etc.
    text = injectFootnotes(text);
    return text;
}

function preProcessPageText(pageText: string) {
    // This function is used to preprocess each page of the markdown text before rendering. It can be used to add any custom syntax or transformations that we want to support in our markdown files on a per-page basis. For example, we can use it to inject footnotes, handle custom directives, etc.
    return pageText;
}

interface Metadata {
    title?: string;
    description?: string;
    tags?: string[];
    systems?: string[];
    renderer?: string;
    theme?: string;
}

/**
 * Generates HTML <title> and <meta> tags from metadata.
 */
function generateHeadTags(meta: Metadata | null): string {

    if (!meta) {
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
    if (meta.title) {
        parts.push(`<title>${escapeHtml(meta.title)}</title>`);
        parts.push(`<meta property="og:title" content="${escapeHtml(meta.title)}">`);
    }

    // Description
    if (meta.description) {
        parts.push(
            `<meta name="description" content="${escapeHtml(meta.description)}">`
        );
        parts.push(
            `<meta property="og:description" content="${escapeHtml(meta.description)}">`
        );
    }

    // Tags → keywords
    if (meta.tags?.length) {
        parts.push(
            `<meta name="keywords" content="${escapeHtml(meta.tags.join(", "))}">`
        );
    }

    // Systems
    if (meta.systems?.length) {
        parts.push(
            `<meta name="systems" content="${escapeHtml(meta.systems.join(", "))}">`
        );
    }

    // Renderer
    if (meta.renderer) {
        parts.push(
            `<meta name="renderer" content="${escapeHtml(meta.renderer)}">`
        );
    }

    // Theme
    if (meta.theme) {
        parts.push(
            `<meta name="theme" content="${escapeHtml(meta.theme)}">`
        );
    }

    return parts.join("\n");
}

/**
 * Extracts a ```metadata fenced block and parses it as YAML.
 */
interface ExtractMetadataResult {
    metadata: Metadata | null;
    content: string;
}

/**
 * Extracts a ```metadata fenced block, parses it as YAML,
 * and returns both the parsed metadata and the cleaned content.
 */
function extractMetadata<T = any>(input: string): ExtractMetadataResult {
    const regex = /```metadata\s*([\s\S]*?)\s*```/;
    const match = input.match(regex);
    if (!match) {
        return {
            metadata: null,
            content: input
        };
    }
    let metadata: Metadata | null = null;
    try {
        metadata = yaml.load(match[1]) as Metadata;
    } catch (err: any) {
        throw new Error(`Invalid metadata YAML: ${err.message}`);
    }
    const cleanedContent = input.replace(regex, "").trim();
    return {
        metadata,
        content: cleanedContent
    };
}

/**
 * Extracts a ```css fenced block, parses it as YAML,
 * and returns both the css and the cleaned content.
 */
function extractCss<T = any>(input: string): { css: string | null; content: string; } {
    const regex = /```css\s*([\s\S]*?)\s*```/;
    const match = input.match(regex);
    if (!match) {
        return {
            css: "",
            content: input
        };
    } else {
        const cleanedContent = input.replace(regex, "").trim();
        return {
            css: match[1],
            content: cleanedContent
        };
    }
}

function injectFootnotes(text: string) {
    // This function is used to inject footnotes into the markdown text. It looks for {footnote H1}, {footnote H2}, etc. and replaces them with the corresponding heading text. This allows us to have dynamic footnotes that reference the current section of the document.
    const lines = text.split('\n');
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

function renderPage(pageText: string, index: number) {
    // This function is used to render each page of the markdown text. It takes the page text and the page index as input and returns the HTML for that page. We can use the index to add unique IDs or classes to each page if needed.
    pageText = preProcessPageText(pageText);
    pageText += `\n\n&nbsp;\n\\column\n&nbsp;`;
    let pageBody = `
        <div class="page phb" id="p${index + 1}" key="${index}" >
            <div class="columnWrapper">${Markdown.render(pageText)}</div>
        </div>`;
    return pageBody;
}

export async function renderHTML(text: string, context: vscode.ExtensionContext, addScrollEventsScript: boolean = false): Promise<string> {
    // This function is the main entry point for rendering the markdown text into HTML. It takes the markdown text, the extension context, and optionally the webview panel and filename as input. It returns the final HTML output that can be displayed in the webview or saved to a file.

    // Extract Metadata
    let { metadata, content } = extractMetadata(text);
    const htmlMeta = generateHeadTags(metadata);
    let theme = "";
    if (metadata && metadata.theme) {
        theme = metadata.theme;
    }
    // Extract CSS
    let { css, content: cleanContent } = extractCss(content);

    // Preprocess entire markdown payload
    let pages = preProcessText(cleanContent).split(/^\\page$/gm);

    // Render the Body, one page at a time
    let htmlBody = "";
    for (let i = 0; i < pages.length; i++) {
        htmlBody += renderPage(pages[i], i);
    }
    
    // Generate the template
    let template = await htmlTemplate(context, addScrollEventsScript, theme);

    // Insert metadata (if any)
    template = template.replace('{{ metadata }}', htmlMeta);
    // Insert inlined CSSS
    template = template.replace('{{ inlined_styles }}', `<style>\n${css}\n</style>`);

    // Insert the Body
    let htmlOutput = template.replace('{{ body }}', htmlBody);

    return htmlOutput;
}
