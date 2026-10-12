import {bestMatch} from './match.js';

function isBetter(candidate,current){
  if(!current) return true;
  if(candidate.tier!==current.tier) return candidate.tier<current.tier;
  return candidate.score>current.score;
}

/*
 * Reads one card from one or more name-banner bands.
 *   bands: array of bands (e.g. unit-banner position, then legend-banner position);
 *          each band is an array of async functions that return OCR text (cheapest/most reliable first).
 * Stops as soon as a confident match is found; otherwise returns the best weaker match, or null.
 */
export async function readCard(matcher,bands,{maxAttempts=Infinity}={}){
  let best=null;
  let used=0;
  const texts=[];
  for(const attempts of bands){
    for(const attempt of attempts){
      if(used>=maxAttempts) return best;
      used++;
      const text=await attempt();
      texts.push(text);
      const result=bestMatch(matcher,text);
      if(result?.confident) return result;
      if(result&&isBetter(result,best)) best=result;
      const combined=bestMatch(matcher,texts.join(' '));
      if(combined?.confident) return combined;
      if(combined&&isBetter(combined,best)) best=combined;
    }
  }
  return best;
}
