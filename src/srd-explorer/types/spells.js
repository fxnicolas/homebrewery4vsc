import dedent from 'dedent';
import _ from 'lodash';


const spellQuery = `query Spell ($index: String!) {
  spell(index: $index) {
    name
    level
    school {
      index
      name
    }
    casting_time
    range
    components
    duration
    desc
    higher_level
  }
}`;

const spellSuggestionsQuery = `query Races {
	spells {
	  index
	  name
	}
  }`;

const spellFormat = function(responseData) {

	const data = responseData.data.spell;
	if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

	const spellDefaults = {
		name: 'Unnamed Spell',
		desc: [],
		higher_level : [],
		range: 'range',
		components: [],
		material : 'unknown material',
		ritual: false,
		duration: 'unknown',
		concentration: false,
		casting_time: 'unknown',
		level: 10,
		school: { name: '' },

	};

	const numWithSuffix = function(n) {
		const suffixMap = {
			1 : 'st',
			2 : 'nd',
			3 : 'rd'
		};

		return `${n}${suffixMap[n] || 'th'}`;
	};

	_.defaultsDeep(data, spellDefaults);

	const output = dedent`
	#### ${data.name}
	*${data.level == 0 ? `${data.school.name} Cantrip` : `${numWithSuffix(data.level)}-level ${data.school.index}`}*  
	**Casting Time:** ${data.casting_time}  
	**Range:** ${data.range}  
	**Components:** ${data.components.length ? data.components.map((component)=>{ return component; }).join(', ') : 'None'}  
	**Duration:** ${data.duration}
	:
	${data.desc.map((line)=>{ return line;}).join('  \n')}  
	${data.higher_level?.length ? 
	`**At Higher Levels:** ${data.higher_level.map((upcast)=>{return upcast;}).join('  \n')}`
	: ''
	}
	${data.srdAttrib ? `\n:\n{{descriptive\n${data.srdAttrib}\n}}` : ''}
`
	return output;

}

export { spellFormat, spellQuery, spellSuggestionsQuery }