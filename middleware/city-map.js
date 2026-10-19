const { randomInt } = require('node:crypto');
const { shopItems } = require('./shops');
const utcDay = now => new Date(now).toISOString().slice(0,10);
const LOCATIONS = [
 {name:'Casino',href:'/casino',x:59,y:65,group:'Leisure'},
 {name:'Points Building',href:'/points',x:26,y:65,group:'Financial'},
 {name:'City Bank',href:'/bank',x:23,y:72,group:'Financial'},
 {name:'Item Market',href:'/market',x:72,y:35,group:'Shopping'},
 {name:'Gun Shop',href:'/shop?tab=weapons',x:83,y:46,group:'Shopping'},
 {name:'General Store',href:'/shop?tab=items',x:66,y:27,group:'Shopping'},
 {name:'Estate Agents',href:'/property',x:38,y:78,group:'Real Estate'},
 {name:'Gym',href:'/gym',x:17,y:36,group:'Leisure'},
 {name:'Education',href:'/education',x:32,y:29,group:'Administrative'},
 {name:'Hospital',href:'/hospital',x:53,y:42,group:'Administrative'},
 {name:'Jail',href:'/jail',x:44,y:25,group:'Administrative'},
 {name:'Job Listings',href:'/jobs',x:64,y:52,group:'Administrative'},
 {name:'Airport',href:'/airport',x:18,y:16,group:'Miscellaneous'},
 {name:'Factions',href:'/factions',x:87,y:23,group:'Miscellaneous'},
 {name:'Plastic Surgeon',href:'/surgeon',x:56,y:46,group:'Shopping'},
 {name:'Community',href:'/shoutbox',x:80,y:68,group:'Leisure'},
 {name:'Broker',href:'/broker',x:92,y:57,group:'Shopping'},
];
async function dailyFind(store,userId,now=Date.now(),random=randomInt) {
 const day=utcDay(now);
 let find=await store.get('SELECT * FROM city_daily_finds WHERE user_id=? AND day=?',[userId,day]);
 if(!find){
  const spawned=random(100)<35;
  const items=spawned?shopItems():[];
  const item=spawned?items[random(items.length)]:null;
  await store.run('INSERT INTO city_daily_finds (user_id,day,item_type,item_key,x,y) VALUES (?,?,?,?,?,?)',
   [userId,day,item?.type||null,item?.key||null,10+random(80),15+random(65)]);
  find=await store.get('SELECT * FROM city_daily_finds WHERE user_id=? AND day=?',[userId,day]);
 }
 return find;
}
module.exports={LOCATIONS,utcDay,dailyFind};
