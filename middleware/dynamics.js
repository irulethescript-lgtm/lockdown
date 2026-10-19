// Shared rules for the long game. All times are seconds; perks come only from claimed courses.
const COURSES = [
  { key: 'streetcraft', name: 'Streetcraft', track: 'Crime', cost: 1000, duration: 900, requires: null, desc: 'Read patrol patterns. Permanently lowers catch risk by 3 percentage points.', perk: { crimeRisk: 3 } },
  { key: 'logistics', name: 'Contraband Logistics', track: 'Crime', cost: 3500, duration: 7200, requires: 'streetcraft', desc: 'Build reliable contacts. Permanently earns 10% more crime cash.', perk: { crimeCash: 10 } },
  { key: 'conditioning', name: 'Physical Conditioning', track: 'Training', cost: 1000, duration: 1800, requires: null, desc: 'Build a routine. Permanently improves gym gains by 10%.', perk: { training: 10 } },
  { key: 'sports_science', name: 'Sports Science', track: 'Training', cost: 5000, duration: 14400, requires: 'conditioning', desc: 'Refine your technique. Adds another 15% to gym gains.', perk: { training: 15 } },
  { key: 'anatomy', name: 'Applied Anatomy', track: 'Combat', cost: 2000, duration: 3600, requires: null, desc: 'Find weak spots. Permanently increases damage dealt by 8%.', perk: { damage: 8 } },
  { key: 'self_defense', name: 'Defensive Tactics', track: 'Combat', cost: 5000, duration: 10800, requires: 'anatomy', desc: 'Protect yourself. Permanently reduces incoming damage by 8%.', perk: { protection: 8 } },
];
COURSES.push(
  {key:'medical_training',name:'Medical Effectiveness',track:'Medical',cost:15000,duration:28800,requires:'anatomy',desc:'Improve medical healing and hospital time removal by 20%.',perk:{medical:20}},
  {key:'intravenous',name:'Intravenous Therapy',track:'Medical',cost:10000,duration:14400,requires:'anatomy',desc:'Unlock filling and using compatible blood bags.',perk:{intravenous:1}},
  {key:'brain_surgery',name:'Brain Surgery',track:'Medical',cost:50000,duration:86400,requires:'intravenous',desc:'Qualify for the Brain Surgeon job and unlock reviving when hired.',perk:{brainSurgery:1}}
);
const APPROACHES = [
  { key: 'cautious', name: 'Cautious', risk: -8, reward: 0.75, heat: 3, desc: 'Less risk, 75% cash, +3 heat' },
  { key: 'balanced', name: 'Balanced', risk: 0, reward: 1, heat: 6, desc: 'Standard risk and cash, +6 heat' },
  { key: 'bold', name: 'Bold', risk: 12, reward: 1.5, heat: 12, desc: 'More risk, 150% cash, +12 heat' },
];
const STANCES = {
  balanced: { name: 'Balanced', damage: 1, defense: 1 },
  aggressive: { name: 'Aggressive', damage: 1.2, defense: 0.8 },
  defensive: { name: 'Defensive', damage: 0.85, defense: 1.25 },
};
function getPerks(completedKeys = []) {
  const perks = { crimeRisk: 0, crimeCash: 0, training: 0, damage: 0, protection: 0, medical:0, intravenous:0, brainSurgery:0 };
  for (const course of COURSES.filter(c => completedKeys.includes(c.key))) {
    for (const [key, amount] of Object.entries(course.perk)) perks[key] += amount;
  }
  return perks;
}
function getHeat(row, now = Math.floor(Date.now() / 1000)) {
  return Math.max(0, Math.min(100, (row?.heat || 0) - Math.max(0, Math.floor((now - (row?.heat_updated ?? now)) / 60))));
}
function crimeQuote(crime, mastery, user, approach) {
  return {
    risk: Math.min(90, Math.max(5, crime.catch_chance - Math.floor(user.speed / 50) * 5 - mastery.riskReduction + Math.floor((user.heat || 0) / 5) + approach.risk - (user.perks?.crimeRisk || 0))),
    multiplier: (1 + mastery.rewardBonus / 100) * approach.reward * (1 + (user.perks?.crimeCash || 0) / 100),
  };
}
function recoveryGroup(item, type) {
  const medical=require('./medical').rule(item);
  if(medical)return {key:medical.opium?'drug':'medical',label:medical.opium?'Drug':'Medical',duration:medical.cooldown*60};
  if (type === 'drug' || item.permanent) return { key: 'drug', label: 'Drug', duration: 3600 };
  if (item.effect.energy || item.effect.nerve || item.effect.stamina) return { key: 'booster', label: 'Booster', duration: 900 };
  return { key: 'medical', label: 'Medical', duration: 300 };
}

// Pure simulation: persistence and rewards are committed together by the attack route.
function simulateFight(attacker, defender, stanceKey, random = Math.random) {
  const stance = STANCES[stanceKey];
  const log = [`${stance.name} stance. Strength sets damage; defense absorbs it; speed contests dexterity to hit. Equipment, stamina and courses apply.`];
  let aHp = attacker.hp, dHp = defender.hp, damageDealt = 0, damageTaken = 0;
  const power = u => Math.max(0.25, (u.stamina ?? 100) / 100);
  function damage(source, target, attacking) {
    const offense = source.strength * power(source) * (attacking ? stance.damage : 1);
    const defense = target.defense * power(target) * (attacking ? 1 : stance.defense);
    const speedFactor = Math.max(0.85, Math.min(1.15, 1 + (source.speed - target.speed) / Math.max(1, source.speed + target.speed) * 0.15));
    const critical = random() < Math.min(0.25, 0.05 + source.speed / Math.max(1, target.speed) * 0.02);
    const value = Math.max(1, offense * (0.9 + random() * 0.2) * speedFactor - defense * 0.45);
    return { amount: Math.max(1, Math.floor(value * (critical ? 1.5 : 1) * (1 + (source.perks?.damage || 0) / 100) * (1 - (target.perks?.protection || 0) / 100))), critical };
  }
  const aFirst = attacker.speed * power(attacker) >= defender.speed * power(defender);
  for (let round = 1; round <= 20 && aHp > 0 && dHp > 0; round++) {
    for (const attacking of aFirst ? [true, false] : [false, true]) {
      const source = attacking ? attacker : defender, target = attacking ? defender : attacker;
      const accuracy = Math.max(1, source.speed * power(source));
      const evasion = Math.max(1, (target.dexterity ?? target.speed) * power(target));
      const chance = Math.max(0.1, Math.min(0.995, 1.5 * accuracy / (accuracy + evasion)));
      if (random() >= chance) {
        log.push(`R${round}: ${source.username} misses; ${target.username} evades.`);
        continue;
      }
      const hit = damage(source, target, attacking);
      if (attacking) { dHp -= hit.amount; damageDealt += hit.amount; }
      else { aHp -= hit.amount; damageTaken += hit.amount; }
      log.push(`R${round}: ${attacking ? attacker.username : defender.username} hits for ${hit.amount}${hit.critical ? ' (critical)' : ''}.`);
      if (aHp <= 0 || dHp <= 0) break;
    }
  }
  return { result: dHp <= 0 ? 'win' : aHp <= 0 ? 'loss' : 'draw', aHp: Math.max(0, aHp), dHp: Math.max(0, dHp), damageDealt, damageTaken, log };
}
module.exports = { COURSES, APPROACHES, STANCES, getPerks, getHeat, crimeQuote, recoveryGroup, simulateFight };
