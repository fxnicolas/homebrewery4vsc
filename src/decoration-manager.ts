import * as vscode from 'vscode';
import { getConfig } from './utils';

export class DecorationManager {

    private pageDecoration: vscode.TextEditorDecorationType;
    private columnDecoration: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timeout | undefined;

    constructor(private context: vscode.ExtensionContext) {

        this.pageDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editor.findMatchBackground'),
            color: new vscode.ThemeColor('editor.foreground')
        });

        this.columnDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
            color: new vscode.ThemeColor('editor.foreground')
        });

        this.registerEvents();

        // initial update
        this.updateDecorations(vscode.window.activeTextEditor);
    }

    private registerEvents() {

        this.context.subscriptions.push(

            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.triggerUpdate(editor);
            }),

            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;

                if (editor && event.document === editor.document) {
                    this.triggerUpdate(editor);
                }
            }),

            vscode.workspace.onDidOpenTextDocument(doc => {
                const editor = vscode.window.activeTextEditor;

                if (editor && editor.document === doc) {
                    this.triggerUpdate(editor);
                }
            })
        );
    }

    private triggerUpdate(editor: vscode.TextEditor | undefined) {

        if (this.timeout) {
            clearTimeout(this.timeout);
        }

        this.timeout = setTimeout(() => {
            this.updateDecorations(editor);
        }, 150); // debounce
    }

    private updateDecorations(editor: vscode.TextEditor | undefined) {
        const config = getConfig();
        const enabled = config.get<boolean>('highlightColumnAndPageBreaks');
        if (enabled && editor && editor.document.languageId === "markdown") {

            const pageRanges: vscode.Range[] = [];
            const columnRanges: vscode.Range[] = [];

            const pageRegex = /^\s*\\page\b/;
            const columnRegex = /^\s*\\column\b/;

            const lineCount = editor.document.lineCount;

            for (let i = 0; i < lineCount; i++) {

                const line = editor.document.lineAt(i).text;

                if (pageRegex.test(line)) {
                    pageRanges.push(new vscode.Range(i, 0, i, 0));
                }

                if (columnRegex.test(line)) {
                    columnRanges.push(new vscode.Range(i, 0, i, 0));
                }
            }

            editor.setDecorations(this.pageDecoration, pageRanges);
            editor.setDecorations(this.columnDecoration, columnRanges);
        }
    }

}