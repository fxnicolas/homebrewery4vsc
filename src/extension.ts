'use strict';
import * as vscode from 'vscode';
import Preview from './preview';
import { generateFile } from './html-file-generator';
import { allIconFontsCompletionItems } from './iconfonts-completions';
import * as constants from './constants';
import { getConfig } from './utils';
import { DecorationManager } from './decoration-manager';


export function activate(context: vscode.ExtensionContext) {
	let preview = new Preview(context);

	let disposableSidePreview = vscode.commands.registerCommand('homebrewery4vsc.sidePreview', async () => { await preview.initMarkdownPreview(vscode.ViewColumn.Two); });
	let disposableStandalonePreview = vscode.commands.registerCommand('homebrewery4vsc.preview', async () => { await preview.initMarkdownPreview(vscode.ViewColumn.One); });


	let generateCommand = vscode.commands.registerCommand('homebrewery4vsc.generate', (uri?: vscode.Uri) => generateFile(context, uri));
	let previewLayoutSimpleSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutSimpleSpread', () => { preview.togglePreviewLayoutSpread(); });
	let previewLayoutFacingSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutFacingSpread', () => { preview.togglePreviewLayoutSpread(); });
	let previewLayoutFlowSpread = vscode.commands.registerCommand('homebrewery4vsc.previewLayoutFlowSpread', () => { preview.togglePreviewLayoutSpread(); });
	let previewZoomIn = vscode.commands.registerCommand('homebrewery4vsc.previewZoomOut', () => { preview.previewZoomOut(); });
	let previewZoomOut = vscode.commands.registerCommand('homebrewery4vsc.previewZoomIn', () => { preview.previewZoomIn(); });
	let previewZoomReset = vscode.commands.registerCommand('homebrewery4vsc.previewZoomReset', () => { preview.previewZoomReset(); });

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
	let iconFontsProvider: vscode.Disposable | undefined;

	// Enable or disable the Font Icon completion provider.
	const toggleIconFontsProvider = () => {
		const config = getConfig();
		const enabled = config.get<boolean>('enableFontIconCompletions');
		if (enabled && !iconFontsProvider) {
			iconFontsProvider = vscode.languages.registerCompletionItemProvider(
				{ language: 'markdown' },
				{
					provideCompletionItems() {
						return allIconFontsCompletionItems();
					}
				}
			);
			context.subscriptions.push(iconFontsProvider);
		}
		if (!enabled && iconFontsProvider) {
			iconFontsProvider.dispose();
			iconFontsProvider = undefined;
		}
	};
	// Enable/Disable the provider when activating the extension.
	toggleIconFontsProvider();

	// Enable/Disable the provider on settings changes.
	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(`${constants.EXTENSION_ID}.enableFontIconCompletions`)) {
			toggleIconFontsProvider();
		}
	});

	// Page and Column Text Decorations
	new DecorationManager(context);

}



// This method is called when your extension is deactivated
export function deactivate() { }
