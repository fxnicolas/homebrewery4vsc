'use strict';
import diceFont from './homebrewery/fonts/iconFonts/diceFont.js';
import elderberryInn from './homebrewery/fonts/iconFonts/elderberryInn.js';
import fontAwesome from './homebrewery/fonts/iconFonts/fontAwesome.js';
import gameIcons from './homebrewery/fonts/iconFonts/gameIcons.js';

import * as vscode from 'vscode';

function cleanIconName(str: string, itemPrefix?: string): string {
    return str
        .replace(new RegExp(`^${itemPrefix}`), '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        )
        .join(' ');
}

function iconFontProviderItems(iconEnum: any, fontName: string, itemPrefix: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    Object.keys(iconEnum).forEach(key => {

        // Strip prefix + convert to dashed
        const snippetName = cleanIconName(key, itemPrefix);

        const item = new vscode.CompletionItem(
            {
                label: `Font Icon: ${snippetName}`,
                description: `Insert ${fontName} Icon`
            },
            vscode.CompletionItemKind.Snippet,
        );

        // item.detail = `Insert the ${ snippetName } icon from the ${ fontName } font (Homebrewery for VS Code)`;

        // What gets inserted
        item.insertText = `:${key}:`;

        // Preview
        item.documentation = new vscode.MarkdownString(`Insert the *${snippetName}* icon from the *${fontName}* font`);

        items.push(item);

    });
    return items;
}

export const iconFontsProvider = vscode.languages.registerCompletionItemProvider(
    { language: 'markdown' }, // or whatever language you target
    {
        provideCompletionItems() {
            const items: vscode.CompletionItem[] = [];
            items.push(...iconFontProviderItems(fontAwesome, 'Font Awesome', "fas_"));
            items.push(...iconFontProviderItems(elderberryInn, 'Elderberry Inn', "ei_"));
            items.push(...iconFontProviderItems(diceFont, "Dice Font", "df_"));
            items.push(...iconFontProviderItems(gameIcons, "Games Icons", "gi_"));
            return items;
        }
    });
