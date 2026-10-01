function requestError(message,status=400){
  const error=new Error(message);
  error.status=status;
  return error;
}

export function replaceBlueprint(db,containerId,requirements){
  if(!Array.isArray(requirements))throw requestError('requirements must be an array');
  const container=db.prepare('SELECT type FROM containers WHERE container_id=?').get(containerId);
  if(!container)throw requestError('Container not found',404);
  if(!['premade','custom'].includes(container.type)){
    throw requestError('Blueprints require a premade or custom deck container');
  }

  const findDefinition=db.prepare('SELECT 1 FROM card_definitions WHERE definition_key=?');
  for(const row of requirements){
    if(!row||typeof row.definition_key!=='string'||!row.definition_key.trim()){
      throw requestError('definition_key is required');
    }
    if(!Number.isInteger(row.required_quantity)||row.required_quantity<=0){
      throw requestError('required_quantity must be a positive integer');
    }
    if(!findDefinition.get(row.definition_key)){
      throw requestError(`Unknown definition: ${row.definition_key}`);
    }
  }

  const replace=db.transaction(()=>{
    db.prepare('DELETE FROM premade_blueprints WHERE container_id=?').run(containerId);
    const insert=db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)');
    for(const row of requirements)insert.run(containerId,row.definition_key,row.required_quantity);
  });
  replace();
  return {ok:true};
}