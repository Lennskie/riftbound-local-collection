import {DETECT_CONFIG} from './detect.js';

export const MIN_MATCH_SCORE=DETECT_CONFIG.acceptScore;

export function normalizeForMatch(text){
  return String(text||'').toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

export function buildMatcher(definitions){
  const entries=definitions.map(definition=>{
    const normalizedName=normalizeForMatch(definition.card_name);
    const comma=String(definition.card_name||'').indexOf(',');
    const normalizedAlias=comma<0?'':normalizeForMatch(definition.card_name.slice(0,comma));
    return {
      definition_key:definition.definition_key,
      normalized_name:normalizedName,
      normalized_alias:normalizedAlias&&normalizedAlias!==normalizedName?normalizedAlias:''
    };
  }).filter(definition=>definition.normalized_name);
  const aliasCounts=new Map();
  for(const definition of entries){
    if(definition.normalized_alias){
      aliasCounts.set(definition.normalized_alias,(aliasCounts.get(definition.normalized_alias)||0)+1);
    }
  }
  return entries.map(definition=>({
    ...definition,
    normalized_alias:aliasCounts.get(definition.normalized_alias)===1?definition.normalized_alias:''
  }));
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

export function bestMatch(matcher,ocrText){
  const normalized=normalizeForMatch(ocrText);
  if(!normalized) return null;
  const words=normalized.split(' ');
  const tiers=[
    {name:'normalized_name',exact:true},
    {name:'normalized_alias',exact:true},
    {name:'normalized_name',exact:false},
    {name:'normalized_alias',exact:false}
  ];
  for(const tier of tiers){
    let best=null;
    for(const definition of matcher){
      const name=definition[tier.name];
      if(!name) continue;
      const exact=hasExactName(name,words);
      if(tier.exact!==exact) continue;
      const score=scoreName(name,words);
      if(score>=(best?.score??MIN_MATCH_SCORE)){
        if(!best||score>best.score||name.length>best.nameLength){
          best={definition_key:definition.definition_key,score,nameLength:name.length};
        }
      }
    }
    if(best&&best.score>=MIN_MATCH_SCORE) return {definition_key:best.definition_key,score:best.score};
  }
  return null;
}
