// Opt-in scanner timing log. Enable on the phone/PC with: localStorage.setItem('scannerDebug','1') (then reload).
// Disable with: localStorage.removeItem('scannerDebug'). Always on in `npm run dev`.
function enabled(){
  try{
    if(import.meta.env.DEV) return true;
    return typeof localStorage!=='undefined'&&localStorage.getItem('scannerDebug')==='1';
  }catch{return false}
}

export function scannerLog(message,details){
  if(!enabled()) return;
  console.debug('[scanner]',message,details??'');
}
