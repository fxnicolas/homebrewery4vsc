'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import Renderer from './renderer';
import * as constants from './constants';
import { formatString } from "./utils";


export async function generateFile(
    context: vscode.ExtensionContext,
    uri?: vscode.Uri
) {
    try {
        // Determine target document URI
        const documentUri = uri ?? vscode.window.activeTextEditor?.document.uri;

        if (!documentUri) {
            vscode.window.showErrorMessage(constants.ErrorMessages.NO_FILE_SELECTED);
            return;
        }

        // Open the document (works even if not currently open)
        const doc = await vscode.workspace.openTextDocument(documentUri);

        if (doc.languageId !== 'markdown') {
            vscode.window.showErrorMessage(constants.ErrorMessages.NOT_MARKDOWN);
            return;
        }

        if (doc.isUntitled) {
            vscode.window.showErrorMessage(constants.ErrorMessages.SAVE_FIRST);
            return;
        }

        // Save if dirty
        if (doc.isDirty) {
            await doc.save();
        }

        // Generate output path
        const outputPath = documentUri.fsPath.replace(/\.\w+?$/, '.html');

        // Render HTML
        const markdownContent = doc.getText();

        const outputHTMLContent =
            await new Renderer(documentUri, context)
                .renderHTML(markdownContent, false);

        if (!outputHTMLContent) {
            vscode.window.showErrorMessage(constants.ErrorMessages.HTML_GENERATION_FAILED);
            return;
        }

        // Write file
        fs.writeFileSync(outputPath, outputHTMLContent, 'utf8');
        const action = await vscode.window.showInformationMessage(
            formatString(constants.InfoMessages.HTML_GENERATION_SUCCESSFUL, { file: outputPath }),
            constants.extensionLabels.OPEN_IN_BROWSER);

        if (action === constants.extensionLabels.OPEN_IN_BROWSER) {
            await openInBrowser(outputPath);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(formatString(constants.ErrorMessages.GENERIC_ERROR, {error: err.message}));
    }
}

async function openInBrowser(filePath: string) {
    const uri = vscode.Uri.file(filePath);
    await vscode.env.openExternal(uri);
}