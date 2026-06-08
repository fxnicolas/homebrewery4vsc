import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { getConfig } from '../utils';

import { raceTooltipFormat, raceFormat, raceQuery, raceSuggestionsQuery } from './types/races';
import { spellTooltipFormat, spellFormat, spellQuery, spellSuggestionsQuery } from './types/spells';
import { magicItemTooltipFormat, magicItemFormat, magicItemQuery, magicItemSuggestionsQuery } from './types/magicItems';
import { featTooltipFormat, featFormat, featQuery, featSuggestionsQuery } from './types/feats';
import { monsterTooltipFormat, monsterFormat, monsterQuery, monsterSuggestionsQuery } from './types/monsters';
import { subRaceTooltipFormat, subRaceFormat, subRaceQuery, subRaceSuggestionsQuery } from './types/subraces';
import { classTooltipFormat, classFormat, classQuery, classSuggestionsQuery } from './types/classes';
import { subClassTooltipFormat, subClassFormat, subClassQuery, subClassSuggestionsQuery } from './types/subclasses';

const API_URL = "https://www.dnd5eapi.co";

const GRAPHQL_MAP = {
    'classes': classQuery,
    'feats': featQuery,
    'magicItems': magicItemQuery,
    'monsters': monsterQuery,
    'races': raceQuery,
    'spells': spellQuery,
    'subraces': subRaceQuery,
    'subclasses': subClassQuery
}

const OUTPUT_MAP = {
    'monsters': monsterFormat,
    'spells': spellFormat,
    'feats': featFormat,
    'magicItems': magicItemFormat,
    'races': raceFormat,
    'subraces': subRaceFormat,
    'classes': classFormat,
    'subclasses': subClassFormat
}

const TOOLTIP_MAP = {
    'monsters': monsterTooltipFormat,
    'spells': spellTooltipFormat,
    'feats': featTooltipFormat,
    'magicItems': magicItemTooltipFormat,
    'races': raceTooltipFormat,
    'subraces': subRaceTooltipFormat,
    'classes': classTooltipFormat,
    'subclasses': subClassTooltipFormat
}

const SUGGESTIONS_MAP = {
    'classes': classSuggestionsQuery,
    'feats': featSuggestionsQuery,
    'magicItems': magicItemSuggestionsQuery,
    'monsters': monsterSuggestionsQuery,
    'races': raceSuggestionsQuery,
    'spells': spellSuggestionsQuery,
    'subraces': subRaceSuggestionsQuery,
    'subclasses': subClassSuggestionsQuery
};

const TYPES_MAP = {
    'races': "Races",
    'subraces': "Sub-Races",
    'classes': "Classes",
    'subclasses': "Sub-Classes",
    'monsters': "Monsters",
    'spells': "Spells",
    'magicItems': "Magic Items",
    // 'feats': "Feats",
}

export class SrdClient {
    public apiUrl: string | undefined;
    private loggerChannel: vscode.LogOutputChannel;

    constructor(loggerChannel: vscode.LogOutputChannel) {
        this.apiUrl = "https://www.dnd5eapi.co";
        this.loggerChannel = loggerChannel;

    };

    public async getSrdNodeContent(url: vscode.Uri): Promise<string> {
        const type = path.basename(path.dirname(url.path));
        const index = path.basename(url.path); // 'c'
        const config = getConfig();
        const language = config.get<string>('SRDLanguage') || "en";

        if (!type || !(type in GRAPHQL_MAP)) {
            this.loggerChannel.error(`SRD Client: Unable to retreive SRD item. Unknown type: ${type}.`);
            return "";
        }
        try {
            this.loggerChannel.debug(`SRD Client: Retreiving SRD item content ${url}: ${type} > ${index}`);
            const response = await axios.post(`${this.apiUrl}/graphql`, {
                query: GRAPHQL_MAP[type as keyof typeof GRAPHQL_MAP],
                variables: { index: index, lang: language }
            });
            const output = OUTPUT_MAP[type as keyof typeof OUTPUT_MAP](response.data, API_URL);
            const content = output ? output : "";
            return content;

        } catch (err) {
            this.loggerChannel.error(`SRD Client: Unable to retreive SRD item. Failed to fetch ${url}: ${err}`);
            return "";
        }
    }

    public async getChildSrdNodes(element: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        const type = element.id;
        const config = getConfig();
        const language = config.get<string>('SRDLanguage') || "en";

        if (!type || !(type in SUGGESTIONS_MAP)) {
            this.loggerChannel.error(`SRD Client: Unable to list SRD items. Unknown type: ${type}`);
            return [];
        }
        try {
            this.loggerChannel.debug(`SRD Client: Listing SRD items from ${element.resourceUri}`);
            const response = await axios.post(`${this.apiUrl}/graphql?lang=fr`, {
                query: SUGGESTIONS_MAP[type as keyof typeof SUGGESTIONS_MAP],
                variables: { limit: 500, lang: language }
            });

            const tooltipFormat = TOOLTIP_MAP[type as keyof typeof TOOLTIP_MAP]
            const items: { index: string; name: string }[] = response.data.data[type];
            return items.map(item =>
                this.createNode(item.index, item.name, `api/2014/${type}/${item.index}`, vscode.TreeItemCollapsibleState.None, undefined, tooltipFormat(item))
            );
        } catch (err) {
            this.loggerChannel.error(`SRD Client: Unable to list SRD items. Failed to fetch ${element.resourceUri}: ${err}`);
            return [];
        }
    }

    private createNode(id: string, label: string, url: string, collapsible: vscode.TreeItemCollapsibleState, relativeIconPath?: string, tooltip?: string): vscode.TreeItem {
        this.loggerChannel.warn(relativeIconPath ? relativeIconPath : "No Icon Specified");
        const treeItem = new vscode.TreeItem(label, collapsible);
        treeItem.resourceUri = vscode.Uri.parse(`${this.apiUrl}${url}`);
        treeItem.tooltip = new vscode.MarkdownString(tooltip);
        treeItem.id = id;
        if (relativeIconPath) {
            treeItem.iconPath = {
                light: vscode.Uri.file(path.join(__dirname, relativeIconPath)),
                dark: vscode.Uri.file(path.join(__dirname, relativeIconPath.replace(".svg", "_dark.svg"))),
            };
        }

        if (collapsible === vscode.TreeItemCollapsibleState.None) {
            treeItem.command = {
                command: 'homebrewery4vsc.insertSrdContent',
                title: 'Insert',
                arguments: [`${this.apiUrl}${url}`]
            };
        }

        return treeItem;
    }

    public async getSrdRootNodes(): Promise<vscode.TreeItem[]> {
        return Object.entries(TYPES_MAP).map(([key, label]) =>
            this.createNode(key, label, `api/2014/${key}`, vscode.TreeItemCollapsibleState.Collapsed, `../media/icons/dnd-icons/${key}.svg`, '**Expand** to see more...')
        );
    }


}
