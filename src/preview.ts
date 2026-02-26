"use strict";
import * as vscode from 'vscode';
import * as constants from './constants';
import * as fs from 'fs';
import * as path from 'path';
import { renderHTML } from './renderer';
// import { disposeAll } from './utils/dispose';
import { EXTENSION_ID } from './constants';


// const output = vscode.window.createOutputChannel(EXTENSION_ID);
// output.appendLine('Extension ready!');

export const enum LayoutSpread {
    Simple = "simple",
    Facing = "facing",
    Flow = "flow"
};

function getConfig() {
    return vscode.workspace.getConfiguration(EXTENSION_ID);
}

function computePageNumber(visibleRanges: readonly vscode.Range[], document: vscode.TextDocument): number {
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

export default class Preview {

    panel: vscode.WebviewPanel | undefined;
    editor: any;
    line: number | undefined;
    currentLayoutSpread: LayoutSpread = LayoutSpread.Simple;
    currentZoom: number = 100;
    // disableWebViewStyling: boolean;
    context: vscode.ExtensionContext;
    private _resource: vscode.Uri | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private _disposed: boolean = false;
    private readonly _onDisposeEmitter = new vscode.EventEmitter<void>();
    public readonly onDispose = this._onDisposeEmitter.event;
    private readonly _onDidChangeViewStateEmitter = new vscode.EventEmitter<vscode.WebviewPanelOnDidChangeViewStateEvent>();

    //returns true if an html document is open
    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    };

    async handleTextDocumentChange() {
        if (vscode.window.activeTextEditor && this.checkDocumentIsMarkdown(true) && this.panel && this.panel !== undefined) {
            let currentMarkdownText = vscode.window.activeTextEditor.document.getText();
            const filePaths = vscode.window.activeTextEditor.document.fileName.split('/');
            const fileName = filePaths[filePaths.length - 1];
            this.panel.title = `[Preview] ${fileName}`;
            let currentHTMLContent = renderHTML(currentMarkdownText, this.context, true);
            this._resource = vscode.window.activeTextEditor.document.uri;
            this.panel.webview.html = currentHTMLContent;
            this.updateZoomLevel();
            if (vscode.window.activeTextEditor.document.languageId === 'markdown' && getConfig().get('scrollPreviewWithEditor')) {
                this.postMessage({
                    type: 'scroll',
                    page: computePageNumber(vscode.window.activeTextEditor.visibleRanges, vscode.window.activeTextEditor.document),
                    mode: 'instant'
                });
            }
        }
    }

    /*
    getWebviewContent(html: string, fileName: string) {
         const filePaths = fileName.split('/');
        fileName = filePaths[filePaths.length - 1];
        const reg = /<img src\s*=\s*"(.+?)"/g;
        var m;
        do {
            m = reg.exec(html);
            if (m) {
                let imagePath = m[1].split('/');
                let imageName = imagePath[imagePath.length - 1];
                let vsCodeImagePath = this.getDynamicContentPath(imageName);
                if (vsCodeImagePath) {
                    html = html?.replace(m[0], m[0].replace(m[1], vsCodeImagePath.toString()));
                }
            }
        } while (m);
        return renderHTML(html, this.context)
    }
         */

    getDynamicContentPath(filepath: string) {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return filepath;
        }
        const onDiskPath = vscode.Uri.file(path.join(rootPath, 'content/media', filepath));
        if (this.panel) {
            const styleSrc = this.panel.webview.asWebviewUri(onDiskPath);
            return styleSrc;
        }
    }

    getDocumentType(): string {
        if (vscode.window.activeTextEditor) {
            let languageId = vscode.window.activeTextEditor.document.languageId.toLowerCase();
            return languageId;
        } else { return ""; }
    }

    checkDocumentIsMarkdown(showWarning: boolean): boolean {
        let result = this.getDocumentType() === "markdown";
        if (!result && showWarning) {
            vscode.window.showInformationMessage(constants.NO_MARKDOWN);
        }
        return result;
    }

    async initMarkdownPreview(viewColumn: number) {
        let proceed = this.checkDocumentIsMarkdown(true);
        if (vscode.window.activeTextEditor && proceed) {
            const filePaths = vscode.window.activeTextEditor.document.fileName.split('/');
            const fileName = filePaths[filePaths.length - 1];
            // Setting the Page layout
            this.currentLayoutSpread = LayoutSpread.Simple;
            vscode.commands.executeCommand(
                'setContext',
                'homebrewery.currentLayoutSpread',
                this.currentLayoutSpread
            );
            this.currentZoom = 100;
            vscode.commands.executeCommand(
                'setContext',
                'homebrewery.currentZoom',
                this.currentZoom
            );

            // Create and show a new webview
            this.panel = vscode.window.createWebviewPanel(
                'HomebrewPreview',
                '[Preview] ' + fileName,
                viewColumn,
                {
                    // Enable scripts in the webview
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    // And restrict the webview to only loading content from our extension's `assets` directory.
                    // localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'assets')), vscode.Uri.file(path.join(vscode.workspace.rootPath, 'content/media'))]
                    // localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'assets'))]
                }
            );
            this.panel.iconPath = this.iconPath;
            this._disposed = false;

            // And set its HTML content
            this.editor = vscode.window.activeTextEditor;
            await this.handleTextDocumentChange.call(this);

            vscode.workspace.onDidChangeTextDocument(await this.handleTextDocumentChange.bind(this));
            vscode.workspace.onDidChangeConfiguration(await this.handleTextDocumentChange.bind(this));
            vscode.workspace.onDidSaveTextDocument(await this.handleTextDocumentChange.bind(this));
            vscode.window.onDidChangeActiveTextEditor(await this.handleTextDocumentChange.bind(this));

            vscode.window.onDidChangeTextEditorVisibleRanges(({ textEditor, visibleRanges }) => {
                if (textEditor.document.languageId === 'markdown' && getConfig().get('scrollPreviewWithEditor')) {
                    this.postMessage({
                        type: 'scroll',
                        page: computePageNumber(visibleRanges, textEditor.document),
                        mode: 'smooth'
                    });
                }
            });

            // Process incoming messages from the webview.
            this.panel.webview.onDidReceiveMessage(message => {
                // Clicking in the webview sends a message { "goToPage", targetPage }
                if (message.type === 'goToPage') {
                    this.scrollEditorToPage(message.page);
                }
            });

            this.panel.onDidDispose(() => {
                this.dispose();
            }, null, this.disposables);
        }
    };

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
            targetPage --;
            let targetLine = 0;
            if (targetPage > 0) {
                let count = 0;
                for (let i = 0; i < doc.lineCount; i++) {
                    const lineText = doc.lineAt(i).text.trim();
                    if (lineText.startsWith('\\page')) {
                        count++;
                        if (count === targetPage) {
                            targetLine = i;
                            break;
                        }
                    }
                }
            }
            targetLine ++;
            const pos = new vscode.Position(targetLine, 0);
            const range = new vscode.Range(pos, pos);
            editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
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
        if (this._resource) {
            return (this._resource.fsPath === resource.fsPath);
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
        if (this.panel && !this._disposed) {
            this.panel.webview.postMessage(msg);
        }
    }

    private disposeAll(disposables: vscode.Disposable[]) {
        while (disposables.length) {
            const item = disposables.pop();
            if (item) {
                item.dispose();
            }
        }
    }

    public dispose() {
        if (this._disposed) {
            return;
        }

        this._disposed = true;
        this._onDisposeEmitter.fire();

        this._onDisposeEmitter.dispose();
        if (this.panel) {
            this.panel.dispose();
        }

        this.disposeAll(this.disposables);
    }
}