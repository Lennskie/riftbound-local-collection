export function zoneForCard(typeLine,requestedZone,containerType){
  const type=String(typeLine||'').toLowerCase();
  if(containerType==='bulk'||type.includes('rune')||type.includes('legend')||type.includes('battlefield')) return 'main';
  return requestedZone==='sideboard'?'sideboard':'main';
}
