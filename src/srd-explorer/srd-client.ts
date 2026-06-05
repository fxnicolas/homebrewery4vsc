import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';

import { raceFormat, raceQuery, raceSuggestionsQuery } from './types/races';
import { spellFormat, spellQuery, spellSuggestionsQuery } from './types/spells';
import { magicItemFormat, magicItemQuery, magicItemSuggestionsQuery } from './types/magicItems';
import { featFormat, featQuery, featSuggestionsQuery } from './types/feats';
import { monsterFormat, monsterQuery, monsterSuggestionsQuery } from './types/monsters';
import { subRaceFormat, subRaceQuery, subRaceSuggestionsQuery } from './types/subraces';
import { classFormat, classQuery, classSuggestionsQuery } from './types/classes';
import { subClassFormat, subClassQuery, subClassSuggestionsQuery } from './types/subclasses';

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
    'classes': "Classes",
    'feats': "Feats",
    'magicItems': "Magic Items",
    'monsters': "Monsters",
    'races': "Races",
    'spells': "Spells",
    'subraces': "Sub-Races",
    'subclasses': "Sub-Classes"
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
        
        if (!type || !(type in GRAPHQL_MAP)) {
            this.loggerChannel.error(`Unknown type: ${type}`);
            return "";
        }
        try {
            this.loggerChannel.info(`Getting Content for ${url}: ${type} > ${index}`);
            const response = await axios.post(`${this.apiUrl}/graphql`, {
                query: GRAPHQL_MAP[type as keyof typeof GRAPHQL_MAP],
                variables: { index: index }
            });
            const output = OUTPUT_MAP[type as keyof typeof OUTPUT_MAP](response.data, API_URL);
            const content = output ? output : "";
            return content;

        } catch (err) {
            this.loggerChannel.error(`Failed to fetch ${url}: ${err}`);
            return "";
        }
    }

    public async getChildSrdNodes(element: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        const type = element.id;
        if (!type || !(type in SUGGESTIONS_MAP)) {
            this.loggerChannel.error(`Unknown type: ${type}`);
            return [];
        }
        try {
            this.loggerChannel.info(`Getting List for ${element.resourceUri}`);
            const response = await axios.post(`${this.apiUrl}/graphql?lang=fr`, {
                query: SUGGESTIONS_MAP[type as keyof typeof SUGGESTIONS_MAP],
                variables: { limit: 500 }
            });

            const items: { index: string; name: string }[] = response.data.data[type];
            return items.map(item =>
                this.createNode(item.index, item.name, `api/2014/${type}/${item.index}`, vscode.TreeItemCollapsibleState.None)
            );
        } catch (err) {
            this.loggerChannel.error(`Failed to fetch ${element.resourceUri}: ${err}`);
            return [];
        }
    }

    private createNode(id: string, label: string, url: string, collapsible: vscode.TreeItemCollapsibleState): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(label, collapsible);
        treeItem.resourceUri = vscode.Uri.parse(`${this.apiUrl}${url}`);
        treeItem.id = id;

        if (collapsible === vscode.TreeItemCollapsibleState.None) {
            treeItem.command = {
                command: 'homebrewery4vsc.insertSrdContent',
                title: 'Insert',
                arguments: [`${this.apiUrl}${url}`]
            };
            treeItem.tooltip = "Click to insert SRD Content";
        }

        return treeItem;
    }

    public async getSrdRootNodes(): Promise<vscode.TreeItem[]> {
        return Object.entries(TYPES_MAP).map(([key, label]) =>
            this.createNode(key, label, `api/2014/${key}`, vscode.TreeItemCollapsibleState.Collapsed)
        );
    }


}
