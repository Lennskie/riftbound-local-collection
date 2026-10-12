import {scannerLog} from './log.js';

const RECYCLE_AFTER=12;
export const MAX_OCR_WIDTH=720;
// A recognition that takes this long is treated as a hung worker: it is rebuilt and that read counts as empty text.
const RECOGNIZE_TIMEOUT_MS=10000;

export async function createOcrWorker(onProgress=()=>{}){
  const {createWorker}=await import('tesseract.js');
  const make=async()=>{
    const created=await createWorker('eng',1,{
      workerPath:'/ocr/worker.min.js',
      corePath:'/ocr/core',
      langPath:'/ocr/lang/4.0.0_best_int',
      gzip:true,
      logger:onProgress
    });
    await created.setParameters({
      tessedit_pageseg_mode:'6',
      tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '
    });
    return created;
  };
  let worker=await make();
  let uses=0;
  const rebuild=async()=>{
    // Free the old WASM heap before allocating the new one so two workers never coexist.
    await worker.terminate().catch(()=>{});
    worker=await make();
    uses=0;
  };
  return {
    async recognize(canvas){
      if(uses>=RECYCLE_AFTER) await rebuild();
      uses++;
      const job=worker.recognize(canvas);
      job.catch(()=>{});
      let timer;
      const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),RECOGNIZE_TIMEOUT_MS)});
      try{
        const result=await Promise.race([job,timeout]);
        if(result===null){
          scannerLog('ocr timed out, rebuilding worker',{ms:RECOGNIZE_TIMEOUT_MS});
          await rebuild();
          return '';
        }
        return result.data.text.trim();
      }finally{
        clearTimeout(timer);
      }
    },
    terminate:()=>worker.terminate()
  };
}

// Pure pixel helpers (no DOM) so they can be unit-tested.

// Light text on a mid-tone banner: keep only pixels that are brighter than the rest of the crop.
// Output is black text on a white background, which is what Tesseract expects.
export function percentileThreshold(gray,fraction=0.88){
  const histogram=new Uint32Array(256);
  for(const value of gray) histogram[value]++;
  const target=gray.length*fraction;
  let seen=0,cut=255;
  for(let value=0;value<256;value++){
    seen+=histogram[value];
    if(seen>=target){cut=value;break}
  }
  // Strictly brighter than the cut-off value; when the cut-off is pure white, keep the white pixels themselves.
  const output=new Uint8Array(gray.length);
  for(let index=0;index<gray.length;index++) output[index]=(cut<255?gray[index]>cut:gray[index]>=cut)?0:255;
  return output;
}

// Local adaptive version of the same idea: a pixel is text when it is clearly brighter than its neighbourhood.
export function adaptiveBrightThreshold(gray,width,height,radius,offset){
  const stride=width+1;
  const integral=new Uint32Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let rowSum=0;
    for(let x=0;x<width;x++){
      rowSum+=gray[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
    }
  }
  const output=new Uint8Array(width*height);
  for(let y=0;y<height;y++){
    const top=Math.max(0,y-radius),bottom=Math.min(height,y+radius+1);
    for(let x=0;x<width;x++){
      const left=Math.max(0,x-radius),right=Math.min(width,x+radius+1);
      const sum=integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left];
      const mean=sum/((right-left)*(bottom-top));
      output[y*width+x]=gray[y*width+x]>mean+offset?0:255;
    }
  }
  return output;
}

const scratch=new WeakMap();

// Releases the shared scratch canvas created for a crop. Call once every variant of that crop has been read.
export function releaseOcrScratch(source){
  const state=scratch.get(source);
  if(!state) return;
  state.canvas.width=0;
  state.canvas.height=0;
  scratch.delete(source);
}

// One canvas, ImageData and gray buffer per crop, shared by all of its OCR variants (they run one after another).
function readGray(source){
  const cached=scratch.get(source);
  if(cached) return cached;
  const scale=Math.min(1,MAX_OCR_WIDTH/source.width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(source.width*scale));
  canvas.height=Math.max(1,Math.round(source.height*scale));
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context) throw new Error('Could not prepare the card title for OCR');
  context.drawImage(source,0,0,canvas.width,canvas.height);
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  const gray=new Uint8Array(canvas.width*canvas.height);
  for(let index=0,target=0;index<image.data.length;index+=4,target++){
    gray[target]=Math.round(image.data[index]*0.299+image.data[index+1]*0.587+image.data[index+2]*0.114);
  }
  const state={canvas,context,image,gray};
  scratch.set(source,state);
  return state;
}

function writeGray({canvas,context,image},gray){
  for(let index=0,source=0;index<image.data.length;index+=4,source++){
    image.data[index]=gray[source];
    image.data[index+1]=gray[source];
    image.data[index+2]=gray[source];
    image.data[index+3]=255;
  }
  context.putImageData(image,0,0);
  return canvas;
}

export function enhanceTitleCrop(source){
  const state=readGray(source);
  let minimum=255,maximum=0;
  for(const value of state.gray){
    minimum=Math.min(minimum,value);
    maximum=Math.max(maximum,value);
  }
  const range=Math.max(1,maximum-minimum);
  const stretched=new Uint8Array(state.gray.length);
  for(let index=0;index<stretched.length;index++) stretched[index]=Math.round((state.gray[index]-minimum)*255/range);
  return writeGray(state,stretched);
}

export function topPercentileCrop(source,fraction=0.88){
  const state=readGray(source);
  return writeGray(state,percentileThreshold(state.gray,fraction));
}

export function brightTextCrop(source,{radiusFraction=0.11,offset=25}={}){
  const state=readGray(source);
  const radius=Math.max(4,Math.round(state.canvas.height*radiusFraction));
  return writeGray(state,adaptiveBrightThreshold(state.gray,state.canvas.width,state.canvas.height,radius,offset));
}

// The plain contrast stretch works for most banners. Gold/orange banners with white lettering (champions, legends)
// need one of the "bright text" variants, and pale banners with dark lettering need the "dark text" variant,
// so those are tried when the earlier ones do not give a confident match. Only the canvas handed to Tesseract
// is black and white; the user-facing camera stream always stays in full color.
export function buildOcrVariants(source,mode='portrait'){
  if(mode!=='landscape') return [
    ()=>brightTextCrop(source),
    ()=>enhanceTitleCrop(source)
  ];
  return [
    ()=>enhanceTitleCrop(source),
    ()=>topPercentileCrop(source),
    ()=>brightTextCrop(source),
    ()=>darkTextCrop(source)
  ];
}

// Local adaptive threshold for the opposite polarity: a pixel is text when it is clearly
// DARKER than its neighbourhood (dark lettering on a light banner). Output is pure
// black text on a white background for Tesseract; the live camera preview is untouched.
export function adaptiveDarkThreshold(gray,width,height,radius,offset){
  const stride=width+1;
  const integral=new Uint32Array(stride*(height+1));
  for(let y=0;y<height;y++){
    let rowSum=0;
    for(let x=0;x<width;x++){
      rowSum+=gray[y*width+x];
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
    }
  }
  const output=new Uint8Array(width*height);
  for(let y=0;y<height;y++){
    const top=Math.max(0,y-radius),bottom=Math.min(height,y+radius+1);
    for(let x=0;x<width;x++){
      const left=Math.max(0,x-radius),right=Math.min(width,x+radius+1);
      const sum=integral[bottom*stride+right]-integral[top*stride+right]-integral[bottom*stride+left]+integral[top*stride+left];
      const mean=sum/((right-left)*(bottom-top));
      output[y*width+x]=gray[y*width+x]<mean-offset?0:255;
    }
  }
  return output;
}

export function darkTextCrop(source,{radiusFraction=0.11,offset=25}={}){
  const state=readGray(source);
  const radius=Math.max(4,Math.round(state.canvas.height*radiusFraction));
  return writeGray(state,adaptiveDarkThreshold(state.gray,state.canvas.width,state.canvas.height,radius,offset));
}