'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { renderHTML } from './renderer';

export async function generateFile(context: vscode.ExtensionContext) {
    let editor = vscode.window.activeTextEditor;
    let doc = editor?.document;
    if (!editor || doc?.languageId !== 'markdown') {
        vscode.window.showErrorMessage('Not a valid Markdown file');
        return;
    }
    else if (doc.isUntitled) {
        vscode.window.showErrorMessage('Please save the file first');
        return;
    }

    if (doc.isDirty) {
        doc.save();
    }

    let outPath = doc.fileName.replace(/\.\w+?$/, `.html`);
    outPath = outPath.replace(/^([cdefghij]):\\/, (match, p1) => {
        return `${p1.toUpperCase()}:\\`; // Capitalize drive letter
    });
    if (!outPath.endsWith('.html')) {
        outPath += '.html';
    }

    let text = editor?.document.getText();
    let res = text ? await renderHTML(text, context, false) : "";

    res ? fs.writeFileSync(outPath, res, 'utf8') : null;
}