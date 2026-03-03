'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import Renderer from './renderer';
import * as constants from './constants';

export async function generateFile(context: vscode.ExtensionContext) {
    let editor = vscode.window.activeTextEditor;
    let doc = editor?.document;
    if (!editor || doc?.languageId !== 'markdown') {
        vscode.window.showErrorMessage(constants.ErrorMessages.NOT_MARKDOWN);
        return;
    }
    else if (doc.isUntitled) {
        vscode.window.showErrorMessage(constants.ErrorMessages.SAVE_FIRST);
        return;
    }

    if (doc.isDirty) {
        doc.save();
    }

    let outputPath = doc.fileName.replace(/\.\w+?$/, `.html`);
    outputPath = outputPath.replace(/^([cdefghij]):\\/, (match, p1) => {
        return `${p1.toUpperCase()}:\\`; // Capitalize drive letter
    });
    if (!outputPath.endsWith('.html')) {
        outputPath += '.html';
    }

    let markdownContent = editor?.document.getText();
    let documentUri = editor.document.uri;
    let ouputHTMLContent = markdownContent ? await new Renderer(documentUri, context).renderHTML(markdownContent, false) : "";

    ouputHTMLContent ? fs.writeFileSync(outputPath, ouputHTMLContent, 'utf8') : null;
}