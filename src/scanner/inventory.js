export async function addInventoryCard(containerId,card){
  const response=await fetch(`/api/containers/${encodeURIComponent(containerId)}/inventory/bulk`,{
    method:'POST',
    cache:'no-store',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({cards:[card]})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(result.error||`HTTP ${response.status}`);
  return result;
}
