const HOMES = [
  {key:'starter',name:'Starter apartment',price:0,capacity:96,description:'Your first address in Lock down. A practical place to build a life.',icon:'🏠'},
  {key:'townhouse',name:'Townhouse',price:25000,capacity:120,description:'A quiet street, more room and a place to make your own.',icon:'🏘️'},
  {key:'penthouse',name:'City penthouse',price:250000,capacity:180,description:'City views and space for your growing collection.',icon:'🏙️'},
  {key:'villa',name:'Private villa',price:2500000,capacity:240,description:'A spacious home with room for your finest furnishings.',icon:'🏡'},
  {key:'estate',name:'Grand estate',price:25000000,capacity:400,description:'A landmark address for a citizen who has made it.',icon:'🏰'},
];
async function homeState(tx,userId) {
  await tx.run("INSERT OR IGNORE INTO owned_homes (user_id,home_key,active) SELECT ?,'starter',CASE WHEN EXISTS(SELECT 1 FROM owned_homes WHERE user_id=? AND active=1) THEN 0 ELSE 1 END",[userId,userId]);
  const owned=await tx.all('SELECT * FROM owned_homes WHERE user_id=?',[userId]);
  const active=HOMES.find(h=>owned.some(o=>o.home_key===h.key && o.active))||HOMES[0];
  const furnishings=await tx.all('SELECT * FROM cell_amenities WHERE user_id=? ORDER BY id',[userId]);
  return {owned,active,furnishings};
}
module.exports={HOMES,homeState};
