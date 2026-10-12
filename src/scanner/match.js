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

let rowA=new Uint16Array(128),rowB=new Uint16Array(128);
// Returns the edit distance, or maxDistance+1 as soon as it is certain the distance exceeds maxDistance.
function editDistance(left,right,maxDistance=Infinity){
  const width=right.length+1;
  if(width>rowA.length){rowA=new Uint16Array(width*2);rowB=new Uint16Array(width*2)}
  let previous=rowA,current=rowB;
  for(let column=0;column<width;column++) previous[column]=column;
  for(let row=1;row<=left.length;row++){
    current[0]=row;
    let rowMinimum=row;
    for(let column=1;column<width;column++){
      const substitution=previous[column-1]+(left.charCodeAt(row-1)===right.charCodeAt(column-1)?0:1);
      const insertion=current[column-1]+1,deletion=previous[column]+1;
      const value=substitution<insertion?(substitution<deletion?substitution:deletion):(insertion<deletion?insertion:deletion);
      current[column]=value;
      if(value<rowMinimum) rowMinimum=value;
    }
    if(rowMinimum>maxDistance) return maxDistance+1;
    const swap=previous;previous=current;current=swap;
  }
  return previous[right.length];
}

// Every caller discards scores below the lowest threshold in use, so windows that cannot reach it are not scored.
const SCORE_FLOOR=Math.min(MIN_SUPPORT_SCORE,MIN_MATCH_SCORE,MIN_SUBTITLE_SCORE);
// Scores are cached per name for the duration of one bestMatch call (the OCR words do not change within it).
let nameScores=null;
// OCR word windows (text + letter counts) are built once per bestMatch call and shared by every name.
let windowCache=null;

function letterCounts(text){
  const counts=new Uint8Array(37);
  for(let index=0;index<text.length;index++){
    const code=text.charCodeAt(index);
    counts[code>=97&&code<=122?code-97:code>=48&&code<=57?code-22:36]++;
  }
  return counts;
}

function windowAt(words,start,end){
  const key=start*32+(end-start);
  let entry=windowCache.get(key);
  if(!entry){
    const text=words.slice(start,end).join(' ');
    entry={text,counts:letterCounts(text)};
    windowCache.set(key,entry);
  }
  return entry;
}

function scoreNameDetailed(name,ocrWords){
  const cached=nameScores&&nameScores.get(name);
  if(cached) return cached;
  let best={score:0,distance:Infinity};
  const nameWordCount=name.split(' ').length;
  const nameCounts=letterCounts(name);
  for(let start=0;start<ocrWords.length;start++){
    const maxEnd=Math.min(ocrWords.length,start+nameWordCount+2);
    for(let end=start+1;end<=maxEnd;end++){
      const window=windowAt(ocrWords,start,end);
      const candidate=window.text;
      const longest=Math.max(name.length,candidate.length);
      const bar=Math.max(SCORE_FLOOR,best.score);
      if(1-Math.abs(name.length-candidate.length)/longest<bar) continue;
      const allowed=Math.floor((1-bar)*longest);
      // Edit distance is at least (longer length - letters the two strings share), so most windows are rejected
      // here in 37 steps instead of a full edit-distance table.
      let shared=0;
      for(let bucket=0;bucket<37;bucket++) shared+=nameCounts[bucket]<window.counts[bucket]?nameCounts[bucket]:window.counts[bucket];
      if(longest-shared>allowed) continue;
      const distance=editDistance(name,candidate,allowed);
      const similarity=1-distance/longest;
      const unusedWords=ocrWords.length-(end-start);
      const score=similarity-Math.min(unusedWords,12)*0.006-start*0.002;
      if(score>best.score) best={score:Math.max(0,score),distance};
    }
  }
  if(nameScores) nameScores.set(name,best);
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

const keyIndexes=new WeakMap();
function indexByKey(matcher){
  let byKey=keyIndexes.get(matcher);
  if(!byKey){
    byKey=new Map(matcher.map(definition=>[definition.definition_key,definition]));
    keyIndexes.set(matcher,byKey);
  }
  return byKey;
}

// Name banners are short; ignoring very long OCR tails keeps matching cost bounded.
const MAX_OCR_WORDS=40;

export function bestMatch(matcher,ocrText){
  nameScores=new Map();
  windowCache=new Map();
  try{
    return matchWithScores(matcher,ocrText);
  }finally{
    nameScores=null;
    windowCache=null;
  }
}

function matchWithScores(matcher,ocrText){
  const normalized=normalizeForMatch(ocrText);
  if(!normalized) return null;
  const words=normalized.split(' ').slice(0,MAX_OCR_WORDS);
  const byKey=indexByKey(matcher);
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