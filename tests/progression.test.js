const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const net = require('node:net');
const sqlite3 = require('sqlite3');

const root = path.resolve(__dirname, '..');
const temporary = mkdtempSync(path.join(os.tmpdir(), 'lockdown-progression-'));
const databasePath = path.join(temporary, 'test.db');
let server, connection, origin, accountNumber = 0;
const query = (sql, params = []) => new Promise((resolve, reject) => connection.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
const run = (sql, params = []) => new Promise((resolve, reject) => connection.run(sql, params, err => err ? reject(err) : resolve()));

async function start(random = 0.99) {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['-e', `Math.random = () => ${random}; require('./server.js');`], {
    cwd: root, env: { ...process.env, DB_PATH: databasePath, PORT: String(port), SESSION_SECRET: 'local-test-session-secret' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', data => output += data);
  server.stderr.on('data', data => output += data);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    try { if ((await fetch(origin + '/login')).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  throw new Error(`Server did not start: ${output}`);
}
async function stop() {
  if (server && server.exitCode === null) { server.kill(); await once(server, 'exit'); }
}
async function account() {
  const username = 'progression_' + (++accountNumber);
  const response = await fetch(origin + '/register', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password: 'test-password', confirm: 'test-password' }), redirect: 'manual' });
  assert.equal(response.status, 302);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const row = await query('SELECT id FROM users WHERE username=?', [username]);
  return { id: row.id, cookie, username };
}
async function post(user, url, body = {}) {
  const response = await fetch(origin + url, { method: 'POST', headers: { Cookie: user.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200, `Unexpected status from ${url}`);
  return response.json();
}
async function stats(user) { return query('SELECT * FROM users WHERE id=?', [user.id]); }
const today = () => new Date().toISOString().slice(0, 10);

before(async () => {
  await start();
  connection = new sqlite3.Database(databasePath);
  connection.configure('busyTimeout', 5000);
});
after(async () => {
  await stop();
  if (connection) await new Promise(resolve => connection.close(resolve));
  rmSync(temporary, { recursive: true, force: true });
});

test('mastery and gym tiers respect thresholds and caps', async () => {
  // The default DB module is loaded only for these pure helpers and uses the isolated DB.
  process.env.DB_PATH = databasePath;
  const { getMastery, getGymProgress } = require('../middleware/progression');
  assert.equal(getMastery({ successes: 9 }).level, 1);
  assert.equal(getMastery({ successes: 10 }).level, 2);
  const capped = getMastery({ successes: 1000 }, { catch_chance: 20 }, 1000);
  assert.equal(capped.level, 10); assert.equal(capped.rewardBonus, 18); assert.equal(capped.catchChance, 5); assert.equal(capped.progress, 100);
  assert.equal(getGymProgress(99).multiplier, 1);
  assert.equal(getGymProgress(100).multiplier, 1.2);
  assert.equal(getGymProgress(500).multiplier, 1.4);
  assert.equal(getGymProgress(1500).nextGym, null);
  // Close the helper module's otherwise unused connection.
  await new Promise(resolve => require('../middleware/db').db.close(resolve));
});

test('dashboard, gym, crimes, and existing destinations render for a new account', async () => {
  const user = await account();
  for (const url of ['/prison', '/crimes', '/gym', '/education', '/bank', '/market', '/battles', '/jobs', '/gangs', '/inventory', '/account', '/cell', '/equipment', '/events', '/mail', '/prison/infirmary', '/surgeon', '/isolation', '/hitlist', '/warden', '/prison/yard', '/most-wanted', '/transport', '/openmarket', '/send-money', '/inmates', '/logs', '/shoutbox', '/my-gang', '/gang-invites']) {
    const response = await fetch(origin + url, { headers: { Cookie: user.cookie } });
    const html = await response.text();
    assert.equal(response.status, 200, url + ": " + html.replace(/<[^>]*>/g, "").slice(0, 350));
    assert.match(html, /<!DOCTYPE html>/i);
  }
});

test('crime restriction, zero stamina, and isolation block spending and progress', async () => {
  const user = await account();
  assert.match((await post(user, '/crimes/commit', { crime_key: 'warden_heist' })).error, /not available/);
  await run('UPDATE users SET stamina=0 WHERE id=?', [user.id]);
  assert.match((await post(user, '/crimes/commit', { crime_key: 'pickpocket' })).error, /stamina/);
  await run('UPDATE users SET stamina=100,in_jail=1,jail_until=? WHERE id=?', [Math.floor(Date.now() / 1000) + 600, user.id]);
  assert.match((await post(user, '/crimes/commit', { crime_key: 'pickpocket' })).error, /jail/);
  assert.equal((await stats(user)).nerve, 5);
  assert.equal(await query('SELECT * FROM crime_mastery WHERE user_id=?', [user.id]), undefined);
});

test('successful crimes advance mastery and daily goals with the displayed cash bonus', async () => {
  const user = await account();
  await run("INSERT INTO crime_mastery VALUES (?,'pickpocket',9,9)", [user.id]);
  const first = await post(user, '/crimes/commit', { crime_key: 'pickpocket' });
  assert.equal(first.caught, false); assert.equal(first.mastery.level, 2); assert.equal(first.mastery.successes, 10);
  assert.equal(first.user.nerve, 3); assert.equal(first.user.stamina, 97);
  const second = await post(user, '/crimes/commit', { crime_key: 'pickpocket' });
  assert.equal(second.cashGain, Math.floor(first.cashGain * 1.02));
  const progress = await query('SELECT * FROM daily_progress WHERE user_id=? AND day=?', [user.id, today()]);
  assert.equal(progress.crimes, 2);
  assert.equal((await stats(user)).cash, 500 + first.cashGain + second.cashGain);
});

test('parallel crime requests spend the same nerve pool once', async () => {
  const user = await account();
  await run('UPDATE users SET nerve=2 WHERE id=?', [user.id]);
  const results = await Promise.all([post(user, '/crimes/commit', { crime_key: 'pickpocket' }), post(user, '/crimes/commit', { crime_key: 'pickpocket' })]);
  assert.equal(results.filter(result => !result.error).length, 1);
  assert.equal((await stats(user)).nerve, 0);
  assert.equal((await query('SELECT attempts FROM crime_mastery WHERE user_id=?', [user.id])).attempts, 1);
});

test('training rejects invalid amounts and spends exact stamina and energy', async () => {
  const user = await account();
  for (const amount of [0, -1, 1.5, 'abc', null, true, 1000]) assert.ok((await post(user, '/gym/train', { stat: 'strength', energy_amount: amount })).error);
  assert.ok((await post(user, '/gym/train', { stat: 'cash', energy_amount: 1 })).error);
  await run('UPDATE users SET stamina=3 WHERE id=?', [user.id]);
  assert.match((await post(user, '/gym/train', { stat: 'strength', energy_amount: 2 })).error, /stamina/);
  const result = await post(user, '/gym/train', { stat: 'strength', energy_amount: 1 });
  assert.equal(result.gain, 2); assert.equal(result.user.stamina, 1); assert.equal(result.user.energy, 9);
  assert.equal(result.gym.energySpent, 1);
  assert.equal((await query('SELECT training FROM daily_progress WHERE user_id=?', [user.id])).training, 1);
});

test('gym unlocks apply to the following session and history survives updates', async () => {
  const user = await account();
  await run('INSERT INTO gym_progress VALUES (?,99)', [user.id]);
  const unlock = await post(user, '/gym/train', { stat: 'defense', energy_amount: 1 });
  assert.equal(unlock.gain, 2); assert.equal(unlock.unlockedGym, 'Iron Works');
  const result = await post(user, '/gym/train', { stat: 'defense', energy_amount: 5 });
  assert.equal(result.gain, 12); assert.equal(result.gym.energySpent, 105);
  assert.equal(result.historyEntry.defense, result.user.defense);
});

test('parallel training cannot spend energy twice', async () => {
  const user = await account();
  await run('UPDATE users SET energy=1 WHERE id=?', [user.id]);
  const results = await Promise.all([post(user, '/gym/train', { stat: 'speed', energy_amount: 1 }), post(user, '/gym/train', { stat: 'speed', energy_amount: 1 })]);
  assert.equal(results.filter(result => !result.error).length, 1);
  assert.equal((await stats(user)).energy, 0);
});

test('daily reward requires both goals and pays once under concurrent requests', async () => {
  const user = await account();
  assert.match((await post(user, '/daily/claim')).error, /Complete/);
  await run('INSERT INTO daily_progress (user_id,day,crimes,training) VALUES (?,?,3,2)', [user.id, today()]);
  const results = await Promise.all([post(user, '/daily/claim'), post(user, '/daily/claim')]);
  assert.equal(results.filter(result => !result.error).length, 1);
  assert.equal((await stats(user)).cash, 1000); assert.equal((await stats(user)).rep, 3);
  assert.match((await post(user, '/daily/claim')).error, /already claimed/);
});

test('yesterday’s daily progress does not unlock today’s reward', async () => {
  const user = await account();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await run('INSERT INTO daily_progress (user_id,day,crimes,training,claimed) VALUES (?,?,3,2,1)', [user.id, yesterday]);
  assert.match((await post(user, '/daily/claim')).error, /Complete/);
  assert.equal((await stats(user)).cash, 500);
});

test('level-ups persist base stats and never permanently stack cell bonuses', async () => {
  const user = await account();
  await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'three_musketeers',1)", [user.id]);
  await run('UPDATE users SET xp=95 WHERE id=?', [user.id]);
  const result = await post(user, '/gym/train', { stat: 'strength', energy_amount: 1 });
  assert.equal(result.user.level, 2); assert.equal(result.user.strength, 17);
  const row = await stats(user);
  assert.equal(row.level, 2); assert.equal(row.strength, 14); assert.equal(row.xp, 10);
  const response = await fetch(origin + '/api/stats', { headers: { Cookie: user.cookie } });
  assert.equal((await response.json()).strength, 17);
  await post(user, '/gym/train', { stat: 'defense', energy_amount: 1 });
  assert.equal((await stats(user)).strength, 14);
});

test('full pools cannot bank elapsed time; partial pools keep fractional recovery time', async () => {
  const user = await account();
  const now = Math.floor(Date.now() / 1000);
  await run('UPDATE users SET energy_last_regen=?,nerve_last_regen=?,stamina_last_regen=? WHERE id=?', [now - 86400, now - 86400, now - 86400, user.id]);
  await post(user, '/gym/train', { stat: 'strength', energy_amount: 1 });
  const response = await fetch(origin + '/api/stats', { headers: { Cookie: user.cookie } });
  const row = await response.json();
  assert.equal(row.energy, 9); assert.equal(row.stamina, 98);
  await run('UPDATE users SET energy=3,energy_last_regen=? WHERE id=?', [now - 650, user.id]);
  const regenerated = await (await fetch(origin + '/api/stats', { headers: { Cookie: user.cookie } })).json();
  assert.equal(regenerated.energy, 5);
  assert.equal((await stats(user)).energy_last_regen, now - 50);
});

test('an error rolls back spending, rewards, and progress together', async () => {
  const user = await account();
  await run("CREATE TRIGGER reject_mastery BEFORE INSERT ON crime_mastery BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  try {
    const response = await fetch(origin + '/crimes/commit', { method: 'POST', headers: { Cookie: user.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ crime_key: 'pickpocket' }) });
    assert.equal(response.status, 500);
    const row = await stats(user);
    assert.equal(row.nerve, 5); assert.equal(row.cash, 500); assert.equal(row.stamina, 100);
    assert.equal(await query('SELECT * FROM daily_progress WHERE user_id=?', [user.id]), undefined);
  } finally { await run('DROP TRIGGER reject_mastery'); }
});

test('caught crimes cost resources, record the attempt, and block more actions', async () => {
  await stop(); await start(0.01);
  const user = await account();
  const result = await post(user, '/crimes/commit', { crime_key: 'pickpocket' });
  assert.equal(result.caught, true); assert.equal(result.user.in_jail, 1);
  assert.equal(result.mastery.attempts, 1); assert.equal(result.mastery.successes, 0); assert.equal(result.user.nerve, 3);
  assert.match((await post(user, '/gym/train', { stat: 'speed', energy_amount: 1 })).error, /jail/);
  assert.match((await post(user, '/crimes/commit', { crime_key: 'pickpocket' })).error, /jail/);
});

test('mastery, gym unlocks, daily claims, and levels persist across restart', async () => {
  const user = await account();
  await run("INSERT INTO crime_mastery VALUES (?,'pickpocket',10,10)", [user.id]);
  await run('INSERT INTO gym_progress VALUES (?,500)', [user.id]);
  await run('INSERT INTO daily_progress (user_id,day,crimes,training,claimed) VALUES (?,?,3,2,1)', [user.id, today()]);
  await run('UPDATE users SET level=2 WHERE id=?', [user.id]);
  await stop(); await start();
  const login = await fetch(origin + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: user.username, password: 'test-password' }), redirect: 'manual' });
  user.cookie = login.headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(origin + '/gym', { headers: { Cookie: user.cookie } })).text();
  assert.match(html, /The Foundry/);
  assert.equal((await stats(user)).level, 2);
  assert.equal((await query('SELECT successes FROM crime_mastery WHERE user_id=?', [user.id])).successes, 10);
  assert.match((await post(user, '/daily/claim')).error, /already claimed/);
});

test('bank deposits and daily rewards preserve each other under concurrency', async () => {
  const user = await account();
  await run('INSERT INTO daily_progress (user_id,day,crimes,training) VALUES (?,?,3,2)', [user.id, today()]);
  const results = await Promise.all([post(user, '/bank/deposit', { amount: 200 }), post(user, '/daily/claim')]);
  assert.ok(results.every(result => !result.error));
  const row = await stats(user);
  assert.equal(row.cash, 800); assert.equal(row.bank, 200); assert.equal(row.rep, 3);
  for (const amount of [0, -1, 1.5, true]) assert.ok((await post(user, '/bank/withdraw', { amount })).error);
});

test('stats polling cannot restore resources spent by a parallel crime', async () => {
  const user = await account();
  const requests = [post(user, '/crimes/commit', { crime_key: 'pickpocket' })];
  for (let i = 0; i < 5; i++) requests.push(fetch(origin + '/api/stats', { headers: { Cookie: user.cookie } }));
  await Promise.all(requests);
  assert.equal((await stats(user)).nerve, 3);
  assert.equal((await stats(user)).stamina, 97);
});

test('capped cell stamina bonuses do not drain base stamina on an unrelated action', async () => {
  const user = await account();
  await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'four_leaf_clover',1)", [user.id]);
  await post(user, '/bank/deposit', { amount: 1 });
  assert.equal((await stats(user)).stamina, 100);
});

test('older databases automatically gain the missing stamina recovery column', async () => {
  const user = await account();
  await stop();
  await run('ALTER TABLE users DROP COLUMN stamina_last_regen');
  await start();
  const login = await fetch(origin + '/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username: user.username, password: 'test-password' }), redirect: 'manual' });
  user.cookie = login.headers.get('set-cookie').split(';')[0];
  const response = await fetch(origin + '/api/stats', { headers: { Cookie: user.cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).stamina, 100);
  assert.ok((await stats(user)).stamina_last_regen > 0);
});

test('live chat uses the logged-in identity and persists messages without crashing', async () => {
  const user = await account();
  const handshake = await fetch(origin + '/socket.io/?EIO=4&transport=polling', { headers: { Cookie: user.cookie } });
  const sid = JSON.parse((await handshake.text()).slice(1)).sid;
  const transport = origin + '/socket.io/?EIO=4&transport=polling&sid=' + encodeURIComponent(sid);
  const send = body => fetch(transport, { method: 'POST', headers: { Cookie: user.cookie, 'Content-Type': 'text/plain' }, body });
  await send('40');
  await (await fetch(transport, { headers: { Cookie: user.cookie } })).text();
  await send('42["auth",{"userId":999999,"username":"Impersonated"}]');
  const online = await (await fetch(transport, { headers: { Cookie: user.cookie } })).text();
  assert.match(online, /online_count/);
  await send('42["shout",{"message":"Synthetic gameplay test"}]');
  const message = await (await fetch(transport, { headers: { Cookie: user.cookie } })).text();
  assert.match(message, /Synthetic gameplay test/); assert.match(message, new RegExp(user.username));
  assert.doesNotMatch(message, /Impersonated/);
  const row = await query('SELECT * FROM shoutbox WHERE user_id=?', [user.id]);
  assert.equal(row.message, 'Synthetic gameplay test'); assert.equal(row.username, user.username);
  await send('1');
});

test('crime approaches trade cash for risk and reject invalid input without spending', async () => {
  const cautious = await account(), balanced = await account(), bold = await account();
  const a = await post(cautious, '/crimes/commit', { crime_key:'pickpocket', approach:'cautious' });
  const b = await post(balanced, '/crimes/commit', { crime_key:'pickpocket', approach:'balanced' });
  const c = await post(bold, '/crimes/commit', { crime_key:'pickpocket', approach:'bold' });
  assert.equal(a.risk, 12); assert.equal(b.risk, 20); assert.equal(c.risk, 32);
  assert.equal(a.cashGain, Math.floor(b.cashGain * 0.75));
  assert.equal(c.cashGain, Math.floor(b.cashGain * 1.5));
  assert.equal(a.user.heat, 3); assert.equal(b.user.heat, 6); assert.equal(c.user.heat, 12);
  const invalid = await account();
  assert.match((await post(invalid, '/crimes/commit', { crime_key:'pickpocket', approach:'__proto__' })).error, /valid/);
  assert.equal((await stats(invalid)).nerve, 5);
});

test('heat cools offline, survives polling, caps at 100 and affects risk with course perks', async () => {
  const user = await account();
  const now = Math.floor(Date.now()/1000);
  await run('INSERT INTO player_dynamics VALUES (?,?,?)', [user.id, 95, now - 600]);
  const read = () => fetch(origin + '/api/stats', { headers:{Cookie:user.cookie} }).then(r=>r.json());
  assert.equal((await read()).heat, 85); assert.equal((await read()).heat, 85);
  await run("INSERT INTO education VALUES (?,'streetcraft',0,1,2)", [user.id]);
  const first = await post(user, '/crimes/commit', { crime_key:'pickpocket', approach:'bold' });
  assert.equal(first.risk, 46); assert.equal(first.user.heat, 97);
  const second = await post(user, '/crimes/commit', { crime_key:'pickpocket', approach:'bold' });
  assert.equal(second.user.heat, 100);
  assert.equal((await query('SELECT heat FROM player_dynamics WHERE user_id=?', [user.id])).heat, 100);
});

test('course enrollment enforces cash, prerequisites, recovery and one active course under concurrency', async () => {
  const user = await account();
  assert.match((await post(user, '/education/start', {course_key:'conditioning'})).error, /Need/);
  await run('UPDATE users SET cash=10000 WHERE id=?', [user.id]);
  assert.match((await post(user, '/education/start', {course_key:'sports_science'})).error, /prerequisite/);
  const results = await Promise.all(['conditioning','streetcraft'].map(course_key=>post(user, '/education/start', {course_key})));
  assert.equal(results.filter(r=>!r.error).length, 1); assert.equal((await stats(user)).cash, 9000);
  const row = await query('SELECT * FROM education WHERE user_id=?', [user.id]);
  assert.ok(row.finishes_at > row.started_at); assert.equal(row.completed_at, null);
  assert.match((await post(user, '/education/complete', {course_key:row.course_key})).error, /in progress/);
  const jailed = await account();
  await run('UPDATE users SET cash=5000,in_jail=1,jail_until=? WHERE id=?', [Math.floor(Date.now()/1000)+600,jailed.id]);
  assert.match((await post(jailed, '/education/start', {course_key:'streetcraft'})).error, /jail/);
});

test('a course perk is collected once, improves training and unlocks the next course', async () => {
  const user = await account();
  await run('UPDATE users SET cash=10000,xp_needed=100000 WHERE id=?', [user.id]);
  await post(user, '/education/start', {course_key:'conditioning'});
  await run('UPDATE education SET finishes_at=1 WHERE user_id=?', [user.id]);
  const results = await Promise.all([post(user, '/education/complete', {course_key:'conditioning'}),post(user, '/education/complete', {course_key:'conditioning'})]);
  assert.equal(results.filter(r=>!r.error).length,1);
  const train=await post(user, '/gym/train', {stat:'defense',energy_amount:5});
  assert.equal(train.user.perks.training,10); assert.equal(train.gain,11);
  assert.ok(!(await post(user, '/education/start', {course_key:'sports_science'})).error);
  assert.equal((await stats(user)).cash,4000);
});

test('logistics course improves cash without modifying mastery', async () => {
  const plain=await account(), educated=await account();
  await run("INSERT INTO education VALUES (?,'streetcraft',0,1,2)",[educated.id]);
  await run("INSERT INTO education VALUES (?,'logistics',2,3,4)",[educated.id]);
  const a=await post(plain,'/crimes/commit',{crime_key:'pickpocket'});
  const b=await post(educated,'/crimes/commit',{crime_key:'pickpocket'});
  assert.equal(b.cashGain,Math.floor(a.cashGain*1.1)); assert.equal(b.mastery.level,1);
});

test('owned equipment improves effective stats without becoming permanent after training or level-up', async () => {
  const user=await account();
  await run("INSERT INTO inventory (user_id,item_key,item_type) VALUES (?,'blade','weapon')",[user.id]);
  const equip=await post(user,'/equipment/equip',{action:'equip',slot:'weapon',key:'blade'});
  assert.equal(equip.user.strength,22); assert.equal(equip.user.speed,11);
  await post(user,'/gym/train',{stat:'strength',energy_amount:1});
  await post(user,'/bank/deposit',{amount:1});
  assert.equal((await stats(user)).strength,12); assert.equal((await stats(user)).speed,8);
  await run('UPDATE users SET xp=99 WHERE id=?',[user.id]);
  await post(user,'/gym/train',{stat:'defense',energy_amount:1});
  assert.equal((await stats(user)).strength,14);
  const unequip=await post(user,'/equipment/equip',{action:'unequip',slot:'weapon'});
  assert.equal(unequip.user.strength,14); assert.equal(unequip.user.speed,9);
  assert.match((await post(user,'/equipment/equip',{action:'equip',slot:'armor',key:'exo_suit'})).error,/own/);
});

test('equipment bonuses vanish when ownership is lost and maximum HP clamps persist', async () => {
  const user=await account();
  await run("INSERT INTO inventory (user_id,item_key,item_type) VALUES (?,'bullet_proof_vest','armor')",[user.id]);
  await post(user,'/equipment/equip',{action:'equip',slot:'armor',key:'bullet_proof_vest'});
  await run('UPDATE users SET hp=120 WHERE id=?',[user.id]);
  await post(user,'/inventory/drop',{item_key:'bullet_proof_vest',item_type:'armor'});
  const read=await (await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
  assert.equal(read.defense,8); assert.equal(read.max_hp,100); assert.equal(read.hp,100);
  assert.equal((await stats(user)).hp,100); assert.equal((await stats(user)).max_hp,100);
});

async function combatPair(attackerValues='strength=500,defense=100,speed=100') {
  const attacker=await account(), defender=await account();
  await run(`UPDATE users SET ${attackerValues},xp_needed=100000 WHERE id=?`,[attacker.id]);
  await run('UPDATE users SET cash=1000,xp_needed=100000 WHERE id=?',[defender.id]);
  return {attacker,defender};
}
test('combat endings pay distinct rewards and preserve cash and actual surviving HP', async () => {
  for (const ending of ['mug','leave','hospitalize']) {
    const {attacker,defender}=await combatPair();
    const result=await post(attacker,'/battles/attack',{target_id:defender.id,ending,stance:'aggressive'});
    assert.equal(result.result,'win'); assert.equal(result.user.energy,5); assert.equal(result.user.stamina,90);
    assert.equal(result.user.hp,100); // One-hit win; no forced reduction to 30%.
    assert.equal(result.cashStolen,ending==='mug'?80:0);
    assert.equal(result.xpGain,ending==='leave'?37:ending==='mug'?15:25);
    const loser=await stats(defender);
    assert.equal(loser.cash,ending==='mug'?920:1000); assert.equal(loser.hp,20);
    assert.equal(loser.in_hospital,1); assert.equal(loser.losses,1);
    const seconds=loser.hospital_until-Math.floor(Date.now()/1000);
    assert.ok(Math.abs(seconds-(ending==='hospitalize'?600:ending==='mug'?90:60))<=2);
    const row=await query('SELECT * FROM attacks WHERE attacker_id=?',[attacker.id]);
    assert.equal(row.result,'win'); assert.equal(row.ending,ending); assert.equal(row.stance,'aggressive');
  }
});

test('draws retain HP and never count as wins or losses; failed attacks reward the defending record', async () => {
  const {attacker,defender}=await combatPair('strength=1,defense=1000,speed=100,hp=1000,max_hp=1000');
  await run('UPDATE users SET strength=1,defense=1000,speed=100,hp=1000,max_hp=1000 WHERE id=?',[defender.id]);
  const draw=await post(attacker,'/battles/attack',{target_id:defender.id});
  assert.equal(draw.result,'draw'); assert.equal(draw.user.hp,980); assert.equal(draw.user.wins,0); assert.equal(draw.user.losses,0);
  assert.equal((await stats(defender)).hp,980); assert.equal((await stats(defender)).in_hospital,0);
  const pair=await combatPair('strength=1,defense=1,speed=1');
  await run('UPDATE users SET strength=1000,speed=100 WHERE id=?',[pair.defender.id]);
  const loss=await post(pair.attacker,'/battles/attack',{target_id:pair.defender.id});
  assert.equal(loss.result,'loss'); assert.equal(loss.user.in_hospital,1); assert.equal(loss.user.losses,1);
  assert.equal((await stats(pair.defender)).wins,1);
});

test('combat validates target, stance, stamina and isolation before costs and serializes repeated attacks', async () => {
  const {attacker,defender}=await combatPair();
  for(const target_id of [attacker.id,defender.id+'junk',true,-1]) assert.ok((await post(attacker,'/battles/attack',{target_id})).error);
  assert.ok((await post(attacker,'/battles/attack',{target_id:defender.id,stance:'__proto__'})).error);
  await run('UPDATE users SET stamina=0 WHERE id=?',[attacker.id]);
  assert.match((await post(attacker,'/battles/attack',{target_id:defender.id})).error,/stamina/);
  await run('UPDATE users SET stamina=100 WHERE id=?',[attacker.id]);
  await run('UPDATE users SET in_jail=1,jail_until=? WHERE id=?',[Math.floor(Date.now()/1000)+600,defender.id]);
  assert.match((await post(attacker,'/battles/attack',{target_id:defender.id})).error,/jail/);
  await run('UPDATE users SET in_jail=0 WHERE id=?',[defender.id]);
  const results=await Promise.all([post(attacker,'/battles/attack',{target_id:defender.id}),post(attacker,'/battles/attack',{target_id:defender.id})]);
  assert.equal(results.filter(r=>!r.error).length,1); assert.equal((await stats(attacker)).energy,5);
  assert.equal((await query('SELECT COUNT(*) AS n FROM attacks WHERE attacker_id=?',[attacker.id])).n,1);
});

test('equipment, stance, speed and course perks actually change simulated damage', () => {
  const {simulateFight}=require('../middleware/dynamics');
  const base={username:'Fighter',hp:10000,strength:50,defense:25,speed:25,stamina:100,perks:{}};
  const balanced=simulateFight(base,base,'balanced',()=>0.5);
  const aggressive=simulateFight(base,base,'aggressive',()=>0.5);
  const defensive=simulateFight(base,base,'defensive',()=>0.5);
  assert.ok(aggressive.damageDealt>balanced.damageDealt); assert.ok(aggressive.damageTaken>balanced.damageTaken);
  assert.ok(defensive.damageTaken<balanced.damageTaken);
  const educated=simulateFight({...base,perks:{damage:8,protection:8}},base,'balanced',()=>0.5);
  assert.ok(educated.damageDealt>balanced.damageDealt); assert.ok(educated.damageTaken<balanced.damageTaken);
  const exhausted=simulateFight({...base,stamina:0},base,'balanced',()=>0.5);
  assert.ok(exhausted.damageDealt<balanced.damageDealt);
});

test('boosters share an atomic cooldown, preserve full-pool items and never spend the same item twice', async () => {
  const user=await account();
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'energy_drink','item',2)",[user.id]);
  const full=await post(user,'/inventory/use',{item_key:'energy_drink',item_type:'item'});
  assert.match(full.error,/already full/); assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[user.id])).quantity,2);
  await run('UPDATE users SET energy=0 WHERE id=?',[user.id]);
  const results=await Promise.all([post(user,'/inventory/use',{item_key:'energy_drink',item_type:'item'}),post(user,'/inventory/use',{item_key:'energy_drink',item_type:'item'})]);
  assert.equal(results.filter(r=>!r.error).length,1);
  assert.equal((await stats(user)).energy,10); assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[user.id])).quantity,1);
  await run("INSERT INTO inventory (user_id,item_key,item_type) VALUES (?,'redbull','item')",[user.id]);
  await run('UPDATE users SET energy=0 WHERE id=?',[user.id]);
  assert.match((await post(user,'/inventory/use',{item_key:'redbull'})).error,/cooldown/);
});

test('stamina drugs work, permanent supplements share recovery and medicine does not end hospitalization', async () => {
  const user=await account();
  await run("INSERT INTO inventory (user_id,item_key,item_type) VALUES (?,'viagra','drug')",[user.id]);
  await run('UPDATE users SET stamina=20 WHERE id=?',[user.id]);
  const stamina=await post(user,'/inventory/use',{item_key:'viagra',item_type:'drug'});
  assert.equal(stamina.user.stamina,50); assert.equal(stamina.category,'drug');
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'steroids','drug',2)",[user.id]);
  assert.match((await post(user,'/inventory/use',{item_key:'steroids',item_type:'drug'})).error,/cooldown/);
  await run('UPDATE recovery_cooldowns SET ready_at=0 WHERE user_id=?',[user.id]);
  const steroid=await post(user,'/inventory/use',{item_key:'steroids',item_type:'drug'});
  assert.equal(steroid.user.strength,15); assert.equal((await stats(user)).strength,15);
  await run("INSERT INTO inventory (user_id,item_key,item_type) VALUES (?,'med_kit','item')",[user.id]);
  await run('UPDATE users SET hp=10,in_hospital=1,hospital_until=? WHERE id=?',[Math.floor(Date.now()/1000)+600,user.id]);
  const med=await post(user,'/inventory/use',{item_key:'med_kit',item_type:'item'});
  assert.equal(med.user.hp,100); assert.equal(med.user.in_hospital,1); assert.equal(med.category,'medical');
});

test('new progression and battle history survive restart and legacy attacks migrate', async () => {
  const user=await account();
  await run("INSERT INTO education VALUES (?,'streetcraft',0,1,2)",[user.id]);
  await run("INSERT INTO education VALUES (?,'logistics',2,9999999999,NULL)",[user.id]);
  await run('INSERT INTO player_dynamics VALUES (?,?,?)',[user.id,50,Math.floor(Date.now()/1000)]);
  await run("INSERT INTO recovery_cooldowns VALUES (?,'drug',9999999999)",[user.id]);
  await run('INSERT INTO attacks (attacker_id,defender_id,attacker_won) VALUES (?,?,1)',[user.id,1]);
  await stop();
  await run('ALTER TABLE attacks DROP COLUMN result');
  await run('ALTER TABLE attacks DROP COLUMN ending');
  await run('ALTER TABLE attacks DROP COLUMN stance');
  await start();
  const login=await fetch(origin+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:user.username,password:'test-password'}),redirect:'manual'});
  user.cookie=login.headers.get('set-cookie').split(';')[0];
  const state=await (await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
  assert.equal(state.perks.crimeRisk,3); assert.ok(state.heat>=49);
  assert.equal((await query('SELECT ready_at FROM recovery_cooldowns WHERE user_id=?',[user.id])).ready_at,9999999999);
  assert.match((await post(user,'/education/start',{course_key:'conditioning'})).error,/current course/);
  for(const url of ['/education','/battles','/account','/profile/'+user.username]) {
    const response=await fetch(origin+url,{headers:{Cookie:user.cookie}}); assert.equal(response.status,200,url);
  }
});


test('profile mugging shares the combat outcome, costs and target cooldown', async () => {
  const {attacker,defender}=await combatPair();
  const mug=await post(attacker,'/mug',{target_id:defender.id,ending:'hospitalize'});
  assert.equal(mug.ending,'mug'); assert.equal(mug.success,true); assert.equal(mug.cashStolen,80);
  assert.equal(mug.user.nerve,5); assert.equal(mug.user.energy,5);
  assert.match((await post(attacker,'/battles/attack',{target_id:defender.id})).error,/Wait/);
});

test('inventory fallback artwork exists and cannot trigger an image-error reload loop', async () => {
  const response=await fetch(origin+'/amenities/default.png');
  assert.equal(response.status,200);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
});

// Travel uses real persisted timestamps; advancing fixtures avoids waiting through journeys.
async function travelState(user) {
  const response=await fetch(origin+'/yard/state',{headers:{Cookie:user.cookie}});
  assert.equal(response.status,200);
  return response.json();
}
async function arrive(user) {
  await run("UPDATE travel_trips SET arrives_at=0 WHERE user_id=? AND completed_at IS NULL",[user.id]);
  assert.equal((await travelState(user)).travel.phase,'visiting');
}
async function returnHome(user) {
  assert.ok(!(await post(user,'/yard/return')).error);
  await run('UPDATE travel_trips SET return_arrives_at=0 WHERE user_id=? AND completed_at IS NULL',[user.id]);
  return travelState(user);
}
async function relogin(user) {
  const response=await fetch(origin+'/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:user.username,password:'test-password'}),redirect:'manual'});
  assert.equal(response.status,302);
  user.cookie=response.headers.get('set-cookie').split(';')[0];
}

test('departure validates destination, recovery and fare; concurrent departures charge once and preserve home',async()=>{
  const user=await account();
  for(const destination_id of [1,0,6,2.5,true,null,'']) assert.ok((await post(user,'/yard/depart',{destination_id})).error);
  await run('UPDATE users SET in_jail=1,jail_until=? WHERE id=?',[Math.floor(Date.now()/1000)+600,user.id]);
  assert.match((await post(user,'/yard/depart',{destination_id:2})).error,/jail/);
  await run('UPDATE users SET in_jail=0,cash=0 WHERE id=?',[user.id]);
  assert.match((await post(user,'/yard/depart',{destination_id:2})).error,/fare/);
  await run("UPDATE users SET cash=1000,bank=800,job_key='janitor',job_prison_id=1 WHERE id=?",[user.id]);
  await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'three_musketeers',1)",[user.id]);
  const results=await Promise.all([post(user,'/yard/depart',{destination_id:2}),post(user,'/yard/depart',{destination_id:3})]);
  assert.equal(results.filter(r=>!r.error).length,1);
  const trip=await query('SELECT * FROM travel_trips WHERE user_id=?',[user.id]);
  const current=await stats(user);
  assert.equal(current.cash,1000-trip.fare);assert.equal(current.prison_id,1);assert.equal(current.bank,800);assert.equal(current.job_key,'janitor');
  assert.equal((await query('SELECT COUNT(*) AS n FROM cell_amenities WHERE user_id=?',[user.id])).n,1);
  assert.equal((await query('SELECT COUNT(*) AS n FROM travel_trips WHERE user_id=?',[user.id])).n,1);
  assert.equal(trip.capacity,6);assert.equal(trip.status,'outbound');
});

test('travel blocks home mutations and combat targets; transit cannot buy or turn around',async()=>{
  const user=await account(),attacker=await account();
  await post(user,'/yard/depart',{destination_id:2});
  for(const [url,body] of [['/gym/train',{stat:'strength',energy_amount:1}],['/crimes/commit',{crime_key:'pickpocket'}],['/bank/deposit',{amount:50}],['/transport/move',{prison_id:3}],['/inventory/list',{item_type:'collectible',item_key:'island_stamp',price:10}],['/yard/action',{action:'search'}]]) {
    assert.match((await post(user,url,body)).error,/away/);
  }
  assert.match((await post(attacker,'/battles/attack',{target_id:user.id})).error,/away/);
  assert.match((await post(user,'/yard/buy',{item_key:'island_stamp',quantity:1})).error,/Arrive/);
  assert.match((await post(user,'/yard/return')).error,/after arriving/);
  assert.equal((await stats(user)).cash,380);assert.equal((await stats(user)).energy,10);
  await arrive(user);
  assert.match((await post(user,'/yard/sell',{item_key:'island_stamp',quantity:1})).error,/home/);
});

test('cargo purchases validate goods and quantities and atomically enforce shared stock and bag space',async()=>{
  const a=await account(),b=await account();
  for(const u of [a,b]) {await run('UPDATE users SET cash=10000 WHERE id=?',[u.id]);await post(u,'/yard/depart',{destination_id:2});await arrive(u);}
  for(const quantity of [0,-1,1.5,true,null,'',100000000000000000]) assert.ok((await post(a,'/yard/buy',{item_key:'island_stamp',quantity})).error);
  assert.ok((await post(a,'/yard/buy',{item_key:'black_feather',quantity:1})).error);
  await run("UPDATE travel_stock SET quantity=5,restock_at=? WHERE item_key='island_stamp'",[Math.floor(Date.now()/1000)+900]);
  const shared=await Promise.all([post(a,'/yard/buy',{item_key:'island_stamp',quantity:4}),post(b,'/yard/buy',{item_key:'island_stamp',quantity:4})]);
  assert.equal(shared.filter(r=>!r.error).length,1);
  assert.equal((await query("SELECT quantity FROM travel_stock WHERE item_key='island_stamp'")).quantity,1);
  const winner=shared[0].error?b:a;
  const filled=await Promise.all([post(winner,'/yard/buy',{item_key:'sea_glass_charm',quantity:2}),post(winner,'/yard/buy',{item_key:'sea_glass_charm',quantity:2})]);
  assert.equal(filled.filter(r=>!r.error).length,1);
  assert.equal((await query('SELECT SUM(c.quantity) AS n FROM travel_cargo c JOIN travel_trips t ON t.id=c.trip_id WHERE t.user_id=?',[winner.id])).n,6);
  assert.equal((await query("SELECT COUNT(*) AS n FROM inventory WHERE user_id=? AND item_type='collectible'",[winner.id])).n,0);
  assert.equal((await stats(winner)).cash,10000-120-4*35-2*80);
});

test('return is prepaid and delivery settles exactly once under parallel polling; discoveries survive sales',async()=>{
  const user=await account();await run('UPDATE users SET cash=1000 WHERE id=?',[user.id]);
  await post(user,'/yard/depart',{destination_id:2});await arrive(user);
  await run("UPDATE travel_stock SET quantity=16 WHERE item_key='island_stamp'");
  assert.ok(!(await post(user,'/yard/buy',{item_key:'island_stamp',quantity:3})).error);
  await run('UPDATE users SET cash=0 WHERE id=?',[user.id]);
  const returning=await post(user,'/yard/return');assert.equal(returning.travel.phase,'returning');
  assert.equal(returning.user.cash,0);
  assert.equal((await query('SELECT COUNT(*) AS n FROM inventory WHERE user_id=?',[user.id])).n,0);
  await run('UPDATE travel_trips SET return_arrives_at=0 WHERE user_id=?',[user.id]);
  await Promise.all(Array.from({length:8},(_,i)=>i%2?travelState(user):fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}}).then(r=>r.json())));
  assert.equal((await query("SELECT quantity FROM inventory WHERE user_id=? AND item_key='island_stamp'",[user.id])).quantity,3);
  assert.equal((await query('SELECT trips_completed FROM travel_progress WHERE user_id=?',[user.id])).trips_completed,1);
  assert.equal((await query('SELECT total_brought FROM travel_discoveries WHERE user_id=?',[user.id])).total_brought,3);
  const sales=await Promise.all([post(user,'/yard/sell',{item_key:'island_stamp',quantity:3}),post(user,'/yard/sell',{item_key:'island_stamp',quantity:3})]);
  assert.equal(sales.filter(r=>!r.error).length,1);assert.equal((await stats(user)).cash,255);
  assert.equal((await travelState(user)).travel.discoveries.length,1);
  assert.equal((await query('SELECT sales_cash FROM travel_progress WHERE user_id=?',[user.id])).sales_cash,255);
});

test('empty return is possible with zero cash; local souvenirs never create a buy-sell profit',async()=>{
  const user=await account();
  await run("UPDATE travel_stock SET quantity=16 WHERE item_key='buckeye_token'");
  const buy=await post(user,'/yard/buy',{item_key:'buckeye_token',quantity:2});
  assert.ok(!buy.error);assert.equal(buy.user.cash,400);assert.equal(buy.travel.discoveries.length,1);
  assert.ok(!(await post(user,'/yard/sell',{item_key:'buckeye_token',quantity:2})).error);
  assert.equal((await stats(user)).cash,500);
  await post(user,'/yard/depart',{destination_id:2});await arrive(user);
  await run('UPDATE users SET cash=0 WHERE id=?',[user.id]);
  assert.equal((await returnHome(user)).travel.phase,'home');
  assert.equal((await stats(user)).cash,0);
});

test('stock restocks once at its deadline and is not replenished by reading the page',async()=>{
  const user=await account();
  await run("UPDATE travel_stock SET quantity=0,restock_at=0 WHERE item_key='buckeye_token'");
  const fresh=(await travelState(user)).travel.stock.find(s=>s.item_key==='buckeye_token');
  assert.equal(fresh.quantity,16);assert.equal(fresh.restock_at%900,0);
  await post(user,'/yard/buy',{item_key:'buckeye_token',quantity:1});
  const next=(await travelState(user)).travel.stock.find(s=>s.item_key==='buckeye_token');
  assert.equal(next.quantity,15);assert.equal(next.restock_at,fresh.restock_at);
});

test('bag upgrades require trips and cash, charge once, and persist capacity at departure',async()=>{
  const user=await account();
  assert.match((await post(user,'/yard/upgrade')).error,/Complete 3/);
  await run('INSERT INTO travel_progress (user_id,trips_completed) VALUES (?,3)',[user.id]);
  assert.match((await post(user,'/yard/upgrade')).error,/2500/);
  await run('UPDATE users SET cash=20000 WHERE id=?',[user.id]);
  const upgrades=await Promise.all([post(user,'/yard/upgrade'),post(user,'/yard/upgrade')]);
  assert.equal(upgrades.filter(r=>!r.error).length,1);assert.equal((await stats(user)).cash,17500);
  const departed=await post(user,'/yard/depart',{destination_id:3});assert.equal(departed.travel.trip.capacity,10);
  await run('UPDATE travel_progress SET bag_level=2 WHERE user_id=?',[user.id]);
  assert.equal((await travelState(user)).travel.trip.capacity,10);
});

test('collection reward requires all ten discoveries and pays exactly once without consuming goods',async()=>{
  const user=await account();assert.match((await post(user,'/yard/collection')).error,/all 10/);
  for(const g of require('../middleware/travel').GOODS) await run('INSERT INTO travel_discoveries (user_id,item_key,first_found,total_brought) VALUES (?,?,0,1)',[user.id,g.key]);
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'island_stamp','collectible',1)",[user.id]);
  const results=await Promise.all([post(user,'/yard/collection'),post(user,'/yard/collection')]);
  assert.equal(results.filter(r=>!r.error).length,1);assert.equal((await stats(user)).cash,2000);assert.equal((await stats(user)).rep,5);
  assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[user.id])).quantity,1);
});

test('collectibles trade through the actual market form endpoint, with one buyer and full-quantity cancellation',async()=>{
  const seller=await account(),a=await account(),b=await account();
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'island_stamp','collectible',5)",[seller.id]);
  assert.ok(!(await post(seller,'/openmarket/list',{item_type:'collectible',item_key:'island_stamp',quantity:3,price:100})).error);
  const listing=await query('SELECT * FROM open_market WHERE seller_id=? AND active=1',[seller.id]);
  const html=await (await fetch(origin+'/openmarket?cat=collectible',{headers:{Cookie:a.cookie}})).text();assert.match(html,/London Stamp/);
  const buys=await Promise.all([post(a,'/openmarket/buy',{listing_id:listing.id}),post(b,'/openmarket/buy',{listing_id:listing.id})]);
  assert.equal(buys.filter(r=>!r.error).length,1);assert.equal((await stats(seller)).cash,590);
  const winner=buys[0].error?b:a;
  assert.equal((await query('SELECT total_brought FROM travel_discoveries WHERE user_id=?',[winner.id])).total_brought,3);
  assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[winner.id])).quantity,3);
  assert.ok(!(await post(seller,'/inventory/list',{item_type:'collectible',item_key:'island_stamp',quantity:2,price:50})).error);
  const second=await query('SELECT id FROM open_market WHERE seller_id=? AND active=1',[seller.id]);
  const cancels=await Promise.all([post(seller,'/openmarket/cancel',{listing_id:second.id}),post(seller,'/openmarket/cancel',{listing_id:second.id})]);
  assert.equal(cancels.filter(r=>!r.error).length,1);
  assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[seller.id])).quantity,2);
});

test('trip phases and cargo survive restarts and legacy inventory without a unique constraint',async()=>{
  const user=await account();await run('UPDATE users SET cash=2000 WHERE id=?',[user.id]);
  await post(user,'/yard/depart',{destination_id:2});
  await stop();await start();await relogin(user);
  assert.equal((await travelState(user)).travel.phase,'outbound');
  await arrive(user);
  await run("UPDATE travel_stock SET quantity=16 WHERE item_key='island_stamp'");
  await post(user,'/yard/buy',{item_key:'island_stamp',quantity:2});
  await stop();await start();await relogin(user);
  assert.equal((await travelState(user)).travel.phase,'visiting');
  await post(user,'/yard/return');
  await stop();
  // Match older installed databases, which allow duplicate inventory rows.
  await run('ALTER TABLE inventory RENAME TO inventory_before_legacy_test');
  await run('CREATE TABLE inventory (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,item_key TEXT NOT NULL,item_type TEXT NOT NULL,quantity INTEGER DEFAULT 1)');
  await run('INSERT INTO inventory SELECT * FROM inventory_before_legacy_test');
  await run('DROP TABLE inventory_before_legacy_test');
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'island_stamp','collectible',1)",[user.id]);
  await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'island_stamp','collectible',2)",[user.id]);
  await start();await relogin(user);
  assert.equal((await travelState(user)).travel.phase,'returning');
  await run('UPDATE travel_trips SET return_arrives_at=0 WHERE user_id=?',[user.id]);
  const home=await travelState(user);assert.equal(home.travel.phase,'home');
  assert.equal(home.travel.inventory.find(i=>i.item_key==='island_stamp').quantity,5);
  const sold=await post(user,'/yard/sell',{item_key:'island_stamp',quantity:5});assert.ok(!sold.error);
  assert.equal((await query('SELECT COUNT(*) AS n FROM inventory WHERE user_id=?',[user.id])).n,0);
  assert.equal((await query('SELECT trips_completed FROM travel_progress WHERE user_id=?',[user.id])).trips_completed,1);
});

test('shop resolves colliding item keys by category and charges the displayed price',async()=>{
 const user=await account();await run('UPDATE users SET cash=5000 WHERE id=?',[user.id]);
 const basic=await post(user,'/marketplace/buy',{item_key:'knuckle_wraps',item_type:'item'});
 assert.ok(!basic.error);assert.equal(basic.user.cash,4800);
 const weapon=await post(user,'/marketplace/buy',{item_key:'knuckle_wraps',item_type:'weapon'});
 assert.ok(!weapon.error);assert.equal(weapon.user.cash,4520);
 assert.equal((await query("SELECT quantity FROM inventory WHERE user_id=? AND item_key='knuckle_wraps' AND item_type='item'",[user.id])).quantity,1);
 assert.equal((await query("SELECT quantity FROM inventory WHERE user_id=? AND item_key='knuckle_wraps' AND item_type='weapon'",[user.id])).quantity,1);
 const steroid=await post(user,'/marketplace/buy',{item_key:'steroids',item_type:'item'});
 assert.ok(!steroid.error);
 const used=await post(user,'/inventory/use',{item_key:'steroids',item_type:'item'});
 assert.equal(used.user.strength,12);
});
test('shop enforces prison tier and category on the server without spending cash',async()=>{
 const user=await account();await run('UPDATE users SET cash=100000 WHERE id=?',[user.id]);
 for(const body of [{item_key:'minigun',item_type:'weapon'},{item_key:'minigun',item_type:'item'},{item_key:'steroids',item_type:'drug'},{item_key:'island_stamp',item_type:'collectible'},{item_key:'__proto__',item_type:'weapon'},{item_key:'shiv',item_type:'__proto__'},{item_key:'shiv'}]) assert.ok((await post(user,'/marketplace/buy',body)).error);
 assert.equal((await stats(user)).cash,100000);
 assert.equal((await query('SELECT COUNT(*) AS n FROM inventory WHERE user_id=?',[user.id])).n,0);
 await run('UPDATE users SET prison_id=5 WHERE id=?',[user.id]);
 assert.ok(!(await post(user,'/marketplace/buy',{item_key:'minigun',item_type:'weapon'})).error);
 assert.equal((await stats(user)).cash,80000);
});
test('shop validates quantities and charges exactly once for parallel purchases with limited cash',async()=>{
 const user=await account();
 for(const quantity of [0,-1,1.5,true,null,'',101,9007199254740992]) assert.ok((await post(user,'/marketplace/buy',{item_key:'water_bottle',item_type:'item',quantity})).error);
 await run('UPDATE users SET cash=80 WHERE id=?',[user.id]);
 const results=await Promise.all([post(user,'/marketplace/buy',{item_key:'med_kit',item_type:'item'}),post(user,'/marketplace/buy',{item_key:'med_kit',item_type:'item'})]);
 assert.equal(results.filter(r=>!r.error).length,1);assert.equal((await stats(user)).cash,0);
 assert.equal((await query('SELECT quantity FROM inventory WHERE user_id=?',[user.id])).quantity,1);
 assert.equal((await query("SELECT COUNT(*) AS n FROM transaction_logs WHERE from_id=? AND type='shop_purchase'",[user.id])).n,1);
});
test('shop bulk purchase preserves bank, base stats and existing stacks in a legacy inventory',async()=>{
 const user=await account();await run('UPDATE users SET cash=1000,bank=600 WHERE id=?',[user.id]);
 await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'water_bottle','item',2)",[user.id]);
 const result=await post(user,'/marketplace/buy',{item_key:'water_bottle',item_type:'item',quantity:3});
 assert.ok(!result.error);assert.equal(result.user.cash,940);assert.equal(result.user.bank,600);
 assert.equal((await stats(user)).strength,10);
 assert.equal((await query("SELECT SUM(quantity) AS n FROM inventory WHERE user_id=? AND item_key='water_bottle'",[user.id])).n,5);
});


test('city setting provides canonical pages and city travel while preserving legacy saves and URLs',async()=>{
 const user=await account();
 await run("UPDATE users SET bank=750,job_key='cleaner',job_prison_id=1 WHERE id=?",[user.id]);
 for(const url of ['/city','/airport','/property','/shop?tab=items','/hospital','/jail','/citizens','/broker','/broker-supplies','/relocate','/factions','/my-faction','/faction-invites','/prison','/prison/yard','/cell']) {
  const response=await fetch(origin+url,{headers:{Cookie:user.cookie}});assert.equal(response.status,200,url);
 }
 const city=await (await fetch(origin+'/city',{headers:{Cookie:user.cookie}})).text();
 assert.match(city,/CITIZEN OVERVIEW/);assert.match(city,/Lockdown City/);assert.match(city,/<img src="\/PRISONHALL1\.png" alt="Original LOCKDOWN hall artwork">/);
 const airport=await (await fetch(origin+'/airport',{headers:{Cookie:user.cookie}})).text();
 assert.match(airport,/AIRPORT \/ INTERNATIONAL TRADE/);assert.match(airport,/London/);assert.match(airport,/Tokyo/);assert.match(airport,/Dubai/);assert.match(airport,/Cape Town/);
 const bought=await post(user,'/shop/buy',{item_key:'water_bottle',item_type:'item'});assert.ok(!bought.error);assert.equal(bought.user.bank,750);
 const trip=await post(user,'/airport/depart',{destination_id:2});assert.ok(!trip.error);assert.equal(trip.travel.phase,'outbound');
 const state=await (await fetch(origin+'/airport/state',{headers:{Cookie:user.cookie}})).json();assert.equal(state.travel.trip.destination_id,2);
 assert.match((await post(user,'/property/clear')).error,/away/);
 const saved=await stats(user);assert.equal(saved.prison_id,1);assert.equal(saved.job_key,'cleaner');assert.equal(saved.bank,750);
});

test('dexterity trains independently, survives saves and appears in history and city pages', async()=>{
 const user=await account();await run('UPDATE users SET xp_needed=100000 WHERE id=?',[user.id]);
 const trained=await post(user,'/gym/train',{stat:'dexterity',energy_amount:5});
 assert.equal(trained.gain,10);assert.equal(trained.user.dexterity,18);assert.equal(trained.user.strength,10);
 assert.equal(trained.user.happiness,95);assert.equal(trained.historyEntry.dexterity,18);
 await post(user,'/bank/deposit',{amount:50});
 assert.equal((await stats(user)).dexterity,18);
 assert.equal((await query('SELECT dexterity FROM training_history WHERE user_id=?',[user.id])).dexterity,18);
 const gym=await(await fetch(origin+'/gym',{headers:{Cookie:user.cookie}})).text();assert.match(gym,/Train dexterity/);
 const city=await(await fetch(origin+'/city',{headers:{Cookie:user.cookie}})).text();assert.match(city,/DEX 18/);
});

test('property comfort counts distinct valid furnishings and happiness boosts the displayed training gain',async()=>{
 const user=await account();
 const {CELL_AMENITIES}=require('../middleware/gamedata');const keys=Object.keys(CELL_AMENITIES).slice(0,10);
 // Equalize existing stat/energy bonuses so only happiness is under test.
 for(const key of keys) await run('INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,?,1)',[user.id,key]);
 await run('INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,?,2)',[user.id,keys[0]]);
 await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'__proto__',3)",[user.id]);
 await run('UPDATE users SET happiness=200,energy=10,xp_needed=100000 WHERE id=?',[user.id]);
 const before=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
 assert.equal(before.max_happiness,200);assert.equal(before.happiness,200);
 const trained=await post(user,'/gym/train',{stat:'dexterity',energy_amount:5});
 assert.equal(trained.gain,12);assert.equal(trained.user.happiness,195);
 assert.equal(trained.user.dexterity,20);
 await run('DELETE FROM cell_amenities WHERE user_id=?',[user.id]);
 const after=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
 assert.equal(after.max_happiness,100);assert.equal(after.happiness,100);assert.equal(after.dexterity,20);
});

test('home breaks charge once under concurrency and respect recovery, funds and full happiness',async()=>{
 const user=await account();await run('UPDATE users SET happiness=10,happiness_last_regen=? WHERE id=?',[Math.floor(Date.now()/1000),user.id]);
 const results=await Promise.all([post(user,'/property/relax'),post(user,'/property/relax')]);
 assert.equal(results.filter(r=>!r.error).length,1);
 let saved=await stats(user);assert.equal(saved.cash,450);assert.equal(saved.happiness,35);assert.ok(saved.relax_ready_at>Math.floor(Date.now()/1000));
 await run('UPDATE users SET relax_ready_at=0,cash=49 WHERE id=?',[user.id]);
 assert.match((await post(user,'/property/relax')).error,/Need \$50/);
 await run('UPDATE users SET happiness=100,cash=100 WHERE id=?',[user.id]);
 assert.match((await post(user,'/property/relax')).error,/already full/);assert.equal((await stats(user)).cash,100);
 await run('UPDATE users SET happiness=10,in_hospital=1,hospital_until=? WHERE id=?',[Math.floor(Date.now()/1000)+600,user.id]);
 assert.match((await post(user,'/property/relax')).error,/Recover/);
 await run('UPDATE users SET in_hospital=0,cash=1000 WHERE id=?',[user.id]);
 await post(user,'/airport/depart',{destination_id:2});
 assert.match((await post(user,'/property/relax')).error,/away/);
});

test('offline happiness keeps fractional ticks and cannot bank recovery at full capacity',async()=>{
 const user=await account(),now=Math.floor(Date.now()/1000);
 await run('UPDATE users SET happiness=20,happiness_last_regen=? WHERE id=?',[now-1900,user.id]);
 const regenerated=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
 assert.equal(regenerated.happiness,30);assert.equal((await stats(user)).happiness_last_regen,now-100);
 await run('UPDATE users SET happiness=100,happiness_last_regen=? WHERE id=?',[now-86400,user.id]);
 await post(user,'/gym/train',{stat:'dexterity',energy_amount:1});
 const current=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();assert.equal(current.happiness,99);
});

test('successful crime experience grows nerve capacity once without stacking base or property bonuses',async()=>{
 const user=await account();await run('UPDATE users SET crime_xp=98,xp_needed=100000 WHERE id=?',[user.id]);
 const success=await post(user,'/crimes/commit',{crime_key:'pickpocket'});
 assert.equal(success.caught,false);assert.equal(success.user.criminal.xp,100);assert.equal(success.user.criminal.nerveBonus,1);
 assert.equal(success.user.max_nerve,6);assert.equal((await stats(user)).max_nerve,5);
 for(let i=0;i<3;i++) assert.equal((await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json()).max_nerve,6);
 await post(user,'/bank/deposit',{amount:10});assert.equal((await stats(user)).max_nerve,5);
 await run('UPDATE users SET crime_xp=999999 WHERE id=?',[user.id]);
 const capped=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();assert.equal(capped.max_nerve,30);assert.equal(capped.criminal.nextAt,null);
});

test('failed crimes and rolled-back actions do not grant criminal experience',async()=>{
 await stop();await start(0.01);
 const user=await account();const failed=await post(user,'/crimes/commit',{crime_key:'pickpocket'});
 assert.equal(failed.caught,true);assert.equal(failed.user.criminal.xp,0);
 await stop();await start();await relogin(user);
 await run('UPDATE users SET in_jail=0,nerve=5 WHERE id=?',[user.id]);
 await run("CREATE TRIGGER reject_city_mastery BEFORE INSERT ON crime_mastery BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
 try {
  const response=await fetch(origin+'/crimes/commit',{method:'POST',headers:{Cookie:user.cookie,'Content-Type':'application/json'},body:JSON.stringify({crime_key:'pickpocket'})});
  assert.equal(response.status,500);assert.equal((await stats(user)).crime_xp,0);
 } finally {await run('DROP TRIGGER reject_city_mastery');}
});

test('dexterity evades hits and training speed counters evasive defenders',()=>{
 const {simulateFight}=require('../middleware/dynamics');
 const base={username:'A',hp:100000,strength:50,defense:25,speed:25,dexterity:25,stamina:100};
 const normal=simulateFight(base,{...base,username:'B'},'balanced',()=>0.5);
 const evasive=simulateFight(base,{...base,username:'B',dexterity:10000},'balanced',()=>0.5);
 assert.ok(evasive.damageDealt<normal.damageDealt);assert.ok(evasive.log.some(line=>line.includes('evades')));
 const counter=simulateFight({...base,speed:10000},{...base,username:'B',dexterity:10000},'balanced',()=>0.5);
 assert.ok(counter.damageDealt>evasive.damageDealt);
});

test('city life migrations preserve older accounts and do not reapply on restart',async()=>{
 const user=await account();await run('UPDATE users SET cash=1234,bank=567,level=4,strength=42,crime_xp=199,dexterity=55,happiness=65,relax_ready_at=123 WHERE id=?',[user.id]);
 await stop();
 // Remove just the new columns to reproduce a saved game from the previous city update.
 for(const column of ['dexterity','happiness','happiness_last_regen','relax_ready_at','crime_xp'])await run(`ALTER TABLE users DROP COLUMN ${column}`);
 await run('ALTER TABLE training_history DROP COLUMN dexterity');
 await start();await relogin(user);
 const migrated=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
 assert.equal(migrated.cash,1234);assert.equal(migrated.bank,567);assert.equal(migrated.strength,42);assert.equal(migrated.level,4);
 assert.equal(migrated.dexterity,8);assert.equal(migrated.happiness,100);assert.equal(migrated.criminal.xp,0);
 await run('UPDATE users SET dexterity=55,happiness=65,crime_xp=199 WHERE id=?',[user.id]);
 await stop();await start();await relogin(user);
 const restarted=await(await fetch(origin+'/api/stats',{headers:{Cookie:user.cookie}})).json();
 assert.equal(restarted.dexterity,55);assert.equal(restarted.happiness,65);assert.equal(restarted.criminal.xp,199);
 assert.equal(restarted.cash,1234);assert.equal(restarted.bank,567);
});

test('city relocation is atomic, ends the old job and returns typed listings without losing saves',async()=>{
 const user=await account();
 await run("UPDATE users SET level=20,cash=5000,bank=700,job_key='cleaner',job_prison_id=1,dexterity=77,crime_xp=321 WHERE id=?",[user.id]);
 await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'three_musketeers',1)",[user.id]);
 await run("INSERT INTO inventory (user_id,item_key,item_type,quantity) VALUES (?,'shiv','item',2)",[user.id]);
 for(const type of ['item','weapon','collectible']) await run("INSERT INTO open_market (seller_id,prison_id,item_type,item_key,quantity,price) VALUES (?,1,?,'shiv',3,99)",[user.id,type]);
 for(const prison_id of [true,'2oops',null])assert.ok((await post(user,'/relocate/move',{prison_id})).error);
 const results=await Promise.all([post(user,'/relocate/move',{prison_id:2}),post(user,'/relocate/move',{prison_id:2})]);
 assert.equal(results.filter(r=>!r.error).length,1);
 const moved=await stats(user);assert.equal(moved.prison_id,2);assert.equal(moved.cash,3700);assert.equal(moved.bank,0);
 assert.equal(moved.job_key,null);assert.equal(moved.job_prison_id,null);assert.equal(moved.dexterity,77);assert.equal(moved.crime_xp,321);
 assert.equal((await query('SELECT placed_tile FROM cell_amenities WHERE user_id=?',[user.id])).placed_tile,null);
 for(const [type,qty] of [['item',5],['weapon',3],['collectible',3]])assert.equal((await query('SELECT SUM(quantity) AS n FROM inventory WHERE user_id=? AND item_type=? AND item_key=?',[user.id,type,'shiv'])).n,qty);
 assert.equal((await query('SELECT COUNT(*) AS n FROM open_market WHERE seller_id=? AND active=1',[user.id])).n,0);
});

test('relocation rolls back fees, job, furnishings and listing returns when a write fails',async()=>{
 const user=await account();await run("UPDATE users SET level=20,cash=5000,bank=200,job_key='cleaner',job_prison_id=1 WHERE id=?",[user.id]);
 await run("INSERT INTO cell_amenities (user_id,item_key,placed_tile) VALUES (?,'three_musketeers',1)",[user.id]);
 await run("INSERT INTO open_market (seller_id,prison_id,item_type,item_key,quantity,price) VALUES (?,1,'weapon','shiv',1,99)",[user.id]);
 await run("CREATE TRIGGER reject_relocation BEFORE UPDATE OF prison_id ON users BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
 try {
  const response=await fetch(origin+'/relocate/move',{method:'POST',headers:{Cookie:user.cookie,'Content-Type':'application/json'},body:JSON.stringify({prison_id:2})});assert.equal(response.status,500);
  const saved=await stats(user);assert.equal(saved.cash,5000);assert.equal(saved.bank,200);assert.equal(saved.prison_id,1);assert.equal(saved.job_key,'cleaner');
  assert.equal((await query('SELECT placed_tile FROM cell_amenities WHERE user_id=?',[user.id])).placed_tile,1);
  assert.equal((await query('SELECT active FROM open_market WHERE seller_id=?',[user.id])).active,1);
  assert.equal((await query('SELECT COUNT(*) AS n FROM inventory WHERE user_id=?',[user.id])).n,0);
 }finally{await run('DROP TRIGGER reject_relocation');}
});
