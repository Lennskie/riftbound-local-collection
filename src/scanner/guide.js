// `ocrBands` are the regions that are cropped and read. Cards come in two layouts:
//  - units, spells and gear carry their name banner around the middle of the card;
//  - legends carry theirs lower down.
// Both are read in the single "portrait" (Cards) mode, so there is no separate legend mode.
// `titleBand` is the bounding box of all OCR bands: it is the highlighted area and the region used for focus detection.
const RAW_GUIDE_CONFIG={
  portrait:{
    aspectRatio:744/1039,
    widthFraction:0.88,
    heightFraction:0.78,
    ocrBands:[
      {x:0.05,y:0.48,width:0.9,height:0.17},
      {x:0.05,y:0.68,width:0.9,height:0.15}
    ]
  },
  landscape:{
    aspectRatio:1039/744,
    widthFraction:0.88,
    heightFraction:0.66,
    ocrBands:[
      {x:0.06,y:0.55,width:0.78,height:0.20}
    ]
  }
};

function boundingBand(bands){
  const left=Math.min(...bands.map(band=>band.x));
  const top=Math.min(...bands.map(band=>band.y));
  const right=Math.max(...bands.map(band=>band.x+band.width));
  const bottom=Math.max(...bands.map(band=>band.y+band.height));
  return {x:left,y:top,width:right-left,height:bottom-top};
}

export const GUIDE_CONFIG=Object.fromEntries(Object.entries(RAW_GUIDE_CONFIG).map(([mode,config])=>[
  mode,{...config,titleBand:boundingBand(config.ocrBands)}
]));

function placeBand(frame,band){
  return {
    x:frame.x+frame.width*band.x,
    y:frame.y+frame.height*band.y,
    width:frame.width*band.width,
    height:frame.height*band.height
  };
}

export function getGuideGeometry(width,height,mode='portrait'){
  const config=GUIDE_CONFIG[mode]||GUIDE_CONFIG.portrait;
  const frameWidth=Math.min(width*config.widthFraction,height*config.heightFraction*config.aspectRatio);
  const frameHeight=frameWidth/config.aspectRatio;
  const frame={x:(width-frameWidth)/2,y:(height-frameHeight)/2,width:frameWidth,height:frameHeight};
  return {
    frame,
    titleBand:placeBand(frame,config.titleBand),
    ocrBands:config.ocrBands.map(band=>placeBand(frame,band)),
    normalizedFrame:{x:0,y:0,width:1,height:1},
    normalizedTitleBand:config.titleBand
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
