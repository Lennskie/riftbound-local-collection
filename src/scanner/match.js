import {DETECT_CONFIG} from './detect.js';

export const MIN_MATCH_SCORE=DETECT_CONFIG.acceptScore;

export function normalizeForMatch(text){
  return String(text||'').toLowerCase().replace(/\s+/g,' ').replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim();
}

export function buildMatcher(definitions){
  return definitions.map(definition=>({
    definition_key:definition.definition_key,
    normalized_name:normalizeForMatch(definition.card_name)
  })).filter(definition=>definition.normalized_name);
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

export function bestMatch(matcher,ocrText){
  const normalized=normalizeForMatch(ocrText);
  if(!normalized) return null;
  const words=normalized.split(' ');
  let best=null;
  for(const definition of matcher){
    const score=scoreName(definition.normalized_name,words);
    if(score>=(best?.score??MIN_MATCH_SCORE)){
      if(!best||score>best.score||definition.normalized_name.length>best.nameLength){
        best={definition_key:definition.definition_key,score,nameLength:definition.normalized_name.length};
      }
    }
  }
  return best&&best.score>=MIN_MATCH_SCORE
    ? {definition_key:best.definition_key,score:best.score}
    : null;
}
