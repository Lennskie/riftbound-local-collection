export function listCards(db,{q='',set='',limit=60,offset=0}={}){
  const cards=db.prepare(`SELECT p.*,d.type_line FROM card_printings p
    JOIN card_definitions d ON d.definition_key=p.definition_key
    WHERE p.is_active=1
      AND (?='' OR p.card_name LIKE '%'||?||'%' OR d.card_name LIKE '%'||?||'%' OR p.definition_key LIKE '%'||?||'%')
      AND (?='' OR p.set_code=?)
    ORDER BY p.set_code,p.collector_num,p.card_name LIMIT ? OFFSET ?`).all(q,q,q,q,set,set,limit,offset);
  const sets=db.prepare(`SELECT set_code,set_label,COUNT(*) count FROM card_printings
    WHERE is_active=1 GROUP BY set_code,set_label ORDER BY set_code`).all();
  return {cards,sets};
}