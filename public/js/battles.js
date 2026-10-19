const battleState = JSON.parse(document.getElementById('battleState').textContent);
let fightPending = false;
function refreshBattles() {
  const user = battleState.user;
  const restricted = user.in_jail || user.in_hospital || user.energy < 5 || user.stamina < 10;
  document.getElementById('fightReadiness').textContent = user.in_jail || user.in_hospital ? 'Recover before attacking.' : `${user.energy} energy · ${user.stamina}% stamina · ${user.hp} / ${user.max_hp} HP`;
  document.querySelectorAll('[data-target]').forEach(button => {
    const remaining = Math.max(0, Number(button.dataset.ready) - Math.floor(Date.now() / 1000));
    button.disabled = fightPending || restricted || !!remaining || button.dataset.recovering === 'true';
    button.textContent = button.dataset.recovering === 'true' ? 'Recovering' : remaining ? `Wait ${Math.ceil(remaining / 60)}m` : fightPending ? 'Fighting…' : 'Attack ↗';
  });
  document.getElementById('fightStance').disabled = fightPending;
  document.getElementById('fightEnding').disabled = fightPending;
}
document.querySelectorAll('[data-target]').forEach(button => button.addEventListener('click', async () => {
  if (fightPending) return;
  fightPending = true; refreshBattles();
  const message = document.getElementById('fightResult');
  try {
    const response = await fetch('/battles/attack', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ target_id:Number(button.dataset.target), stance:document.getElementById('fightStance').value, ending:document.getElementById('fightEnding').value }) });
    const data = await response.json();
    message.hidden = false; message.textContent = [data.error || data.msg, ...(data.levelUp || [])].join(' '); message.classList.toggle('is-error', !!data.error || data.result === 'loss');
    if (data.user) { battleState.user = data.user; updateStats(data.user); }
    if (!data.error) {
      button.dataset.ready = Math.floor(Date.now() / 1000) + 600;
      document.getElementById('fightLog').hidden = false;
      document.getElementById('logResult').textContent = data.result.toUpperCase();
      const lines = document.getElementById('logLines'); lines.replaceChildren();
      (data.log || []).forEach(line => { const row = document.createElement('p'); row.textContent = line; lines.appendChild(row); });
    }
  } catch { message.hidden = false; message.textContent = 'Could not confirm the fight. Refresh to check your battle history before trying again.'; message.classList.add('is-error'); }
  finally { fightPending = false; refreshBattles(); }
}));
document.addEventListener('player:updated', event => { battleState.user = event.detail; refreshBattles(); });
refreshBattles(); setInterval(refreshBattles, 1000);
