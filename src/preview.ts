"use strict";
import * as vscode from 'vscode';
import * as path from 'path';
import Renderer from './renderer';
// import { disposeAll } from './utils/dispose';
import * as constants from './constants';
import { getConfig } from "./utils";
import { getThemeStyles } from './theme';

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
    currentTheme : string = "";
    currentinlineStyles : string = "";
    private documentUri: vscode.Uri | undefined;
    private isDisposed: boolean = false;
    private lastSentPage: number = -1;


    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    };

    private getEditorFileName(editor: vscode.TextEditor): string {
        const filePaths = editor.document.fileName.split('/');
        const fileName = filePaths[filePaths.length - 1];
        return fileName;
    }

    private computePageNumber(visibleRanges: readonly vscode.Range[], document: vscode.TextDocument): number {
        if (visibleRanges.length === 0) {
            return 1;
        }

        // Calculate the middle line of the visible range
        const range = visibleRanges[0];
        const middleLine = Math.floor((range.start.line + range.end.line) / 2);

        const markdownText = document.getText();
        const lines = markdownText.split(/\r\n|\r|\n/);

        // Count `\page` directives that appear before that middle line
        let pageDirectivesBefore = 0;
        const limit = Math.min(middleLine, lines.length);

        for (let i = 0; i < limit; i++) {
            if (/^\\page\b/.test(lines[i].trim())) {
                pageDirectivesBefore++;
            }
        }

        return pageDirectivesBefore + 1;
    }

    private syncPreview(textEditor: vscode.TextEditor, visibleRanges: readonly vscode.Range[]) {
        // Calculate the page based on the range provided
        const currentPage = this.computePageNumber(visibleRanges, textEditor.document);

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
                await this.updatePreview.call(this);
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
                await this.reloadPreview.call(this);

                // Register events for refresh
                vscode.workspace.onDidChangeTextDocument(await this.updatePreview.bind(this));
                vscode.workspace.onDidChangeConfiguration(await this.reloadPreview.bind(this));
                vscode.workspace.onDidSaveTextDocument(await this.updatePreview.bind(this));
                vscode.window.onDidChangeActiveTextEditor(await this.updatePreview.bind(this));

                // Synchronize Editor Scrolling -> Preview
                vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
                    if (this.isMarkdownEditor(textEditor) && getConfig().get('scrollPreviewWithEditor')) {
                        // Pass the visible ranges (the lines physically on screen)
                        this.syncPreview(textEditor, visibleRanges);
                    }
                });

                // Synchronize Editor Click and Cursor Move -> Preview
                vscode.window.onDidChangeTextEditorSelection(({ textEditor, selections }) => {
                    if (this.isMarkdownEditor(textEditor) && getConfig().get('scrollPreviewWithEditor')) {
                        // Create a fake range based on where the cursor (selection) is
                        const cursorRange = new vscode.Range(selections[0].active, selections[0].active);

                        // Pass the cursor's position as the "range" to sync
                        this.syncPreview(textEditor, [cursorRange]);
                    }
                });

                // Synchronize Click Page in Preview -> Editor
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

    async updatePreview() {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isMarkdownEditor(editor, true) && this.panel) {
            this.documentUri = editor.document.uri;
            let currentMarkdownText = editor.document.getText();

            // Getting Metadata and Inline Styles for live refresh if needed.
            const renderer = new Renderer(this.documentUri, this.context);
            let inlineStyles = renderer.getInlineStyles(currentMarkdownText);
            const theme = renderer.getMetadata(currentMarkdownText)?.theme ?? "";

            // Update CSS if needed
            if (this.currentinlineStyles !== inlineStyles) {
                this.postMessage({
                    type: 'updateInlineStyles',
                    inlineStyles: inlineStyles,
                });
                this.currentinlineStyles = inlineStyles ? inlineStyles : "";
            }

            // Update Theme CSS if needed
            if (this.currentTheme !== theme) {
                getThemeStyles(this.context, theme, false).then(themeStyles => {
                this.postMessage({
                    type: 'updateThemeStyles',
                    themeStyles: themeStyles,
                });
                this.currentTheme = theme;
            });
            }

            // Update Body
            renderer.renderBody(currentMarkdownText).then(updatedBody => {
                this.postMessage({
                    type: 'updateBody',
                    html: updatedBody,
                });
            });
        }
    };

    async reloadPreview() {
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
            
            // Set the current CSS and Theme of the preview
            let css = renderer.getInlineStyles(currentMarkdownText);
            let theme = renderer.getMetadata(currentMarkdownText)?.theme;

            this.currentinlineStyles = css ? css : "";
            this.currentTheme = theme ? theme : "";
            renderer.renderHTML(currentMarkdownText, true).then(currentHTMLContent => {
                if (this.panel) {
                    this.panel.webview.html = currentHTMLContent;
                }
            });
            this.updateZoomLevel();

            // FIXME: Only scroll if active text editor is changed
            if (this.isMarkdownEditor(editor, true) && getConfig().get('scrollPreviewWithEditor')) {
                this.postMessage({
                    type: 'scroll',
                    page: this.computePageNumber(editor.visibleRanges, editor.document),
                    mode: 'instant'
                });
            }
        }
    }

    private scrollEditorToPage(targetPage: number) {
        for (const editor of vscode.window.visibleTextEditors) {
            if (!this.isPreviewOf(editor.document.uri)) {
                continue;
            }

            const doc = editor.document;
            let targetLine = 0; // Default to the very top (Page 1)

            if (targetPage > 1) {
                let pagesFound = 1;
                for (let i = 0; i < doc.lineCount; i++) {
                    const lineText = doc.lineAt(i).text.trim();

                    if (/^\\page\b/.test(lineText)) {
                        pagesFound++;
                        if (pagesFound === targetPage) {
                            // We found the delimiter. The content starts on the NEXT line.
                            targetLine = Math.min(i + 1, doc.lineCount - 1);
                            break;
                        }
                    }
                }
            }

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