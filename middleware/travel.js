// Visits do not change users.prison_id. All trip, cargo and delivery writes use a transaction.
const ROUTES = [
  { id:1, name:'Lockdown City', subtitle:'Your home trading network', minutes:2, fare:80, stockLabel:'Tokens & patches', color:'#8fae88', x:39, y:39 },
  { id:2, name:'London', subtitle:'The Thames connection', minutes:3, fare:120, stockLabel:'Stamps & sea glass', color:'#86adb9', x:18, y:51 },
  { id:3, name:"Tokyo", subtitle:'The Pacific connection', minutes:6, fare:220, stockLabel:'Talismans & orchids', color:'#aaa27b', x:68, y:72 },
  { id:4, name:'Dubai', subtitle:'The desert luxury market', minutes:9, fare:350, stockLabel:'Cards & timepieces', color:'#c2a185', x:23, y:35 },
  { id:5, name:'Cape Town', subtitle:'The Cape trading route', minutes:12, fare:500, stockLabel:'Feathers & insignia', color:'#a89cbb', x:26, y:18 },
];
const GOODS = [
  { key:'buckeye_token', name:'City Token', prison:1, buy:20, sell:50, stock:16, symbol:'◈', desc:'A worn brass token passed between traders in Lockdown City.' },
  { key:'block_c_patch', name:'Street Crew Patch', prison:1, buy:45, sell:100, stock:5, symbol:'▣', desc:'An embroidered patch bearing the mark of a local street crew.' },
  { key:'island_stamp', name:'London Stamp', prison:2, buy:35, sell:85, stock:16, symbol:'▧', desc:'A cancelled postage stamp from the London exchange.' },
  { key:'sea_glass_charm', name:'Thames Glass Charm', prison:2, buy:80, sell:165, stock:5, symbol:'◇', desc:'Polished Thames glass threaded onto a leather cord.' },
  { key:'carved_talisman', name:'Tokyo Talisman', prison:3, buy:60, sell:145, stock:14, symbol:'◉', desc:'A hand-carved wooden talisman from a Tokyo artisan market.' },
  { key:'jungle_orchid', name:'Pressed Sakura', prison:3, buy:120, sell:250, stock:4, symbol:'✿', desc:'A carefully pressed cherry blossom in an archival sleeve.' },
  { key:'golden_gate_card', name:'Dubai Skyline Card', prison:4, buy:90, sell:205, stock:12, symbol:'▤', desc:'A numbered postcard showing the Dubai skyline.' },
  { key:'workshop_timepiece', name:'Desert Timepiece', prison:4, buy:180, sell:375, stock:4, symbol:'◷', desc:'A brass pocket watch from the desert workshop.' },
  { key:'black_feather', name:'Cape Feather', prison:5, buy:140, sell:310, stock:10, symbol:'⌁', desc:'A glossy feather sealed inside a Cape Town keepsake.' },
  { key:'pelican_insignia', name:'Cape Town Insignia', prison:5, buy:260, sell:550, stock:3, symbol:'✦', desc:'A rare metal insignia from a Cape Town workshop.' },
];
const TRAVEL_ITEMS = Object.fromEntries(GOODS.map(g=>[g.key,{...g,img:'/amenities/default.png'}]));
const BAGS = [
  { level:0, name:'Standard bag', capacity:6, cost:0, trips:0 },
  { level:1, name:'Courier holdall', capacity:10, cost:2500, trips:3 },
  { level:2, name:'Freight duffel', capacity:16, cost:10000, trips:10 },
];
const RESTOCK_SECONDS = 900;
const nowSeconds = () => Math.floor(Date.now()/1000);
const wholeNumber = value => (typeof value==='number' || typeof value==='string') && String(value).trim()!=='' && Number.isSafeInteger(Number(value)) ? Number(value) : NaN;
async function addInventory(store, userId, key, qty) {
  // Legacy inventory tables may lack the UNIQUE constraint from fresh installs.
  const row = await store.get("SELECT id FROM inventory WHERE user_id=? AND item_key=? AND item_type='collectible' ORDER BY id LIMIT 1",[userId,key]);
  if (row) await store.run('UPDATE inventory SET quantity=quantity+? WHERE id=?',[qty,row.id]);
  else await store.run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,?,'collectible',?)",[userId,key,qty]);
}
async function takeInventory(store,userId,key,qty) {
  const rows=await store.all("SELECT id,quantity FROM inventory WHERE user_id=? AND item_key=? AND item_type='collectible' AND quantity>0 ORDER BY id",[userId,key]);
  if (rows.reduce((sum,r)=>sum+r.quantity,0)<qty) return false;
  let left=qty;
  for (const row of rows) {
    const take=Math.min(left,row.quantity);
    if (take===row.quantity) await store.run('DELETE FROM inventory WHERE id=?',[row.id]);
    else await store.run('UPDATE inventory SET quantity=quantity-? WHERE id=?',[take,row.id]);
    left-=take; if (!left) break;
  }
  return true;
}
async function receiveCollectible(store,userId,key,quantity,now=nowSeconds()) {
  await addInventory(store,userId,key,quantity);
  await store.run(`INSERT INTO travel_discoveries (user_id,item_key,first_found,total_brought) VALUES (?,?,?,?)
    ON CONFLICT(user_id,item_key) DO UPDATE SET total_brought=total_brought+excluded.total_brought`,[userId,key,now,quantity]);
}
async function settleTravel(userId, store, now=nowSeconds()) {
  let trip=await store.get('SELECT * FROM travel_trips WHERE user_id=? AND completed_at IS NULL',[userId]);
  if (!trip) return {phase:'home', trip:null, now};
  if (trip.status==='outbound' && now>=trip.arrives_at) {
    await store.run("UPDATE travel_trips SET status='visiting' WHERE id=?",[trip.id]);
    trip.status='visiting';
  }
  if (trip.status==='returning' && now>=trip.return_arrives_at) {
    const cargo=await store.all('SELECT * FROM travel_cargo WHERE trip_id=?',[trip.id]);
    for (const row of cargo) {
      await receiveCollectible(store,userId,row.item_key,row.quantity,now);
    }
    await store.run("UPDATE travel_trips SET status='complete',completed_at=? WHERE id=?",[now,trip.id]);
    await store.run('INSERT INTO travel_progress (user_id,trips_completed) VALUES (?,1) ON CONFLICT(user_id) DO UPDATE SET trips_completed=trips_completed+1',[userId]);
    const quantity=cargo.reduce((sum,row)=>sum+row.quantity,0);
    await store.run("INSERT INTO events (user_id,type,message) VALUES (?,'travel',?)",[userId,`Back from ${ROUTES.find(r=>r.id===trip.destination_id)?.name || 'your trip'} with ${quantity} collectibles. Cargo delivered to your inventory.`]);
    return {phase:'home',trip:null,now};
  }
  return {phase:trip.status,trip,now};
}
function statusSummary(state) {
  return {phase:state.phase,destination:state.trip?.destination_id || null,origin:state.trip?.origin_id || null,arrivesAt:state.phase==='returning'?state.trip.return_arrives_at:state.trip?.arrives_at || 0};
}
async function getTravelPage(userId,store) {
  const state=await settleTravel(userId,store);
  const progress=await store.get('SELECT * FROM travel_progress WHERE user_id=?',[userId]) || {bag_level:0,trips_completed:0,sales_cash:0,collection_claimed:0};
  const discoveries=await store.all('SELECT * FROM travel_discoveries WHERE user_id=?',[userId]);
  const inventory=await store.all("SELECT item_key,SUM(quantity) AS quantity FROM inventory WHERE user_id=? AND item_type='collectible' GROUP BY item_key",[userId]);
  const cargo=state.trip ? await store.all('SELECT * FROM travel_cargo WHERE trip_id=?',[state.trip.id]):[];
  const history=await store.all('SELECT destination_id,completed_at FROM travel_trips WHERE user_id=? AND completed_at IS NOT NULL ORDER BY id DESC LIMIT 5',[userId]);
  const stock=[];
  for (const good of GOODS) {
    const restockAt=state.now+RESTOCK_SECONDS-state.now%RESTOCK_SECONDS;
    await store.run('INSERT OR IGNORE INTO travel_stock (item_key,quantity,restock_at) VALUES (?,?,?)',[good.key,good.stock,restockAt]);
    await store.run('UPDATE travel_stock SET quantity=?,restock_at=? WHERE item_key=? AND restock_at<=?',[good.stock,restockAt,good.key,state.now]);
    stock.push(await store.get('SELECT * FROM travel_stock WHERE item_key=?',[good.key]));
  }
  const revision=JSON.stringify([state.trip?.id,progress.bag_level,progress.trips_completed,progress.sales_cash,progress.collection_claimed,cargo.map(r=>[r.item_key,r.quantity]),discoveries.length,inventory.map(r=>[r.item_key,r.quantity])]);
  return {...state,progress,discoveries,inventory,cargo,history,stock,revision,bag:BAGS[progress.bag_level] || BAGS[0],nextBag:BAGS[(progress.bag_level || 0)+1] || null};
}
// Serialize one player's mutations across legacy and new routes, then check location.
// This prevents a gym/bank request from slipping through a concurrent departure.
const playerLocks=new Map();
function travelGate({withTransaction}) {
  return async (req,res,next) => {
    const id=req.session?.userId;
    if (!id || req.method!=='POST') return next();
    const previous=playerLocks.get(id) || Promise.resolve();
    let release;
    const lock=new Promise(resolve=>{release=resolve;});
    const tail=previous.then(()=>lock);
    playerLocks.set(id,tail);
    await previous;
    let finished=false;
    const finish=()=>{if(finished)return;finished=true;release();if(playerLocks.get(id)===tail)playerLocks.delete(id);};
    res.once('finish',finish);res.once('close',finish);
    if(res.destroyed){finish();return;}
    try {
      const state=await withTransaction(tx=>settleTravel(id,tx));
      const allowed=['/yard/depart','/yard/buy','/yard/return','/yard/sell','/yard/upgrade','/yard/collection','/mail/send'];
      if(state.phase!=='home' && !allowed.includes(req.path)) return res.json({error:'You are away on a city trip. Return home before using this feature.',travel:statusSummary(state)});
      next();
    } catch(err) { finish();next(err); }
  };
}
module.exports={ROUTES,GOODS,TRAVEL_ITEMS,BAGS,RESTOCK_SECONDS,wholeNumber,addInventory,receiveCollectible,takeInventory,settleTravel,statusSummary,getTravelPage,travelGate};
