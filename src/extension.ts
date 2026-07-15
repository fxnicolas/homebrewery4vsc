'use strict';
import * as vscode from 'vscode';
import Preview from './preview';
import { generateFile } from './html-file-generator';
import { allIconFontsCompletionItems } from './iconfonts-completions';
import { SnippetsBlock, snippetsProviderItems } from './snippets-completions';
import Renderer from './renderer';

import * as constants from './constants';
import { getConfig } from './utils';
import { DecorationManager } from './decorationManager';

import { SrdNodeProvider } from './srd-explorer/srd-explorer';
import { ErrorMessages } from './constants';

let currentSnippets: SnippetsBlock[] = [];


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
	let synchronizedScrollOn = vscode.commands.registerCommand('homebrewery4vsc.synchronizedScrollOn', () => { preview.toggleSynchronizedScroll(); });
	let synchronizedScrollOff = vscode.commands.registerCommand('homebrewery4vsc.synchronizedScrollOff', () => { preview.toggleSynchronizedScroll(); });

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
	context.subscriptions.push(synchronizedScrollOn);
	context.subscriptions.push(synchronizedScrollOff);

	/**********************************/
	/* Icon fonts completion provider */
	/**********************************/
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


	/*********************/
	/* Snippets Provider */
	/*********************/
	// Register provider ONCE
	const provider = vscode.languages.registerCompletionItemProvider(
		{ language: "markdown" },
		{
			provideCompletionItems() {
				return snippetsProviderItems(currentSnippets);
			}
		}
	);

	context.subscriptions.push(provider);

	function reloadSnippets(document: vscode.TextDocument | undefined) {
		if (!document || document.languageId !== "markdown" || document !== vscode.window.activeTextEditor?.document) {
			return;
		}
		const renderer = new Renderer(document.uri, context);
		const metadata = renderer.getMetadata(document.getText());
		currentSnippets = metadata?.snippets ?? [];
	}

	// Update snippets when text changes
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {reloadSnippets(e.document);}));

	// Update when switching editor
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(e => {reloadSnippets(e?.document);}));

	// Initial load
	reloadSnippets(vscode.window.activeTextEditor?.document);

	/************************************/
	/* Page and Column Text Decorations */
	/************************************/
	new DecorationManager(context);

	/************************************/
	/* SRD EXplorer */
	/************************************/
	const srdProvider = new SrdNodeProvider();
	vscode.window.registerTreeDataProvider('homebrewery4vsc.srd-explorer', srdProvider);
	let insertSrdContentComment = vscode.commands.registerCommand('homebrewery4vsc.insertSrdContent', async (url: string) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== "markdown") {
			vscode.window.showErrorMessage(constants.ErrorMessages.NO_MARKDOWN_EDITOR);
			return;
		}
		const content = await srdProvider.getSrdContent(vscode.Uri.parse(url));
		editor.edit(editBuilder => {
			editBuilder.insert(editor.selection.active, content);
		});
	});
	context.subscriptions.push(insertSrdContentComment);

}

// This method is called when your extension is deactivated
export function deactivate() { }
