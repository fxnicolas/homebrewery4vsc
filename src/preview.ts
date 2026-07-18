"use strict";
import * as vscode from 'vscode';
import * as path from 'path';
import Renderer from './renderer';
// import { disposeAll } from './utils/dispose';
import * as constants from './constants';
import { getConfig } from "./utils";
import { getThemeStyles } from './theme';
import { PAGE_REGEX, COLUMN_REGEX } from './utils';


// const output = vscode.window.createOutputChannel(EXTENSION_ID);
// output.appendLine('Extension ready!');

const enum LayoutSpread {
    Simple = "simple",
    Facing = "facing",
    Flow = "flow"
};

export default class Preview {
    panel: vscode.WebviewPanel | undefined;
    currentLayoutSpread: LayoutSpread = LayoutSpread.Simple;
    currentZoom: number = 100;
    synchronizedScroll: boolean = true;
    collapseTransclusions: boolean = false;
    context: vscode.ExtensionContext;
    currentTheme: string = "";
    currentLanguage: string = "en";
    currentinlineStyles: string = "";
    private documentUri: vscode.Uri | undefined;
    private isDisposed: boolean = false;
    private lastSentPage: number = -1;
    private currentRenderer: Renderer | undefined;
    private metadataCache: { theme: string, snippets: any[] } | null = null;
    private inlineStylesCache: string = "";
    private lastContentType: string = "";
    private lastUpdateHash: number = 0;

    private debounceTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    };

    private getEditorFileName(editor: vscode.TextEditor): string {
        const filePaths = editor.document.fileName.split('/');
        const fileName = filePaths[filePaths.length - 1];
        return fileName;
    }

    private editorCurrentPageNumber(visibleRanges: readonly vscode.Range[], document: vscode.TextDocument): number {
        if (visibleRanges.length === 0) {
            return 1;
        }

        // Calculate the middle line of the visible range
        const range = visibleRanges[0];
        const middleLine = Math.floor((range.start.line + range.end.line) / 2);

        const markdownText = document.getText();
        const lines = markdownText.split(/\r\n|\r|\n/);

        // Count page directives that appear before that middle line
        let pageDirectivesBefore = 0;
        const limit = Math.min(middleLine, lines.length);

        for (let i = 0; i < limit; i++) {
            if (PAGE_REGEX.test(lines[i].trim())) {
                pageDirectivesBefore++;
            }
        }

        return this.currentRenderer?.isEmptyFirstPage(document.getText()) ? pageDirectivesBefore : pageDirectivesBefore + 1;

    }

    private syncPreview(textEditor: vscode.TextEditor, visibleRanges: readonly vscode.Range[]) {
        // Calculate the page based on the range provided
        const currentPage = this.editorCurrentPageNumber(visibleRanges, textEditor.document);

        // Only post a message if the page actually changed
        if (currentPage !== this.lastSentPage) {
            this.lastSentPage = currentPage;
            this.postMessage({
                type: 'scroll',
                page: currentPage,
                mode: 'smooth'
            });
        }
    }

    private isMarkdownEditor(editor: vscode.TextEditor, showWarning: boolean = false): boolean {
        const languageId: string = editor ? editor.document.languageId.toLowerCase() : "";
        const result = languageId === "markdown";
        if (!result && showWarning) {
            vscode.window.showInformationMessage(constants.ErrorMessages.NOT_MARKDOWN);
        }
        return result;
    }

    private initializeLayoutAndScroll() {
        // Setting the Page layout
        this.currentLayoutSpread = LayoutSpread.Simple;
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.currentLayoutSpread',
            this.currentLayoutSpread
        );
        // Setting the Zoop Level
        this.currentZoom = 100;
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.currentZoom',
            this.currentZoom
        );
        this.synchronizedScroll = getConfig().get('scrollPreviewWithEditor') || true;
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.synchronizedScroll',
            this.synchronizedScroll
        );
        this.collapseTransclusions = getConfig().get('CollapseIncludes') || false;
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.collapseTransclusions',
            this.collapseTransclusions
        );
    }


    async initMarkdownPreview(viewColumn: number) {
        const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
        if (editor && this.isMarkdownEditor(editor)) {
            if (this.panel) {
                // Reuse existing panel.
                this.documentUri = editor.document.uri;
                await this.updatePreview.call(this);
                this.panel.reveal();
            } else {
                // Create and show a new webview
                this.initializeLayoutAndScroll();
                this.panel = vscode.window.createWebviewPanel(
                    'HomebrewPreview',
                    '[Preview] ' + this.getEditorFileName(editor),
                    viewColumn,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [
                            vscode.Uri.file(path.dirname(editor.document.uri.fsPath)),      // Editor file location
                            this.context.extensionUri,                                      // Extension resources
                            ...(vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []),  // Workspace folders
                        ]
                    }
                );
                // Set the preview properties
                this.panel.iconPath = this.iconPath;
                this.isDisposed = false;
                this.documentUri = editor.document.uri;

                // And set its HTML content
                await this.reloadPreview.call(this);

                // Register events for refresh
                const onDidChangeTextDocumentListener = vscode.workspace.onDidChangeTextDocument(this.debouncedupdatePreview.bind(this));
                this.context.subscriptions.push(onDidChangeTextDocumentListener);
                const onDidChangeConfigurationListener = vscode.workspace.onDidChangeConfiguration(() => { this.reloadPreview(); });
                this.context.subscriptions.push(onDidChangeConfigurationListener);
                const onDidSaveTextDocumentListener = vscode.workspace.onDidSaveTextDocument(this.debouncedupdatePreview.bind(this));
                this.context.subscriptions.push(onDidSaveTextDocumentListener);
                const onDidChangeActiveTextEditorListener = vscode.window.onDidChangeActiveTextEditor(this.debouncedupdatePreview.bind(this));
                this.context.subscriptions.push(onDidChangeActiveTextEditorListener);

                // Synchronize Editor Scrolling -> Preview
                const onDidChangeTextEditorVisibleRangesListener = vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
                    if (this.isMarkdownEditor(textEditor) && this.synchronizedScroll) {
                        // Pass the visible ranges (the lines physically on screen)
                        this.syncPreview(textEditor, visibleRanges);
                    }
                });
                this.context.subscriptions.push(onDidChangeTextEditorVisibleRangesListener);

                // Synchronize Editor Click and Cursor Move -> Preview
                const onDidChangeTextEditorSelectionListener = vscode.window.onDidChangeTextEditorSelection(({ textEditor, selections }) => {
                    if (this.isMarkdownEditor(textEditor) && this.synchronizedScroll) {
                        // Create a fake range based on where the cursor (selection) is
                        const cursorRange = new vscode.Range(selections[0].active, selections[0].active);

                        // Pass the cursor's position as the "range" to sync
                        this.syncPreview(textEditor, [cursorRange]);
                    }
                });
                this.context.subscriptions.push(onDidChangeTextEditorSelectionListener);


                // Synchronize Click Page in Preview -> Editor
                const onDidReceiveMessageListener = this.panel.webview.onDidReceiveMessage(message => {
                    // Clicking in the webview sends a message { "goToPage", targetPage }
                    if (message.type === 'goToPage') {
                        this.scrollEditorToPage(message.page);
                    }
                    if (message.type === 'openDocument') {
                        this.openDocument(message.url);
                    }
                });
                this.context.subscriptions.push(onDidReceiveMessageListener);

                // Panel Disposal
                this.panel.onDidDispose(() => {
                    this.isDisposed = true;
                    this.panel = undefined;
                    // Dispose renderer if exists
                    if (this.currentRenderer) {
                        // this.currentRenderer.dispose();
                        this.currentRenderer = undefined;
                    }
                    // Clean up all previously registered listeners
                    clearTimeout(this.debounceTimer);
                }, null, this.context.subscriptions);
            }
        }
    };

    async debouncedupdatePreview() {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.updatePreview();
            }, 300);
        }
    }

    async updatePreview(workingEditor: vscode.TextEditor | undefined = undefined) {
        const editor = workingEditor
            || vscode.window.visibleTextEditors.find(e => this.isPreviewOf(e.document.uri))
            || vscode.window.activeTextEditor;
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            // Create renderer once per document if not exists or document URI changed
            if (!this.currentRenderer || this.documentUri !== editor.document.uri) {
                this.currentRenderer = new Renderer(editor.document.uri, this.context, this.panel, this.collapseTransclusions);
                this.documentUri = editor.document.uri;
            }
            let currentMarkdownText = editor.document.getText();

            // Update Language if changed.
            const language = this.currentRenderer.getMetadata(currentMarkdownText)?.language || getConfig().get<string>('defaultLanguage') || "en";
            if (this.currentLanguage !== language) {
                this.postMessage({
                    type: 'updateLanguage',
                    language: language,
                });
                this.currentLanguage = language;
            }

            // Update theme if changed
            const theme = this.currentRenderer.getMetadata(currentMarkdownText)?.theme || getConfig().get<string>('theme') || "None";
            if (this.currentTheme !== theme) {
                getThemeStyles(this.context, theme, false).then((themeStyles) => {
                    this.postMessage({
                        type: 'updateThemeStyles',
                        themeStyles: themeStyles,
                    });
                    this.currentTheme = theme;
                });
            }

            // Update inline styles if changed
            const newInlineStyles = await this.currentRenderer.getInlineStyles(currentMarkdownText);
            if (newInlineStyles !== this.inlineStylesCache) {
                this.postMessage({
                    type: 'updateInlineStyles',
                    inlineStyles: newInlineStyles,
                });
                this.inlineStylesCache = newInlineStyles || "";
            }

            // Update body
            this.currentRenderer.renderBody(currentMarkdownText).then((updatedBody) => {
                this.postMessage({
                    type: 'updateBody',
                    html: updatedBody,
                });
            });
        }
    };

    async reloadPreview(workingEditor: vscode.TextEditor | undefined = undefined) {
        const editor = workingEditor
            || vscode.window.visibleTextEditors.find(e => this.isPreviewOf(e.document.uri))
            || vscode.window.activeTextEditor;
        if (!editor) {
            // HACK: Switching text causes no Active Text Editor (SUPPRESSED)
            // vscode.window.showWarningMessage(constants.ErrorMessages.NO_ACTIVE_EDITOR);
            return;
        }
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            // Create renderer once per document if not exists or document URI changed
            if (!this.currentRenderer || this.documentUri !== editor.document.uri) {
                this.currentRenderer = new Renderer(editor.document.uri, this.context, this.panel, this.collapseTransclusions);
            }
            let currentMarkdownText = editor.document.getText();
            this.panel.title = `[Preview] ${this.getEditorFileName(editor)}`;
            this.documentUri = editor.document.uri;

            // Set the current CSS and Theme of the preview
            let css = await this.currentRenderer.getInlineStyles(currentMarkdownText);
            let theme = this.currentRenderer.getMetadata(currentMarkdownText)?.theme;
            let language = this.currentRenderer.getMetadata(currentMarkdownText)?.language;

            this.currentinlineStyles = css ? css : "";
            this.currentTheme = theme || getConfig().get<string>('theme') || "None";
            this.currentLanguage = language || getConfig().get<string>('defaultLanguage') || "en";

            this.currentRenderer.renderHTML(currentMarkdownText, true).then(currentHTMLContent => {
                if (this.panel) {
                    this.panel.webview.html = currentHTMLContent;
                }
            });
            this.updateZoomLevel();

            // CHECK: Only scroll if active text editor is changed
            if (this.isMarkdownEditor(editor, true) && this.synchronizedScroll) {
                this.postMessage({
                    type: 'scroll',
                    page: this.editorCurrentPageNumber(editor.visibleRanges, editor.document),
                    mode: 'instant'
                });
            }
        }
    }

    private async openDocument(webviewUrl: string): Promise<void> {
        const parsed = new URL(webviewUrl);
        // parsed.pathname is the original filesystem path that was passed to asWebviewUri,
        // e.g. "/tests/parts/part1.md" or "/tests/images/cover.webp"
        const relativePath = decodeURIComponent(parsed.pathname);

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found to resolve the file.');
            return;
        }

        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, relativePath);
        try {
            // Look for the column of preview's editor
            let targetColumn = vscode.ViewColumn.Active;
            for (const editor of vscode.window.visibleTextEditors) {
                if (this.isPreviewOf(editor.document.uri)) {
                    targetColumn = editor?.viewColumn ?? vscode.ViewColumn.Active;
                }
            }
            // Open referenced file with whichever editor VS Code deems appropriate
            // (text editor, image preview, etc.)
            await vscode.commands.executeCommand('vscode.open', fileUri, {
                viewColumn: targetColumn,
                preview: false
            });
        } catch (err) {
            vscode.window.showErrorMessage(`Could not open file: ${relativePath}`);
        }
    }

    private scrollEditorToPage(targetPage: number) {
        for (const editor of vscode.window.visibleTextEditors) {
            if (!this.isPreviewOf(editor.document.uri)) {
                continue;
            }

            const markdownText = editor.document.getText();

            const targetLine: number = this.currentRenderer ? this.currentRenderer?.ComputeLinePositionForPage(markdownText, targetPage) : 0;

            const pos = new vscode.Position(targetLine, 0);
            const selection = new vscode.Selection(pos, pos);

            // 1. Move the cursor
            editor.selection = selection;

            // 2. Reveal the range. 
            // 'AtTop' is usually what you want for a new page.
            // If you have "Sticky Scroll" enabled in VSCode, 'AtTop' 
            // automatically respects the sticky header height.
            editor.revealRange(
                new vscode.Range(pos, pos),
                vscode.TextEditorRevealType.AtTop
            );
        }
    }

    public togglePreviewLayoutSpread() {
        switch (this.currentLayoutSpread) {
            case LayoutSpread.Simple:
                this.currentLayoutSpread = LayoutSpread.Facing;
                break;
            case LayoutSpread.Facing:
                this.currentLayoutSpread = LayoutSpread.Flow;
                break;
            case LayoutSpread.Flow:
                this.currentLayoutSpread = LayoutSpread.Simple;
                break;
        }
        this.postMessage({
            type: 'layout',
            layout: `recto ${this.currentLayoutSpread}`
        });
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.currentLayoutSpread',
            this.currentLayoutSpread
        );
    }

    public toggleSynchronizedScroll() {
        this.synchronizedScroll = !this.synchronizedScroll
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.synchronizedScroll',
            this.synchronizedScroll
        );
    }

    public toggleTranclusionsCollapse() {
        this.collapseTransclusions = !this.collapseTransclusions
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.collapseTransclusions',
            this.collapseTransclusions
        );
        if (this.currentRenderer) {
            this.currentRenderer.isCollapseTransclusions = this.collapseTransclusions;
            this.reloadPreview();
        }
    }

    private updateZoomLevel() {
        this.postMessage({
            type: 'zoom',
            zoomLevel: this.currentZoom
        });
        vscode.commands.executeCommand(
            'setContext',
            'homebrewery.currentZoom',
            this.currentZoom
        );
    }

    public previewZoomIn() {
        if (this.currentZoom < 100) {
            this.currentZoom += 10;
        }
        else if (this.currentZoom >= 100 && this.currentZoom <= 300) {
            this.currentZoom += 50;
        }
        this.updateZoomLevel();
    };

    public previewZoomOut() {
        if (this.currentZoom <= 100 && this.currentZoom > 20) {
            this.currentZoom -= 10;
        }
        else if (this.currentZoom > 100) {
            this.currentZoom -= 50;
        }
        this.updateZoomLevel();
    };

    public previewZoomReset() {
        this.currentZoom = 100;
        this.updateZoomLevel();
    };

    private isPreviewOf(resource: vscode.Uri): boolean {
        if (this.documentUri) {
            return (this.documentUri.fsPath === resource.fsPath);
        }
        else {
            return false;
        }
    }

    private get iconPath() {
        const root = path.join(this.context.extensionPath, 'media/icons');
        return {
            light: vscode.Uri.file(path.join(root, 'preview.svg')),
            dark: vscode.Uri.file(path.join(root, 'preview_dark.svg'))
        };
    }

    private postMessage(msg: any) {
        if (this.panel && !this.isDisposed) {
            this.panel.webview.postMessage(msg);
        }
    }
}