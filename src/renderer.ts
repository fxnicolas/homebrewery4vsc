'use strict';
import * as vscode from 'vscode';
import Markdown from './homebrewery/renderer/markdown.js';
import { htmlTemplate } from './html-template';

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

export function renderHTML(text: string, context: vscode.ExtensionContext, addScrollEventsScript: boolean = false) {
    // This function is the main entry point for rendering the markdown text into HTML. It takes the markdown text, the extension context, and optionally the webview panel and filename as input. It returns the final HTML output that can be displayed in the webview or saved to a file.
    let pages = preProcessText(text).split(/^\\page$/gm);
    let htmlBody = "";
    for (let i = 0; i < pages.length; i++) {
        htmlBody += renderPage(pages[i], i);
    }
    let template = htmlTemplate(context, addScrollEventsScript);
    let htmlOutput = template ? template.replace('{{ body }}', htmlBody) : template;
    return htmlOutput;
}
