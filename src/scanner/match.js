import {DETECT_CONFIG} from './detect.js';

export const MIN_MATCH_SCORE=DETECT_CONFIG.acceptScore;
// Subtitles ("Imposing", "Bounty Hunter") are matched more strictly than full names
// because they are short and can resemble ordinary words in the OCR text.
export const MIN_SUBTITLE_SCORE=0.78;
const MIN_SUBTITLE_EXACT_LENGTH=5;
const MIN_SUBTITLE_FUZZY_LENGTH=6;
// Extra credit a card gets when a second, independent part of its name ("Volibear" + "Imposing")
// is also visible in the OCR text. Two imperfect signals that agree beat one perfect-looking
// signal that belongs to a different card.
const SECOND_FIELD_BONUS=0.25;
// A fuzzy alias needs this much similarity before it counts as supporting evidence.
const MIN_SUPPORT_SCORE=0.6;

// Tier order, best first. A result with `tier <= LAST_CONFIDENT_TIER` is exact enough to stop scanning further.
export const TIERS=[
  {field:'normalized_name',exact:true},
  {field:'normalized_alias',exact:true},
  {field:'normalized_subtitle',exact:true},
  {field:'ambiguous_alias',exact:true,byType:true},
  {field:'ambiguous_alias',exact:false,byType:true},
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

function scoreNameDetailed(name,ocrWords){
  let best={score:0,distance:Infinity};
  for(let start=0;start<ocrWords.length;start++){
    for(let end=start+1;end<=ocrWords.length;end++){
      const candidate=ocrWords.slice(start,end).join(' ');
      const distance=editDistance(name,candidate);
      const similarity=1-distance/Math.max(name.length,candidate.length);
      const unusedWords=ocrWords.length-(end-start);
      // Penalties are capped so a longer OCR region (type bar + rules text) cannot
      // drown out a genuine name match.
      const score=similarity-Math.min(unusedWords,12)*0.006-start*0.002;
      if(score>best.score) best={score:Math.max(0,score),distance};
    }
  }
  return best;
}

function scoreName(name,ocrWords){
  return scoreNameDetailed(name,ocrWords).score;
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

// Supporting evidence from another name part of the same card.
function aliasSupport(alias,words){
  if(!alias) return 0;
  if(hasExactName(alias,words)) return 1;
  const score=scoreName(alias,words);
  return score>=MIN_SUPPORT_SCORE?score:0;
}

function subtitleSupport(subtitle,words){
  if(!subtitle) return 0;
  if(hasExactName(subtitle,words)) return 1;
  const score=scoreName(subtitle,words);
  return score>=MIN_SUBTITLE_SCORE?score:0;
}

// An alias shared by several cards resolves only when the card's type bar ("LEGEND ...", "CHAMPION UNIT ...")
// leaves exactly one candidate. `fuzzy` also accepts OCR-degraded aliases ("VOLIBEER") as long as they
// reach the normal match threshold; the exact-alias case is handled by the earlier tier.
function resolveByType(matcher,words,{fuzzy=false}={}){
  const hint=typeHint(words);
  if(!hint) return null;
  const groups=new Map();
  for(const definition of matcher){
    if(!definition.ambiguous_alias) continue;
    if(hasExactName(definition.ambiguous_alias,words)===fuzzy) continue;
    const group=groups.get(definition.ambiguous_alias)||[];
    group.push(definition);
    groups.set(definition.ambiguous_alias,group);
  }
  let best=null;
  for(const group of groups.values()){
    const candidates=group.filter(definition=>definition.is_legend===(hint==='legend'));
    if(candidates.length!==1) continue;
    const score=fuzzy?scoreName(candidates[0].ambiguous_alias,words):1;
    if(score<MIN_MATCH_SCORE) continue;
    if(!best||score>best.score) best={definition_key:candidates[0].definition_key,score};
  }
  return best;
}

function compareCandidates(left,right){
  return right.composite-left.composite||
    right.exactFields-left.exactFields||
    right.score-left.score||
    left.distance-right.distance||
    right.nameLength-left.nameLength||
    (left.definition_key<right.definition_key?-1:left.definition_key>right.definition_key?1:0);
}

export function bestMatch(matcher,ocrText){
  const normalized=normalizeForMatch(ocrText);
  if(!normalized) return null;
  const words=normalized.split(' ');
  const byKey=new Map(matcher.map(definition=>[definition.definition_key,definition]));
  for(const [tierIndex,tier] of TIERS.entries()){
    const threshold=tier.threshold??MIN_MATCH_SCORE;
    if(tier.byType){
      const resolved=resolveByType(matcher,words,{fuzzy:!tier.exact});
      if(resolved&&resolved.score>=threshold) return {...resolved,tier:tierIndex,confident:tierIndex<=LAST_CONFIDENT_TIER};
      continue;
    }
    const candidates=[];
    for(const definition of matcher){
      const name=definition[tier.field];
      if(!eligible(tier,name)) continue;
      const exact=hasExactName(name,words);
      if(tier.exact!==exact) continue;
      const detailed=scoreNameDetailed(name,words);
      if(detailed.score<threshold) continue;
      // Cross-field evidence: an independent name part of the same card that is also visible.
      let support=0;
      if(tier.field==='normalized_name'){
        support=Math.max(
          aliasSupport(definition.normalized_alias,words),
          aliasSupport(definition.ambiguous_alias,words),
          subtitleSupport(definition.normalized_subtitle,words)
        );
      }else if(tier.field==='normalized_alias'){
        support=subtitleSupport(definition.normalized_subtitle,words);
      }else if(tier.field==='normalized_subtitle'){
        support=Math.max(
          aliasSupport(definition.normalized_alias,words),
          aliasSupport(definition.ambiguous_alias,words)
        );
      }
      const exactFields=['normalized_name','normalized_alias','ambiguous_alias','normalized_subtitle']
        .filter(field=>definition[field]&&hasExactName(definition[field],words)).length;
      candidates.push({
        definition_key:definition.definition_key,
        score:detailed.score,
        distance:detailed.distance,
        nameLength:name.length,
        exactFields,
        composite:detailed.score+SECOND_FIELD_BONUS*support
      });
    }
    if(!candidates.length) continue;
    candidates.sort(compareCandidates);
    const best=candidates[0];
    // Family guard: equally good fuzzy candidates that share the same first name part ("Volibear, ...")
    // are ambiguous. Refuse to guess — a later tier, another OCR variant or a rescan may resolve it.
    // (This is what used to add the wrong Volibear: ties were broken by catalogue order.)
    if(tierIndex>LAST_CONFIDENT_TIER){
      const tied=candidates.filter(candidate=>
        candidate.composite>=best.composite-1e-9&&
        candidate.score>=best.score-1e-9&&
        candidate.distance<=best.distance+1);
      if(tied.length>1){
        const families=new Set(tied.map(candidate=>{
          const definition=byKey.get(candidate.definition_key);
          return definition.normalized_alias||definition.ambiguous_alias||definition.normalized_name;
        }));
        if(families.size<tied.length) continue;
      }
    }
    return {definition_key:best.definition_key,score:best.score,tier:tierIndex,confident:tierIndex<=LAST_CONFIDENT_TIER};
  }
  return null;
}