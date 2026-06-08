import dedent from 'dedent';
import _ from 'lodash';

const magicItemQuery = `query MagicItemQuery($index: String!, $lang: String = "en" ) {
  magicItem(index: $index, lang: $lang) {
    name
    desc
    image
  }
}`;

const magicItemSuggestionsQuery = `query MagicItems($limit: Int!, $lang: String = "en") {
  magicItems(limit: $limit, lang: $lang) {
    index
	name
	desc
	image
  }
}`;

const magicItemTooltipFormat = function (data, url) {
	const output = dedent`
    ### ${data.name}

	${data.desc.map((line) => { return line; }).join('  \n')} 

	${data.image ? `<img src="${url}${data.image}" alt="${data.name}" width="250" />` : ''}

  `
	return output;
}

const magicItemFormat = function(responseData, url) {

	if(!responseData?.data?.magicItem) return;
	const data = responseData.data.magicItem;
	if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

	const magicItemDefaults = {
		name: 'Unnamed Magic Item',
		desc: [],
	};

	_.defaultsDeep(data, magicItemDefaults);

	const output = dedent`
	#### ${data.name}
	${data.desc.map((line, index)=>{ 
		const prevLine = index > 0 ? data.desc[index - 1] : ''
		// const nextLine = index + 1 < data.desc.length ? data.desc[index + 1] : ''

		if(index == 0) return `*${line}*\n\n:\n`;
		if(line.match(/\(table\)/i)) return `###### ${line}\n`
		if(line.slice(0, 1) == '|' && line.slice(-1) == '|') return line;
		if(prevLine.slice(0, 1) == '|' && line.slice(0, 1) != '|' ) return `\n${line}\n`
		return `${line}\n`;
	}).join('\n')}
	:
	${data.image ? `![image](${url}${data.image}){width:100%}` : ''}
	${data.srdAttrib ? `\n:\n{{descriptive\n${data.srdAttrib}\n}}` : ''}

`
	return output;

}

export { magicItemTooltipFormat, magicItemFormat, magicItemQuery, magicItemSuggestionsQuery }