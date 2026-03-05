"use strict";
import * as vscode from 'vscode';
import * as path from 'path';
import Renderer  from './renderer';
// import { disposeAll } from './utils/dispose';
import * as constants from './constants';
import { getConfig } from "./utils";

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
    context: vscode.ExtensionContext;
    private documentUri: vscode.Uri | undefined;
    private isDisposed: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    };

    private getEditorFileName(editor: vscode.TextEditor): string {
        const filePaths = editor.document.fileName.split('/');
        const fileName = filePaths[filePaths.length - 1];
        return fileName;
    }

    private computePageNumber(visibleRanges: readonly vscode.Range[], document: vscode.TextDocument): number {
        let topLine = 0;
        if (visibleRanges.length > 0) {
            topLine = visibleRanges[0].start.line;
        }

        const markdownText = document.getText();
        const lines = markdownText.split(/\r\n|\r|\n/);

        // Count `\page` directives that appear before the top visible line.
        let pageDirectivesBefore = 0;
        const limit = Math.min(topLine, lines.length);
        for (let i = 0; i < limit; i++) {
            if (/^\\page\b/.test(lines[i].trim())) {
                pageDirectivesBefore++;
            }
        }
        // Return 1-based page number: pages are separated by `\page`, so
        // zero directives before means page 1.
        return pageDirectivesBefore + 1;
    }

    private isMarkdownEditor(editor: vscode.TextEditor, showWarning: boolean = true): boolean {
        const languageId: string = editor ? editor.document.languageId.toLowerCase() : "";
        const result = languageId === "markdown";
        if (!result && showWarning) {
            vscode.window.showInformationMessage(constants.ErrorMessages.NOT_MARKDOWN);
        }
        return result;
    }

    private initializeLayout() {
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
    }

    async initMarkdownPreview(viewColumn: number) {
        const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor;
        if (editor && this.isMarkdownEditor(editor)) {
            if (this.panel) {
                // Reuse existing panel.
                this.documentUri = editor.document.uri;
                await this.refresh.call(this);
                this.panel.reveal();
            } else {
                // Create and show a new webview
                this.initializeLayout();
                this.panel = vscode.window.createWebviewPanel(
                    'HomebrewPreview',
                    '[Preview] ' + this.getEditorFileName(editor),
                    viewColumn,
                    {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                    }
                );
                // Set the preview properties
                this.panel.iconPath = this.iconPath;
                this.isDisposed = false;
                this.documentUri = editor.document.uri;

                // And set its HTML content
                await this.refresh.call(this);

                // Register events for refresh
                vscode.workspace.onDidChangeTextDocument(await this.update.bind(this));
                vscode.workspace.onDidChangeConfiguration(await this.refresh.bind(this));
                vscode.workspace.onDidSaveTextDocument(await this.update.bind(this));
                vscode.window.onDidChangeActiveTextEditor(await this.refresh.bind(this));

                // Process editor scroll events
                vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
                    if (this.isMarkdownEditor(textEditor) && getConfig().get('scrollPreviewWithEditor')) {
                        this.postMessage({
                            type: 'scroll',
                            page: this.computePageNumber(visibleRanges, textEditor.document),
                            mode: 'smooth'
                        });
                    }
                });

                // Webview scroll events
                this.panel.webview.onDidReceiveMessage(message => {
                    // Clicking in the webview sends a message { "goToPage", targetPage }
                    if (message.type === 'goToPage') {
                        this.scrollEditorToPage(message.page);
                    }
                });

                // Panel Disposal
                this.panel.onDidDispose(() => {
                    this.isDisposed = true;
                    this.panel = undefined;
                }, null, this.context.subscriptions);
            }
        }
    };

    async update() {
        const editor = vscode.window.activeTextEditor;        
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            this.documentUri = editor.document.uri;
            let currentMarkdownText = editor.document.getText();
            const renderer = new Renderer(this.documentUri, this.context);
            renderer.renderBody(currentMarkdownText).then(updatedBody => {
                this.postMessage({
                    type: 'update',
                    html: updatedBody,
                });
            });
        }
    };

    async refresh() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // FIXME: Switching text causes no Active Text Editor (SUPPRESSED)
            // vscode.window.showWarningMessage(constants.ErrorMessages.NO_ACTIVE_EDITOR);
            return;
        }
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            let currentMarkdownText = editor.document.getText();
            this.panel.title = `[Preview] ${this.getEditorFileName(editor)}`;
            this.documentUri = editor.document.uri;
            const renderer = new Renderer(this.documentUri, this.context);
            renderer.renderHTML(currentMarkdownText, true).then(currentHTMLContent => {
                if (this.panel) {
                    this.panel.webview.html = currentHTMLContent; 
                }
            });
            this.updateZoomLevel();

            // FIXME: Only scroll if active text editor is changed
            if (editor.document.languageId === 'markdown' && getConfig().get('scrollPreviewWithEditor')) {
                this.postMessage({
                    type: 'scroll',
                    page: this.computePageNumber(editor.visibleRanges, editor.document),
                    mode: 'instant'
                });
            }
        }
    }

    private scrollEditorToPage(targetPage: number) {
        // Synchronize Editor scroll with preview.
        // The preview sends a message the page number, and we find it counting the \page instances.

        // Loop on text editors
        for (const editor of vscode.window.visibleTextEditors) {
            if (!this.isPreviewOf(editor.document.uri)) {
                // Ignore all but the one attached to the preview.
                continue;
            }
            const doc = editor.document;
            let targetLine = 1;
            if (targetPage > 1) {
                let count = 1;
                for (let i = 0; i < doc.lineCount; i++) {
                    const lineText = doc.lineAt(i).text.trim();
                    if (lineText.startsWith('\\page')) {
                        count++;
                        if (count === targetPage) {
                            targetLine = i + 1;
                            break;
                        }
                    }
                }
            }
            // vscode.window.showInformationMessage(`Jumping from Page ${targetPage}  to Line ${targetLine}`);
            const pos = new vscode.Position(targetLine, 0);
            const range = new vscode.Range(pos, pos);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
            // Nudge the scroll up to account for sticky lines
            const firstVisibleLine = editor.visibleRanges[0].start.line;
            if (firstVisibleLine > 0) {
                const delta = firstVisibleLine - targetLine;
                // Scroll by delta lines above
                editor.revealRange(
                    new vscode.Range(
                        new vscode.Position(targetLine - delta, 0),
                        new vscode.Position(targetLine - delta, 0)
                    ),
                    vscode.TextEditorRevealType.AtTop
                );
            }
        }
    };

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