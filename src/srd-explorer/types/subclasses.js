import dedent from 'dedent';
import _ from 'lodash';


const subClassQuery = `query SubClassQuery($index: String!) {
  subclass(index: $index) {
    name
    subclass_flavor
    class {
      name
    }
    desc
    subclass_levels {
      features {
        name
        desc
      }
      level
    }
    spells {
      spell {
        name
        level
        desc
        components
        attack_type
        casting_time
        ritual
        school {
          name
        }
        higher_level
        concentration
        range
        duration
        material
      }
    }
  }
}`;

const subClassSuggestionsQuery = `query Races {
	subclasses {
      index
      name
    }
  }`;


const subClassFormat = function(responseData) {

  if(!responseData?.data?.subclass) return;
  const data = responseData.data.subclass;
  if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

  const subClassDefaults = {
  };

  const numWithSuffix = function(n) {
		const suffixMap = {
			1 : 'st',
			2 : 'nd',
			3 : 'rd'
		};

		return `${n}${suffixMap[n] || 'th'}`;
	};

  _.defaultsDeep(data, subClassDefaults);

  const output = dedent`
  ## ${data.name} ${data.class.name}
  *${data.subclass_flavor}*

  :

  ${data.desc}

  :

  ${data.subclass_levels
    .sort((a,b)=>{return a.level > b.level;})
    .map((level)=>{return dedent`
      {{
      ### Level ${level.level}
      ${level.features.map((feature)=>{return dedent`
        #### ${feature.name}
        ${feature.desc.join('\n\n')}
      `;}).join('\n\n')}
      }}
    `;})
    .join('\n:\n')}

  ${data.spells ? dedent`
    \page
    
    ## Spells
    :

    ${data.spells.map((spell)=>{return dedent`
      {{
      ### ${spell.spell.name}
      *${numWithSuffix(spell.spell.level)} level ${spell.spell.school.name}*
      :
      **Casting Time:** :: ${spell.spell.casting_time}
      **Range:** :: ${spell.spell.range}
      **Components:** :: ${spell.spell.components}
      **Duration:** :: ${spell.spell.concentration ? `Concentration, ${spell.spell.duration.toLowerCase()}` : spell.spell.duration}
      :
      ${spell.spell.desc.join('  \n')}
      ${spell.spell.higher_level ? `\n**At Higher Levels.** ${spell.spell.higher_level}` : ''}
      }}
      `;}).join('\n\n:\n\n')}
    `
    : ''}

  ${data.srdAttrib ? `\n:\n{{descriptive\n${data.srdAttrib}\n}}` : ''}
  `
  return output;

}

export { subClassFormat, subClassQuery, subClassSuggestionsQuery }