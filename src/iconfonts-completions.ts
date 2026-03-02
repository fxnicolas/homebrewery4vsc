'use strict';
import diceFont from './homebrewery/themes/fonts/iconFonts/diceFont.js';
import elderberryInn from './homebrewery/themes/fonts/iconFonts/elderberryInn.js';
import fontAwesome from './homebrewery/themes/fonts/iconFonts/fontAwesome.js';
import gameIcons from './homebrewery/themes/fonts/iconFonts/gameIcons.js';

import { iconFontProviderCompletionsTexts } from './constants';
import { formatString } from "./utils";
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
                label: formatString(iconFontProviderCompletionsTexts.LABEL_PATTERN, {snippetName}),
                description: formatString(iconFontProviderCompletionsTexts.DESCRIPTION_PATTERN, {fontName})
            },
            vscode.CompletionItemKind.Snippet,
        );

        // What gets inserted
        item.insertText = `:${key}:`;

        // Preview
        item.documentation = new vscode.MarkdownString(formatString(iconFontProviderCompletionsTexts.DOCUMENTATION_PATTERN, {snippetName, fontName}));

        items.push(item);

    });
    return items;
}

/**
 * Generates completion items for all available icon fonts.
 * 
 * Aggregates completion items from multiple icon font sources including
 * Font Awesome, Elderberry Inn, Dice Font, and Games Icons.
 * 
 * @returns {vscode.CompletionItem[]} Array of completion items for all icon fonts
 */
export function allIconFontsCompletionItems() {
    const items : vscode.CompletionItem[] = [];
    items.push(...iconFontProviderItems(fontAwesome, 'Font Awesome', "fa._"));
    items.push(...iconFontProviderItems(elderberryInn, 'Elderberry Inn', "ei_"));
    items.push(...iconFontProviderItems(diceFont, "Dice Font", "df_"));
    items.push(...iconFontProviderItems(gameIcons, "Games Icons", "gi_"));
    return items;
};
