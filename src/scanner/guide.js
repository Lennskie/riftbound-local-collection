export const GUIDE_CONFIG={
  portrait:{
    aspectRatio:744/1039,
    widthFraction:0.88,
    heightFraction:0.78,
    titleBand:{x:0.05,y:0.48,width:0.9,height:0.17}
  },
  legend:{
    aspectRatio:744/1039,
    widthFraction:0.88,
    heightFraction:0.78,
    titleBand:{x:0.05,y:0.68,width:0.9,height:0.15}
  },
  landscape:{
    aspectRatio:1039/744,
    widthFraction:0.88,
    heightFraction:0.66,
    titleBand:{x:0.06,y:0.55,width:0.78,height:0.20}
  }
};

export function getGuideGeometry(width,height,mode='portrait'){
  const config=GUIDE_CONFIG[mode]||GUIDE_CONFIG.portrait;
  const frameWidth=Math.min(width*config.widthFraction,height*config.heightFraction*config.aspectRatio);
  const frameHeight=frameWidth/config.aspectRatio;
  const frame={x:(width-frameWidth)/2,y:(height-frameHeight)/2,width:frameWidth,height:frameHeight};
  const band=config.titleBand;
  return {
    frame,
    titleBand:{
      x:frame.x+frame.width*band.x,
      y:frame.y+frame.height*band.y,
      width:frame.width*band.width,
      height:frame.height*band.height
    },
    normalizedFrame:{x:0,y:0,width:1,height:1},
    normalizedTitleBand:band
  };
}

export function mapScreenRectToVideoRect(rect,viewportWidth,viewportHeight,videoWidth,videoHeight){
  if(!(viewportWidth>0&&viewportHeight>0&&videoWidth>0&&videoHeight>0)) return null;
  const scale=Math.max(viewportWidth/videoWidth,viewportHeight/videoHeight);
  const offsetX=(videoWidth*scale-viewportWidth)/2;
  const offsetY=(videoHeight*scale-viewportHeight)/2;
  const left=Math.max(0,(rect.x+offsetX)/scale);
  const top=Math.max(0,(rect.y+offsetY)/scale);
  const right=Math.min(videoWidth,(rect.x+rect.width+offsetX)/scale);
  const bottom=Math.min(videoHeight,(rect.y+rect.height+offsetY)/scale);
  if(right<=left||bottom<=top) return null;
  return {x:left,y:top,width:right-left,height:bottom-top};
}
