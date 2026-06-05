import * as vscode from 'vscode';
import { SrdClient } from './srd-client';

export class SrdNodeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {

    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> = this._onDidChangeTreeData.event;
    private srdClient: SrdClient;
    private loggerChannel = vscode.window.createOutputChannel('Homebrewery for VS Code', { log: true });

    constructor() {
        this.srdClient = new SrdClient(this.loggerChannel);
        // Capturing settings changes
        vscode.workspace.onDidChangeConfiguration((e) => {
            // Refresh the tree
            this.refresh();

        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (element) {
            return Promise.resolve(this.srdClient.getChildSrdNodes(element));
        } else {
            return Promise.resolve(this.srdClient.getSrdRootNodes());
        }
    }

    async getSrdContent(url: vscode.Uri): Promise <string> {
        return Promise.resolve(this.srdClient.getSrdNodeContent(url));
    }

}

