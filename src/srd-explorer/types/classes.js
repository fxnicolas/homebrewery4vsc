import dedent from 'dedent';
import _ from 'lodash';


const classQuery = `query Class ($index: String! ) {
  class(index: $index) {
    name
    hit_die
    class_levels {
      level
      prof_bonus
      spellcasting {
        cantrips_known
        spell_slots_level_1
        spell_slots_level_2
        spell_slots_level_3
        spell_slots_level_4
        spell_slots_level_5
        spell_slots_level_6
        spell_slots_level_7
        spell_slots_level_8
        spell_slots_level_9
        spells_known
      }
      features {
        name
        desc
      }
      class_specific {
        action_surges
        arcane_recovery_levels
        aura_range
        bardic_inspiration_die
        brutal_critical_dice
        channel_divinity_charges
        creating_spell_slots {
          sorcery_point_cost
          spell_slot_level
        }
        destroy_undead_cr
        extra_attacks
        favored_enemies
        favored_terrain
        indomitable_uses
        invocations_known
        ki_points
        magical_secrets_max_5
        magical_secrets_max_7
        magical_secrets_max_9
        martial_arts {
          dice_count
          dice_value
        }
        metamagic_known
        mystic_arcanum_level_6
        mystic_arcanum_level_7
        mystic_arcanum_level_8
        mystic_arcanum_level_9
        rage_count
        rage_damage_bonus
        sneak_attack {
          dice_count
          dice_value
        }
        song_of_rest_die
        sorcery_points
        unarmored_movement
        wild_shape_fly
        wild_shape_max_cr
        wild_shape_swim
      }
      subclass {
        name
      }
    }
    proficiencies {
      name
      type
      reference {
        ... on AbilityScore {
          full_name
        }
      }
    }
    starting_equipment_options {
      desc
    }
    starting_equipment {
      equipment {
        ... on Armor {
          name
          desc
        }
        ... on Weapon {
          name
          desc
        }
        ... on Tool {
          name
          desc
        }
        ... on Gear {
          name
          desc
        }
        ... on Pack {
          name
          desc
        }
        ... on Ammunition {
          name
          desc
        }
        ... on Vehicle {
          name
          desc
        }
      }
      quantity
    }
    proficiency_choices {
      desc
    }
  }
}`;

const classSuggestionsQuery = `query Classes {
	classes {
	  index
    name
	}
}`;

const classSpecificFeatData = {
  "action_surges": {title: 'Action Surges'},
  "arcane_recovery_levels": {title: 'Arcane Recovery Levels'},
  "aura_range": {title: 'Aura Range', suffix: 'ft'},
  "bardic_inspiration_die": {title: 'Bardic Inspiration Die', prefix: '1d'},
  "brutal_critical_dice": {title: 'Brutal Critical Die', prefix: '1d'},
  "channel_divinity_charges": {title: 'Channel Divinity Charges'},
  "destroy_undead_cr": {title: 'Destroy Undead CR'},
  "extra_attacks": {title: 'Extra Attacks'},
  "favored_enemies": {title: 'Favored Enemies'},
  "favored_terrain": {title: 'Favored Terrain'},
  "indomitable_uses": {title: 'Indomitable Uses'},
  "invocations_known": {title: 'Invocations Known'},
  "ki_points": {title: 'Ki Points'},
  "martial_arts": {title: 'Martial Arts'},
  "metamagic_known": {title: 'Metamagic Known'},
  "rage_count": {title: 'Rage Count'},
  "rage_damage_bonus": {title: 'Rage Damage Bonus'},
  "sneak_attack": {title: 'Sneak Attack'},
  "song_of_rest_die": {title: 'Song of Rest Die', prefix: '1d'},
  "sorcery_points": {title: 'Sorcery Points'},
  "unarmored_movement": {title: 'Unarmored Movement', prefix: '+', suffix: 'ft'},
  "wild_shape_max_cr": {title: 'Wild Shape Max CR'}
};

const classFormat = function(responseData) {

  if(!responseData?.data?.class) return;
	const data = responseData.data.class;
	if(responseData.data?.srdAttrib){ data.srdAttrib = responseData.data.srdAttrib};

	const classDefaults = {
	};

	_.defaultsDeep(data, classDefaults);

  const maxLevel = data.class_levels.filter((level)=>{return level.level == 20})[0];

  const isCaster = (data.class_levels.filter((level)=>{return level.level == 20 && level.spellcasting}).length);
  const isFullCaster = (maxLevel.spellcasting?.spell_slots_level_9);
  const hasCantrips = (maxLevel.spellcasting?.cantrips_known);
  const classSpecificFeatures = Object.keys(maxLevel.class_specific).filter((classSpecificKey)=>{
        return Object.keys(classSpecificFeatData).includes(classSpecificKey) && maxLevel.class_specific[classSpecificKey];
      });

	const output = dedent`

[class_name]: ${data.name}

[hit_die]: ${data.hit_die}


# $[class_name]

## Class Features

As a $[class_name], you gain the following features:

### Hit Points

**Hit Dice:** :: 1d$[hit_die] per $[class_name] level
**Hit Point at 1st Level:** :: $[hit_die] + your Constitution modifier
**Hit Points at Higher Levels:** :: 1d$[hit_die] (or $[hit_die / 2 + 1]) + your Constitution modifier per $[class_name] level after 1st

### Proficiencies

**Armor:** :: ${data.proficiencies.filter((prof)=>{return prof.type == 'Armor';}).map((prof)=>{return prof.name;}).join(', ') || 'None'}
**Weapons:** :: ${data.proficiencies.filter((prof)=>{return prof.type == 'Weapons';}).map((prof)=>{return prof.name;}).join(', ') || 'None'}
**Tools:** :: ${data.proficiencies.filter((prof)=>{return prof.type == 'ARTISANS_TOOLS';}).map((prof)=>{return prof.name;}).join(', ') || 'None'}
**Saving Throws:** :: ${data.proficiencies.filter((prof)=>{return prof.type == 'Saving Throws';}).map((prof)=>{return prof.reference.full_name;}).join(', ') || 'None'}
**Skills:** :: ${data.proficiency_choices.map((prof_choice)=>{return prof_choice.desc}).join(' ') || 'None'}

### Equipment

You start with the following equipment, in addition to the equipment granted by your background:

${data.starting_equipment_options.map((equip_option)=>{return `- ${equip_option.desc}`;}).join('  \n')}
${data.starting_equipment.map((equip)=>{return `- ${equip.quantity}x ${equip.equipment.name}`}).join(', ')}

{{classTable,frame,wide
###### $[class_name]

| Level | Proficiency Bonus | Features | ${classSpecificFeatures.map((csFeat)=>{return classSpecificFeatData[csFeat].title;}).join(' | ')} | ${isCaster ? `${hasCantrips ? 'Cantrips Known | ': '' }1 | 2 | 3 | 4 | 5 |${isFullCaster ? ' 6 | 7 | 8 | 9 |' : ''}` : '' }
|:-----:|:-----------------:|:---------|:${classSpecificFeatures.map((csFeat)=>{return classSpecificFeatData[csFeat].title.replace(/./g, '-');}).join(':|:')}:|${isCaster ? `${hasCantrips ? ':-:|': '' }:-:|:-:|:-:|:-:|:-:|${isFullCaster ? ':-:|:-:|:-:|:-:|' : ''}` : '' }
${data.class_levels
    .filter((level)=>{
      return !level.subclass;
    })
    .sort((a,b)=>{return a.level > b.level})
    .map((level)=>{
      const levelData = [];
      levelData.push(level.level);
      levelData.push(level.prof_bonus);
      levelData.push(level.features.map((feature)=>{return feature.name;}).join(', '));

      levelData.push(classSpecificFeatures.map((csFeat)=>{
        const featInfo = typeof level.class_specific[csFeat] == 'object'
          ?
          // Monk Martial Arts or Rogue Sneak Attack
          `${level.class_specific[csFeat].dice_count}d${level.class_specific[csFeat].dice_value}`
          :
          level.class_specific[csFeat];

        return `${classSpecificFeatData[csFeat].prefix || ''}${featInfo}${classSpecificFeatData[csFeat].suffix || ''}`;
      }).join(' | '));

      if(isCaster){
        if(hasCantrips){ levelData.push(level.spellcasting.cantrips_known || '-'); };

        levelData.push(level.spellcasting.spell_slots_level_1 || '-');
        levelData.push(level.spellcasting.spell_slots_level_2 || '-');
        levelData.push(level.spellcasting.spell_slots_level_3 || '-');
        levelData.push(level.spellcasting.spell_slots_level_4 || '-');
        levelData.push(level.spellcasting.spell_slots_level_5 || '-');

        if(isFullCaster){
          levelData.push(level.spellcasting.spell_slots_level_6 || '-');
          levelData.push(level.spellcasting.spell_slots_level_7 || '-');
          levelData.push(level.spellcasting.spell_slots_level_8 || '-');
          levelData.push(level.spellcasting.spell_slots_level_9 || '-');
        }
      }
      return `| ${levelData.join(' | ')} |`;
    })
    .join('  \n')}
}}

\page

${_.uniqBy(
    data.class_levels
      .filter((level)=>{return !level.subclass;})                             // Eliminate subclass specific level
      .sort((a,b)=>{return a.level > b.level;})                               // Ensure they are sorted 1 => 20
      .map((level)=>{return level.features;})                                 // Extract only features
      .flat()                                                                 // Flatten the array
      .filter((feature)=>{return feature.name.slice(-7) !== 'feature';})      // Remove any features that end in 'feature'; these are improvements on an existing feature
      .map((feature)=>{ return {
        ...feature,
        name: feature.name.replace(/(\(.*\))$/, '')                           // Eliminate any parts of feature names in parentheses
      };
    }),
      (a)=>{return a.name;}                                                   // Eliminate duplicate names in feature array
    )
    .map((feature)=>{
      return dedent`
      ### ${feature.name}
      
      ${feature.desc.join('\n')}
      
      :
      `;
    }).join('\n\n')
}


${data.srdAttrib ? `\n:\n\\page\n\n{{descriptive,wide\n${data.srdAttrib}\n}}` : ''}
`
	return output;

}

export { classFormat, classQuery, classSuggestionsQuery }