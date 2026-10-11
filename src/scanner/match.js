import {DETECT_CONFIG} from './detect.js';

export const MIN_MATCH_SCORE=DETECT_CONFIG.acceptScore;
// Subtitles ("Imposing", "Bounty Hunter") are matched more strictly than full names
// because they are short and can resemble ordinary words in the OCR text.
export const MIN_SUBTITLE_SCORE=0.78;
const MIN_SUBTITLE_EXACT_LENGTH=5;
const MIN_SUBTITLE_FUZZY_LENGTH=6;

// Tier order, best first. A result with `tier <= LAST_CONFIDENT_TIER` is exact enough to stop scanning further.
export const TIERS=[
  {field:'normalized_name',exact:true},
  {field:'normalized_alias',exact:true},
  {field:'normalized_subtitle',exact:true},
  {field:'ambiguous_alias',exact:true,byType:true},
  {field:'normalized_name',exact:false},
  {field:'normalized_alias',exact:false},
  {field:'normalized_subtitle',exact:false,threshold:MIN_SUBTITLE_SCORE}
];
export const LAST_CONFIDENT_TIER=3;

export function normalizeForMatch(text){
  return String(text||'').toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

/*
 * Riftbound card names look like "Miss Fortune, Bounty Hunter".
 *  - Units show the first part in the big banner ("Volibear") and the second part in small print ("IMPOSING").
 *  - Legends show the SECOND part in the big banner ("Bounty Hunter") and the first part in the small type bar.
 * So every part (full name, first part = alias, second part = subtitle) is a valid thing to find in the OCR text.
 */
export function buildMatcher(definitions){
  const entries=definitions.map(definition=>{
    const cardName=String(definition.card_name||'');
    const normalizedName=normalizeForMatch(cardName);
    const comma=cardName.indexOf(',');
    const alias=comma<0?'':normalizeForMatch(cardName.slice(0,comma));
    const subtitle=comma<0?'':normalizeForMatch(cardName.slice(comma+1));
    return {
      definition_key:definition.definition_key,
      normalized_name:normalizedName,
      alias:alias&&alias!==normalizedName?alias:'',
      subtitle:subtitle&&subtitle!==normalizedName?subtitle:'',
      is_legend:String(definition.type_line||'').toLowerCase().includes('legend')
    };
  }).filter(definition=>definition.normalized_name);
  const count=(field,map)=>{
    for(const definition of entries){
      if(definition[field]) map.set(definition[field],(map.get(definition[field])||0)+1);
    }
    return map;
  };
  const aliasCounts=count('alias',new Map());
  const subtitleCounts=count('subtitle',new Map());
  return entries.map(definition=>{
    const aliasUnique=definition.alias&&aliasCounts.get(definition.alias)===1;
    const subtitleUnique=definition.subtitle&&subtitleCounts.get(definition.subtitle)===1;
    return {
      definition_key:definition.definition_key,
      is_legend:definition.is_legend,
      normalized_name:definition.normalized_name,
      normalized_alias:aliasUnique?definition.alias:'',
      // An alias shared by several cards (e.g. a legend and a champion with the same first name) is only
      // usable together with a type hint from the OCR text; see resolveByType().
      ambiguous_alias:definition.alias&&!aliasUnique?definition.alias:'',
      normalized_subtitle:subtitleUnique?definition.subtitle:''
    };
  });
}

function editDistance(left,right){
  let previous=Array.from({length:right.length+1},(_,index)=>index);
  for(let row=1;row<=left.length;row++){
    const current=[row];
    for(let column=1;column<=right.length;column++){
      current[column]=Math.min(
        current[column-1]+1,
        previous[column]+1,
        previous[column-1]+(left[row-1]===right[column-1]?0:1)
      );
    }
    previous=current;
  }
  return previous[right.length];
}

function scoreName(name,ocrWords){
  let best=0;
  for(let start=0;start<ocrWords.length;start++){
    for(let end=start+1;end<=ocrWords.length;end++){
      const candidate=ocrWords.slice(start,end).join(' ');
      const distance=editDistance(name,candidate);
      const similarity=1-distance/Math.max(name.length,candidate.length);
      const unusedWords=ocrWords.length-(end-start);
      const score=similarity-unusedWords*0.015-start*0.003;
      best=Math.max(best,score);
    }
  }
  return Math.max(0,best);
}

function hasExactName(name,ocrWords){
  if(!name) return false;
  const nameWords=name.split(' ');
  for(let start=0;start<=ocrWords.length-nameWords.length;start++){
    if(nameWords.every((word,index)=>word===ocrWords[start+index])) return true;
  }
  return false;
}

function typeHint(ocrWords){
  if(ocrWords.includes('legend')) return 'legend';
  if(ocrWords.includes('champion')) return 'unit';
  return null;
}

function eligible(tier,name){
  if(!name) return false;
  if(tier.field==='normalized_subtitle'){
    return name.length>=(tier.exact?MIN_SUBTITLE_EXACT_LENGTH:MIN_SUBTITLE_FUZZY_LENGTH);
  }
  return true;
}

// An alias shared by several cards resolves only when the card's type bar ("LEGEND ...", "CHAMPION UNIT ...")
// leaves exactly one candidate.
function resolveByType(matcher,words){
  const hint=typeHint(words);
  if(!hint) return null;
  const groups=new Map();
  for(const definition of matcher){
    if(!definition.ambiguous_alias||!hasExactName(definition.ambiguous_alias,words)) continue;
    const group=groups.get(definition.ambiguous_alias)||[];
    group.push(definition);
    groups.set(definition.ambiguous_alias,group);
  }
  let best=null;
  for(const [alias,group] of groups){
    const candidates=group.filter(definition=>definition.is_legend===(hint==='legend'));
    if(candidates.length!==1) continue;
    const score=scoreName(alias,words);
    if(!best||score>best.score) best={definition_key:candidates[0].definition_key,score};
  }
  return best;
}

export function bestMatch(matcher,ocrText){
  const normalized=normalizeForMatch(ocrText);
  if(!normalized) return null;
  const words=normalized.split(' ');
  for(const [tierIndex,tier] of TIERS.entries()){
    const threshold=tier.threshold??MIN_MATCH_SCORE;
    if(tier.byType){
      const resolved=resolveByType(matcher,words);
      if(resolved&&resolved.score>=threshold) return {...resolved,tier:tierIndex,confident:tierIndex<=LAST_CONFIDENT_TIER};
      continue;
    }
    let best=null;
    for(const definition of matcher){
      const name=definition[tier.field];
      if(!eligible(tier,name)) continue;
      const exact=hasExactName(name,words);
      if(tier.exact!==exact) continue;
      const score=scoreName(name,words);
      if(score>=(best?.score??threshold)){
        if(!best||score>best.score||name.length>best.nameLength){
          best={definition_key:definition.definition_key,score,nameLength:name.length};
        }
      }
    }
    if(best&&best.score>=threshold){
      return {definition_key:best.definition_key,score:best.score,tier:tierIndex,confident:tierIndex<=LAST_CONFIDENT_TIER};
    }
  }
  return null;
}
