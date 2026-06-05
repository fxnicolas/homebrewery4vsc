import dedent from 'dedent';
import _ from 'lodash';


const subRaceQuery = `query Subrace($index: String!) {
  subrace(index: $index) {
    name
    desc
    racial_traits {
      name
      desc
    }
    ability_bonuses {
      bonus
      ability_score {
        full_name
      }
    }
    race {
      name
    }
  }
}`;

const subRaceSuggestionsQuery = `query Races {
	subraces {
      index
      name
    }
  }`;


const subRaceFormat = function(responseData) {

  if(!responseData?.data?.subrace) return;
  const data = responseData.data.subrace;
  if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

  const subRaceDefaults = {
  };

  _.defaultsDeep(data, subRaceDefaults);

  const output = dedent`
  #### ${data.name}
  ${data.race.name ? `*${data.race.name} variant*\n:\n` : ''}

  ${data.desc}\n\n
  ${data.racial_traits.map((trait)=>{
    return `***${trait.name}***. ${trait.desc}`
  }).join('\n\n')}

  ${data.srdAttrib ? `\n:\n{{descriptive\n${data.srdAttrib}\n}}` : ''}
  `
  return output;

}

export { subRaceFormat, subRaceQuery, subRaceSuggestionsQuery }