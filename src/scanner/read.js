import {bestMatch} from './match.js';
import {scannerLog} from './log.js';

// A name banner and its type bar sit at the top of a band; anything further down is rules text.
const MAX_WORDS_PER_READ=20;
function firstWords(text,count){
  const words=String(text||'').split(/\s+/).filter(Boolean);
  return words.length>count?words.slice(0,count).join(' '):String(text||'');
}

// Lets the browser paint and handle input between matching passes so a long match never freezes the page.
const yieldToUi=()=>new Promise(resolve=>setTimeout(resolve,0));

async function timedMatch(matcher,text,label){
  await yieldToUi();
  const started=performance.now();
  const result=bestMatch(matcher,text);
  scannerLog(`match ${label}`,{ms:Math.round(performance.now()-started),words:text.split(/\s+/).filter(Boolean).length,tier:result?.tier??null,confident:result?.confident??false});
  return result;
}

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
      const text=firstWords(await attempt(),MAX_WORDS_PER_READ);
      texts.push(text);
      const result=await timedMatch(matcher,text,'single');
      if(result?.confident) return result;
      if(result&&isBetter(result,best)) best=result;
      if(texts.length>1){
        const combined=await timedMatch(matcher,texts.join(' '),'combined');
        if(combined?.confident) return combined;
        if(combined&&isBetter(combined,best)) best=combined;
      }
    }
  }
  return best;
}
