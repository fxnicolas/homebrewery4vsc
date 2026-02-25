'use strict';
import * as vscode from 'vscode';
import Preview from './preview';
import { generateFile } from './html-file-generator';
import { iconFontsProvider } from './iconfonts-completions';

export function activate(context: vscode.ExtensionContext) {
	let preview = new Preview(context);
	let disposableSidePreview = vscode.commands.registerCommand('homebrewery4vsc.sidePreview', async () => {
		await preview.initMarkdownPreview(vscode.ViewColumn.Two);
	});

	let disposableStandalonePreview = vscode.commands.registerCommand('homebrewery4vsc.preview', async () => {
		await preview.initMarkdownPreview(vscode.ViewColumn.One);
	});

	let generateCommand = vscode.commands.registerCommand('homebrewery4vsc.generate', () => {
		generateFile(context);
	});
	let previewLayoutSimpleSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutSimpleSpread', () => {
		preview.togglePreviewLayoutSpread();
	});
	let previewLayoutFacingSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutFacingSpread', () => {
		preview.togglePreviewLayoutSpread();
	});
	let previewLayoutFlowSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutFlowSpread', () => {
		preview.togglePreviewLayoutSpread();
	});
	let previewZoomIn = vscode.commands.registerCommand('homebrewery4vsc.previewZoomOut', () => {
		preview.previewZoomOut();
	});
	let previewZoomOut = vscode.commands.registerCommand('homebrewery4vsc.previewZoomIn', () => {
		preview.previewZoomIn();
	});
	let previewZoomReset = vscode.commands.registerCommand('homebrewery4vsc.previewZoomReset', () => {
		preview.previewZoomReset();
	});

	// push to subscriptions list so that they are disposed automatically
	context.subscriptions.push(disposableSidePreview);
	context.subscriptions.push(disposableStandalonePreview);
	context.subscriptions.push(generateCommand);
	context.subscriptions.push(previewLayoutSimpleSpread);
	context.subscriptions.push(previewLayoutFacingSpread);
	context.subscriptions.push(previewLayoutFlowSpread);
	context.subscriptions.push(previewZoomIn);
	context.subscriptions.push(previewZoomOut);
	context.subscriptions.push(previewZoomReset);
	// Icon fonts completion provider
	context.subscriptions.push(iconFontsProvider);
}

// This method is called when your extension is deactivated
export function deactivate() {}
