export async function createOcrWorker(onProgress=()=>{}){
  const {createWorker}=await import('tesseract.js');
  const worker=await createWorker('eng',1,{
    workerPath:'/ocr/worker.min.js',
    corePath:'/ocr/core',
    langPath:'/ocr/lang/4.0.0_best_int',
    gzip:true,
    logger:onProgress
  });
  await worker.setParameters({
    tessedit_pageseg_mode:'6',
    tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '
  });
  return {
    async recognize(canvas){
      const {data}=await worker.recognize(canvas);
      return data.text.trim();
    },
    terminate:()=>worker.terminate()
  };
}

export function enhanceTitleCrop(source){
  const canvas=document.createElement('canvas');
  canvas.width=source.width;
  canvas.height=source.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context) throw new Error('Could not prepare the card title for OCR');
  context.drawImage(source,0,0);
  const image=context.getImageData(0,0,canvas.width,canvas.height);
  let minimum=255,maximum=0;
  for(let index=0;index<image.data.length;index+=4){
    const value=Math.round(image.data[index]*0.299+image.data[index+1]*0.587+image.data[index+2]*0.114);
    minimum=Math.min(minimum,value);
    maximum=Math.max(maximum,value);
  }
  const range=Math.max(1,maximum-minimum);
  for(let index=0;index<image.data.length;index+=4){
    const value=Math.round((image.data[index]*0.299+image.data[index+1]*0.587+image.data[index+2]*0.114-minimum)*255/range);
    image.data[index]=value;
    image.data[index+1]=value;
    image.data[index+2]=value;
  }
  context.putImageData(image,0,0);
  return canvas;
}
