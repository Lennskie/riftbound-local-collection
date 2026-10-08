export const DETECT_CONFIG={
  sampleIntervalMs:140, // About 7 frames per second.
  requiredFrames:4, // Four good frames take roughly 0.56 seconds.
  acceptScore:0.68, // Initial OCR-match threshold; refine with real scans.
  sharpnessThreshold:32, // Variance of the Laplacian in the title band.
  steadyDifferenceThreshold:7, // Mean grayscale change for adjacent samples.
  rearmDifferenceThreshold:15, // Movement required before automatic recapture.
  edgeThreshold:25, // Minimum grayscale contrast for a detected edge.
  minimumEdgeFraction:0.2, // Each of the four card edges must be visible.
  minimumTitleEdgeDensity:0.012, // Reject blank title bands.
  maximumTitleEdgeDensity:0.5 // Reject highly noisy or blurred regions.
};

function assertPixels(gray,width,height){
  if(!gray||gray.length<width*height||width<3||height<3) throw new RangeError('Pixel buffer dimensions are invalid');
}

export function sharpness(gray,width,height){
  assertPixels(gray,width,height);
  let sum=0,sumSquares=0,count=0;
  for(let y=1;y<height-1;y++){
    for(let x=1;x<width-1;x++){
      const index=y*width+x;
      const value=gray[index-1]+gray[index+1]+gray[index-width]+gray[index+width]-4*gray[index];
      sum+=value;
      sumSquares+=value*value;
      count++;
    }
  }
  const mean=sum/count;
  return sumSquares/count-mean*mean;
}

export function frameDifference(previous,current){
  if(!previous||!current||previous.length!==current.length||previous.length===0){
    throw new RangeError('Frame buffers must have the same non-zero length');
  }
  let difference=0;
  for(let index=0;index<current.length;index++) difference+=Math.abs(current[index]-previous[index]);
  return difference/current.length;
}

function pixel(gray,width,height,x,y){
  const pixelX=Math.max(0,Math.min(width-1,Math.floor(x)));
  const pixelY=Math.max(0,Math.min(height-1,Math.floor(y)));
  return gray[pixelY*width+pixelX];
}

function edgeFraction(gray,width,height,frame,side){
  let edges=0,total=0;
  const acrossStart=side==='left'||side==='right'?frame.y+frame.height*0.12:frame.x+frame.width*0.12;
  const acrossEnd=side==='left'||side==='right'?frame.y+frame.height*0.88:frame.x+frame.width*0.88;
  const samples=Math.max(1,Math.floor(acrossEnd-acrossStart));
  for(let index=0;index<samples;index++){
    const across=acrossStart+(acrossEnd-acrossStart)*index/samples;
    const vertical=side==='left'||side==='right';
    const dimension=vertical?width:height;
    const depth=Math.max(2,Math.floor(dimension*0.1));
    let strongest=0;
    for(let offset=0;offset<depth;offset++){
      let x,y,nextX,nextY;
      if(side==='left'){x=frame.x+dimension*0.02+offset;y=across;nextX=x+1;nextY=y}
      else if(side==='right'){x=frame.x+frame.width-dimension*0.02-offset;y=across;nextX=x-1;nextY=y}
      else if(side==='top'){x=across;y=frame.y+dimension*0.02+offset;nextX=x;nextY=y+1}
      else{x=across;y=frame.y+frame.height-dimension*0.02-offset;nextX=x;nextY=y-1}
      strongest=Math.max(strongest,Math.abs(pixel(gray,width,height,x,y)-pixel(gray,width,height,nextX,nextY)));
    }
    if(strongest>=DETECT_CONFIG.edgeThreshold) edges++;
    total++;
  }
  return total?edges/total:0;
}

function titleEdgeDensity(gray,width,height,band){
  const left=Math.max(1,Math.floor(band.x*width));
  const top=Math.max(1,Math.floor(band.y*height));
  const right=Math.min(width-1,Math.ceil((band.x+band.width)*width));
  const bottom=Math.min(height-1,Math.ceil((band.y+band.height)*height));
  let edges=0,total=0;
  for(let y=top;y<bottom;y++){
    for(let x=left;x<right;x++){
      const index=y*width+x;
      if(Math.abs(gray[index]-gray[index-1])>=DETECT_CONFIG.edgeThreshold||
        Math.abs(gray[index]-gray[index-width])>=DETECT_CONFIG.edgeThreshold) edges++;
      total++;
    }
  }
  return total?edges/total:0;
}

export function cardPresenceMetrics(gray,width,height,guide={}){
  assertPixels(gray,width,height);
  const frame=guide.frame||{x:0,y:0,width:1,height:1};
  const band=guide.titleBand||{x:0.05,y:0.48,width:0.9,height:0.17};
  const framePixels={x:frame.x*width,y:frame.y*height,width:frame.width*width,height:frame.height*height};
  const edges=['left','right','top','bottom'].map(side=>edgeFraction(gray,width,height,framePixels,side));
  const density=titleEdgeDensity(gray,width,height,band);
  return {edges,titleEdgeDensity:density};
}

export function cardPresence(gray,width,height,guide={}){
  const metrics=cardPresenceMetrics(gray,width,height,guide);
  return metrics.edges.every(edge=>edge>=DETECT_CONFIG.minimumEdgeFraction)&&
    metrics.titleEdgeDensity>=DETECT_CONFIG.minimumTitleEdgeDensity&&metrics.titleEdgeDensity<=DETECT_CONFIG.maximumTitleEdgeDensity;
}

function cropRegion(gray,width,height,region){
  const left=Math.max(0,Math.floor(region.x*width));
  const top=Math.max(0,Math.floor(region.y*height));
  const right=Math.min(width,Math.ceil((region.x+region.width)*width));
  const bottom=Math.min(height,Math.ceil((region.y+region.height)*height));
  const cropWidth=Math.max(0,right-left),cropHeight=Math.max(0,bottom-top);
  const crop=new Uint8Array(cropWidth*cropHeight);
  for(let y=0;y<cropHeight;y++) crop.set(gray.subarray((top+y)*width+left,(top+y)*width+right),y*cropWidth);
  return {gray:crop,width:cropWidth,height:cropHeight};
}

export function evaluateFrame(gray,width,height,previous,guide={}){
  const present=cardPresence(gray,width,height,guide);
  const band=guide.titleBand||{x:0.05,y:0.48,width:0.9,height:0.17};
  const crop=cropRegion(gray,width,height,band);
  const sharp=crop.width>=3&&crop.height>=3&&sharpness(crop.gray,crop.width,crop.height)>=DETECT_CONFIG.sharpnessThreshold;
  const difference=previous?frameDifference(previous,gray):Infinity;
  return {present,sharp,steady:difference<=DETECT_CONFIG.steadyDifferenceThreshold,difference};
}

export class CaptureGate{
  constructor(requiredFrames=DETECT_CONFIG.requiredFrames){
    this.requiredFrames=requiredFrames;
    this.armed=true;
    this.movementSeen=false;
    this.consecutive=0;
  }
  disarm(){
    this.armed=false;
    this.movementSeen=false;
    this.consecutive=0;
  }
  manualCapture(){
    this.disarm();
    return true;
  }
  update(metrics){
    if(!this.armed){
      const visiblyChanged=Number.isFinite(metrics.difference)&&metrics.difference>=DETECT_CONFIG.rearmDifferenceThreshold;
      if(!metrics.present||visiblyChanged){
        this.movementSeen=true;
        this.consecutive=0;
        return false;
      }
      if(!this.movementSeen) return false;
    }
    if(metrics.present&&metrics.sharp&&metrics.steady){
      this.consecutive++;
      if(this.consecutive>=this.requiredFrames){
        this.disarm();
        return true;
      }
    }else{
      this.consecutive=0;
    }
    return false;
  }
}
