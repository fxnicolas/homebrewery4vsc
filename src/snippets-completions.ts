'use strict';

import { formatString } from "./utils";
import * as vscode from 'vscode';
import * as yaml from "js-yaml";
import { snippetProviderCompletionTexts } from "./constants";

export interface Snippet {
    name: string;
    gen: string;
}

export interface SnippetsBlock {
    name: string;
    subsnippets?: Snippet[];
}

/* Return the completion items for the snippets specified in the metadata fenced block */
export function snippetsProviderItems(snippetsBlocks: SnippetsBlock[]): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    if (snippetsBlocks) {
        snippetsBlocks.forEach(snippetsBlock => {
            const prefix = snippetsBlock.name;
            const snippets = snippetsBlock.subsnippets;

            if (snippets) {
                snippets.forEach(snippet => {

                    const item = new vscode.CompletionItem(
                        {
                            label: formatString(snippetProviderCompletionTexts.LABEL_PATTERN, { prefix: prefix, name: snippet.name }),
                            description: formatString(snippetProviderCompletionTexts.DESCRIPTION_PATTERN, { name: snippet.name })
                        },
                        vscode.CompletionItemKind.Snippet,
                    );

                    // What gets inserted
                    item.insertText = snippet.gen;

                    // Preview
                    item.documentation = new vscode.MarkdownString(formatString(snippetProviderCompletionTexts.DOCUMENTATION_PATTERN, { name: snippet.name }));
                    console.log(`Adding snippet` + item.label);
                    items.push(item);
                });
            }
        });
    }
    return items;
}
