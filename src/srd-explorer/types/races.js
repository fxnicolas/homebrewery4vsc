import dedent from 'dedent';
import _ from 'lodash';


const raceQuery = `query Race($index: String!) {
  race(index: $index) {
    name
    ability_bonuses {
      ability_score {
        full_name
      }
      bonus
    }
    age
    alignment
    size_description
    speed
    language_desc
    traits {
      index
      name
      desc
    }
  }
}`;

const raceSuggestionsQuery = `query Races {
	races {
	  index
	  name
	}
  }`;

const raceFormat = function(responseData) {

	if(!responseData?.data?.race) return;
	const data = responseData.data.race;
	if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

	const raceDefaults = {
	};

	_.defaultsDeep(data, raceDefaults);

	const output = dedent`
	## ${data.name}

	### ${data.name} Traits

	${data.ability_bonuses.length ? `***Ability Score Increase.*** ${data.ability_bonuses.sort((a, b)=>{return b.bonus - a.bonus;}).map((ability, index)=>{return `${data.ability_bonuses.length > 1 && index == data.ability_bonuses.length - 1 ? 'and ' : ''}${index == 0 ? 'Your' : 'your'} ${ability.ability_score.full_name} score increases by ${ability.bonus}`;}).join(', ')}.  \n` : '' }
	${data.age ? `***Age.*** ${data.age}  \n` : '' }
	${data.alignment ? `***Alignment.*** ${data.alignment}  \n` : '' }
	${data.size_description ? `***Size.*** ${data.size_description}  \n` : ''}
	${data.speed ? `***Speed.*** Your base walking speed is ${data.speed} feet.  \n` : ''}

	${data.traits.length ? data.traits.map((trait)=>{return `***${trait.name}.*** ${trait.desc.join('\n')}\n`}).join('\n') : ''}
	${data.language_desc ? `***Languages.*** ${data.language_desc}\n\n` : '' }
	${data.srdAttrib ? `\n:\n{{descriptive\n${data.srdAttrib}\n}}` : ''}
`
	return output;

}

export { raceFormat, raceQuery, raceSuggestionsQuery }