import {useEffect,useRef,useState} from 'react';
import {CaptureGate,DETECT_CONFIG,evaluateFrame} from './detect.js';
import {getGuideGeometry,GUIDE_CONFIG,mapScreenRectToVideoRect} from './guide.js';
import {enhanceTitleCrop} from './ocr.js';

const secureContextHelp='https://github.com/Lennskie/riftbound-local-collection/blob/main/docs/GETTING_STARTED.md#enable-https-for-phone-camera-access';

function grayPixels(context,canvas){
  const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  const gray=new Uint8Array(canvas.width*canvas.height);
  for(let source=0,target=0;source<pixels.length;source+=4,target++){
    gray[target]=Math.round(pixels[source]*0.299+pixels[source+1]*0.587+pixels[source+2]*0.114);
  }
  return gray;
}

function cropTitleBand(video,stage,mode){
  const bounds=stage?.getBoundingClientRect();
  if(!video||!bounds||!video.videoWidth||!video.videoHeight) throw new Error('The camera frame is not ready yet');
  const geometry=getGuideGeometry(bounds.width,bounds.height,mode);
  const source=mapScreenRectToVideoRect(geometry.titleBand,bounds.width,bounds.height,video.videoWidth,video.videoHeight);
  if(!source) throw new Error('The card title band is outside the camera frame');
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(source.width));
  canvas.height=Math.max(1,Math.round(source.height));
  const context=canvas.getContext('2d');
  if(!context) throw new Error('Could not crop the card title band');
  context.drawImage(video,source.x,source.y,source.width,source.height,0,0,canvas.width,canvas.height);
  return enhanceTitleCrop(canvas);
}

export default function CameraCapture({
  enabled,
  mode,
  onModeChange,
  onCapture,
  onCaptureError,
  resetKey,
  paused=false
}){
  const videoRef=useRef(null);
  const stageRef=useRef(null);
  const callbacksRef=useRef({onCapture,onCaptureError});
  const takeCaptureRef=useRef(null);
  const loopControlRef=useRef({start:null,stop:null});
  const modeRef=useRef(mode);
  const pausedRef=useRef(paused);
  const gateRef=useRef(new CaptureGate());
  const resetKeyRef=useRef(resetKey);
  const modeStateRef=useRef(mode);
  const previousFrameRef=useRef(null);
  const captureInFlightRef=useRef(false);
  const [viewport,setViewport]=useState({width:0,height:0});
  const [cameraError,setCameraError]=useState('');
  const [cameraReady,setCameraReady]=useState(false);
  const [hint,setHint]=useState('');
  const [guideStatus,setGuideStatus]=useState('searching');

  callbacksRef.current={onCapture,onCaptureError};
  modeRef.current=mode;
  pausedRef.current=paused;

  useEffect(()=>{
    if(resetKeyRef.current!==resetKey){
      resetKeyRef.current=resetKey;
      gateRef.current.disarm();
      previousFrameRef.current=null;
    }
  },[resetKey]);

  useEffect(()=>{
    if(modeStateRef.current!==mode){
      modeStateRef.current=mode;
      gateRef.current=new CaptureGate();
      previousFrameRef.current=null;
    }
  },[mode]);

  useEffect(()=>{
    const updateViewport=()=>{
      const bounds=stageRef.current?.getBoundingClientRect();
      if(bounds) setViewport({width:bounds.width,height:bounds.height});
    };
    updateViewport();
    window.addEventListener('resize',updateViewport);
    return()=>window.removeEventListener('resize',updateViewport);
  },[]);

  useEffect(()=>{
    if(!enabled) return undefined;
    if(!window.isSecureContext){
      setCameraError('Camera scanning requires a secure browser context. Open the app through HTTPS on your phone.');
      return undefined;
    }
    if(!navigator.mediaDevices?.getUserMedia){
      setCameraError('This browser does not provide camera access.');
      return undefined;
    }

    let active=true;
    let stream=null;
    let interval=null;
    const sampleCanvas=document.createElement('canvas');
    const sampleContext=sampleCanvas.getContext('2d',{willReadFrequently:true});

    const takeCapture=async()=>{
      if(captureInFlightRef.current||!active) return;
      captureInFlightRef.current=true;
      setGuideStatus('reading');
      setHint('Reading…');
      if(navigator.vibrate) navigator.vibrate(35);
      try{
        const crop=cropTitleBand(videoRef.current,stageRef.current,modeRef.current);
        await callbacksRef.current.onCapture(crop);
      }catch(error){
        if(active) callbacksRef.current.onCaptureError?.(error);
      }finally{
        captureInFlightRef.current=false;
        if(active){
          if(!pausedRef.current) setGuideStatus('searching');
          setHint('');
        }
      }
    };
    takeCaptureRef.current=takeCapture;

    const sample=()=>{
      if(!active||captureInFlightRef.current||pausedRef.current||document.visibilityState==='hidden') return;
      const video=videoRef.current;
      const stage=stageRef.current;
      const bounds=stage?.getBoundingClientRect();
      if(!video||!sampleContext||!bounds||!video.videoWidth||!video.videoHeight) return;
      const geometry=getGuideGeometry(bounds.width,bounds.height,modeRef.current);
      const source=mapScreenRectToVideoRect(geometry.frame,bounds.width,bounds.height,video.videoWidth,video.videoHeight);
      if(!source) return;
      sampleCanvas.width=320;
      sampleCanvas.height=Math.max(3,Math.round(source.height*sampleCanvas.width/source.width));
      sampleContext.drawImage(video,source.x,source.y,source.width,source.height,0,0,sampleCanvas.width,sampleCanvas.height);
      const gray=grayPixels(sampleContext,sampleCanvas);
      const metrics=evaluateFrame(gray,sampleCanvas.width,sampleCanvas.height,previousFrameRef.current,{
        frame:{x:0,y:0,width:1,height:1},
        titleBand:GUIDE_CONFIG[modeRef.current].titleBand
      });
      previousFrameRef.current=gray;
      if(!metrics.present) setGuideStatus('searching');
      else setGuideStatus('steadying');
      if(gateRef.current.update(metrics)){
        setHint('');
        void takeCapture();
      }
    };

    const stopSampling=()=>{
      if(interval) window.clearInterval(interval);
      interval=null;
    };
    const startSampling=()=>{
      if(active&&!pausedRef.current&&document.visibilityState!=='hidden'&&stream&&!interval){
        interval=window.setInterval(sample,DETECT_CONFIG.sampleIntervalMs);
      }
    };
    loopControlRef.current={start:startSampling,stop:stopSampling};

    const start=async()=>{
      try{
        stream=await navigator.mediaDevices.getUserMedia({
          video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},
          audio:false
        });
        if(!active){
          stream.getTracks().forEach(track=>track.stop());
          return;
        }
        videoRef.current.srcObject=stream;
        for(const track of stream.getVideoTracks()){
          const focusModes=track.getCapabilities?.().focusMode;
          if(focusModes?.includes('continuous')){
            try{await track.applyConstraints({advanced:[{focusMode:'continuous'}]})}
            catch{setHint('Continuous autofocus is unavailable. Keep the name banner in focus.')}
          }
        }
        await videoRef.current.play();
        if(active){
          setCameraReady(true);
          startSampling();
        }
      }catch(error){
        if(active) setCameraError(`Camera unavailable: ${error.message}`);
      }
    };

    const visibilityChanged=()=>{
      if(document.visibilityState==='hidden') stopSampling();
      else startSampling();
    };
    document.addEventListener('visibilitychange',visibilityChanged);
    void start();
    return()=>{
      active=false;
      takeCaptureRef.current=null;
      loopControlRef.current={start:null,stop:null};
      stopSampling();
      document.removeEventListener('visibilitychange',visibilityChanged);
      stream?.getTracks().forEach(track=>track.stop());
      if(videoRef.current) videoRef.current.srcObject=null;
    };
  },[enabled]);

  useEffect(()=>{
    if(paused) loopControlRef.current.stop?.();
    else loopControlRef.current.start?.();
  },[paused]);

  const geometry=viewport.width&&viewport.height?getGuideGeometry(viewport.width,viewport.height,mode):null;
  const statusClass=guideStatus==='reading'
    ?'border-emerald-400 text-emerald-100 shadow-[0_0_0_9999px_rgba(0,0,0,.58)]'
    :guideStatus==='steadying'
      ?'border-amber-300 text-amber-100 shadow-[0_0_0_9999px_rgba(0,0,0,.58)]'
      :'border-white text-white shadow-[0_0_0_9999px_rgba(0,0,0,.58)]';
  const manualCapture=()=>{
    if(!paused&&!cameraError&&cameraReady&&!captureInFlightRef.current){
      gateRef.current.manualCapture();
      void takeCaptureRef.current?.();
    }
  };

  return <div className="flex min-h-0 flex-1 flex-col">
    {cameraError?<div role="alert" className="m-4 rounded-lg border border-amber-700 bg-amber-950/60 p-4 text-sm text-amber-100">{cameraError}{!window.isSecureContext&&<> <a className="underline" href={secureContextHelp} target="_blank" rel="noreferrer">HTTPS setup instructions</a>.</>}</div>:<>
      <div ref={stageRef} className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover"/>
        {geometry&&<div className={`pointer-events-none absolute box-content border-2 ${statusClass}`} style={{left:geometry.frame.x,top:geometry.frame.y,width:geometry.frame.width,height:geometry.frame.height}}>
          <div className="absolute border border-amber-300/90 bg-amber-300/20" style={{
            left:geometry.titleBand.x-geometry.frame.x,
            top:geometry.titleBand.y-geometry.frame.y,
            width:geometry.titleBand.width,
            height:geometry.titleBand.height
          }}/>
        </div>}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center text-xs font-medium text-white drop-shadow">
          {guideStatus==='reading'?'Reading…':guideStatus==='steadying'?'Hold steady…':'Fit the card in the frame; place its name banner in the highlighted band.'}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 bg-slate-950 p-3">
        <div className="flex overflow-hidden border border-slate-600" role="group" aria-label="Card type">
          <button type="button" aria-pressed={mode==='portrait'} onClick={()=>onModeChange('portrait')} className={`min-h-11 px-4 text-sm ${mode==='portrait'?'bg-indigo-500 text-white':'text-slate-200'}`}>Portrait</button>
          <button type="button" aria-pressed={mode==='legend'} onClick={()=>onModeChange('legend')} className={`min-h-11 px-4 text-sm ${mode==='legend'?'bg-indigo-500 text-white':'text-slate-200'}`}>Legend</button>
          <button type="button" aria-pressed={mode==='landscape'} onClick={()=>onModeChange('landscape')} className={`min-h-11 px-4 text-sm ${mode==='landscape'?'bg-indigo-500 text-white':'text-slate-200'}`}>Battlefield</button>
        </div>
        <button type="button" disabled={paused||Boolean(cameraError)||!cameraReady} onClick={manualCapture} className="min-h-11 rounded-lg bg-indigo-500 px-5 font-semibold disabled:opacity-50">Scan now</button>
      </div>
      {hint&&<div className="px-3 pb-2 text-center text-sm text-amber-200" role="status">{hint}</div>}
    </>}
  </div>;
}
