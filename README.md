# 🔒 LOCKDOWN — Prison RPG

A multiplayer browser-based prison RPG inspired by PrisonBlock.  
Built with Node.js + Express + SQLite + Socket.IO.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the server
node server.js

# 3. Open your browser
http://localhost:3000
```

---

## Features

- **Register / Login** — Persistent accounts with hashed passwords
- **Cell** — Work out, study, hustle, rest, intimidate, meditate
- **Gym progression** — Train STR / DEF / SPD with energy and stamina; unlock four gyms with better gains
- **Travel Yard** — Timed prison visits, exclusive collectibles, cargo upgrades and player trading
- **Crime mastery** — Prison-specific crimes with visible risk, cash, XP, and reputation rewards. Every 10 successes raises mastery (maximum level 10), adding 2% cash and reducing catch risk by 1 percentage point per level.
- **Daily objectives** — Attempt 3 crimes and complete 2 gym sessions, then claim $500 and 3 reputation once per UTC day.
- **Overview dashboard** — Daily progress, next prison unlock, specialties, and recent events
- **Battles** — Attack real players, steal cash, send them to hospital
- **Black Market** — Buy weapons and gear that boost stats
- **Bank** — Deposit/withdraw cash (safe from theft)
- **Infirmary** — Pay to heal HP
- **Gang System** — Create or join gangs, invite members, gang bank
- **Live Shoutbox** — Real-time global chat via Socket.IO
- **Mail** — Send messages between players
- **Events** — Attack notifications, mail alerts, gang invites
- **Hitlist** — Place bounties on players
- **Most Wanted** — Leaderboard by reputation
- **Isolation Cell** — See who's in jail and their release timer
- **Profiles** — Public player profiles with fight history

---

## Deployment (Production)

### On a VPS (Ubuntu/Debian)

```bash
# Install Node.js 22+
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone/upload your files, then:
cd /var/www/lockdown
npm install
node server.js
```

### With PM2 (recommended — keeps it running)

```bash
npm install -g pm2
pm2 start server.js --name lockdown
pm2 save
pm2 startup
```

### With Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Environment Variables

```bash
# Change the session secret in production!
SESSION_SECRET=your-super-secret-key node server.js

# Or use a .env file with dotenv
PORT=3000
SESSION_SECRET=change-me-in-production
```

---

## File Structure

```
lockdown/
├── server.js              # Entry point, Express + Socket.IO
├── package.json
├── db/                    # SQLite database files (auto-created)
├── middleware/
│   ├── db.js              # Database setup + helpers
│   ├── auth.js            # requireAuth middleware
│   └── gamedata.js        # Missions, items, game constants
├── routes/
│   ├── auth.js            # Login, register, logout
│   └── game.js            # All game routes
├── views/                 # EJS templates
│   ├── layout.ejs         # Master layout (header, sidebar, footer)
│   ├── login.ejs
│   ├── register.ejs
│   ├── prison.ejs         # Main hub
│   ├── cell.ejs
│   ├── gym.ejs
│   ├── yard.ejs
│   ├── battles.ejs
│   ├── missions.ejs
│   ├── marketplace.ejs
│   ├── bank.ejs
│   ├── infirmary.ejs
│   ├── shoutbox.ejs
│   ├── inmates.ejs
│   ├── profile.ejs
│   ├── account.ejs
│   ├── mail.ejs
│   ├── events.ejs
│   ├── most_wanted.ejs
│   ├── hitlist.ejs
│   ├── isolation.ejs
│   ├── gangs.ejs
│   ├── my_gang.ejs
│   ├── gang_create.ejs
│   └── gang_invites.ejs
└── public/
    ├── css/main.css        # All styles (PrisonBlock-inspired)
    └── js/main.js          # Client JS, socket, stat updater
```

---

## Game Mechanics

| Stat | Regenerates |
|------|------------|
| Energy | 1 per 5 minutes |
| Nerve | 1 per 3 minutes |
| HP | Heal at infirmary |

| Action | Cost |
|--------|------|
| Fight | 5 Energy |
| Train (gym) | Choose energy; 2% stamina per energy |
| Crime | Nerve and stamina shown on each crime |
| Travel visit | Round-trip cash fare shown per route |


## Progression and verification

Gym unlocks use lifetime energy spent after this update: Cell Block Gym (0, standard gains), Iron Yard (100, +20%), The Foundry (500, +40%), and Lockdown Elite (1,500, +60%). A session earns `floor(energy × 2 × gym multiplier)` stat points and 15 XP per energy. A newly unlocked gym applies to the following session. History stores base stats; the training cards include cell bonuses. Owned equipped weapons, armor and gear add temporary stat bonuses; they are never written into base stats.

Crime mastery, gym progress, and daily goals are stored in SQLite and created automatically for existing and new accounts. Previous actions are not backfilled. Mastery does not reset at midnight; daily goals reset at 00:00 UTC. Full resource pools cannot bank regeneration time. Stamina recovers by 1% every 5 minutes.

Run `npm test` with the declared dependencies installed for your operating system. The integration suite starts isolated local servers and temporary databases; it covers mastery, gym unlocks, costs, concurrent actions/claims, rollback, old database recovery, and restart persistence. It uses deterministic random outcomes only in its child test servers.

For a separate local database, set `DB_PATH=/absolute/path/to/preview.db` before starting the server. Its parent directory must exist. The default remains `db/lockdown.db`. Do not reuse binaries in `node_modules` from a different operating system: install dependencies on the target platform. The game calls its existing SQLite schema setup on startup; older gang installations may still need the documented `node migrate_gangs.js` upgrade.


## Strategy update

- **Crime decisions:** cautious (−8 risk points, ×0.75 cash, +3 heat), balanced (standard, +6 heat), bold (+12 risk points, ×1.5 cash, +12 heat). Every 5 heat adds 1 catch-risk point; heat cools by 1/minute offline and is capped at 100. Being caught adds 10 extra heat. Risk is clamped to 5–90%. Mastery, speed and education all apply before the final clamp.
- **Economy:** crime cash ranges are now one tenth of the original payouts, making equipment, prison transfers and course fees longer-term goals. Extreme cell bonuses on Borderlands 2, Call of Duty, Dead Rising 2 and Death at a Funeral were reduced to keep training meaningful. Existing cash and earned base stats are preserved; passive cell bonuses use the current item balance.
- **Education:** six courses in crime, training and combat. Pay cash once, study one course at a time (15 minutes to 4 hours), then collect the permanent perk. Prerequisites must be completed and collected. Courses progress offline and persist through restarts/transfers. Gym gain is now `floor(energy × 2 × gym multiplier × (1 + education bonus / 100))`.
- **Combat:** balanced/aggressive/defensive stances; equipped gear and stamina affect combat. On victory, mug takes 8% of cash on hand with 60% of base XP and 1 rep; leave earns 150% XP and 3 + floor(target level / 3) rep; hospitalize earns standard XP, 2 rep, and a 10-minute recovery for the target. Mug/leave recovery is 90/60 seconds. A failed attack sends the attacker to recovery for 3 minutes. A 20-round draw has no winner or victory rewards. Survivors retain HP; knocked-out players recover at 20% HP. Attack costs 5 energy and 10 stamina, defender spends up to 5 stamina. The per-target cooldown is 10 minutes; profile mugging uses this same fight system and cooldown.
- **Recovery:** shared cooldowns for boosters (15 minutes), drugs/permanent supplements (60 minutes) and medical items (5 minutes). Fully unusable items are kept without starting a cooldown. Viagra now restores stamina correctly; cocaine restores energy only. Medical items do not end hospital sentences. Isolation blocks consumables.

All new tables and attack-history columns are added automatically at startup. Keep your existing `db` folder when installing the update. Do not copy `node_modules` between operating systems; use Node.js 22+ and `npm ci` in your game folder, then `npm start`.


## Travel Yard

The yard is now a timed prison exchange. Choose Travel Yard in the sidebar, pay a round-trip fare, and visit one of the other four prisons. All routes are open from level 1. Travel takes 2–12 minutes each way and keeps running offline. A visit preserves your home prison, job, bank and cell; Prison Transfers still makes a permanent move.

Each prison stocks two exclusive collectibles. Buy them at the destination, fill your six-slot bag and start the prepaid return trip. Cargo enters your inventory automatically on arrival home. Sell it to the home collector or list it on the Open Market. Shared stock refreshes every 15 minutes. Home souvenirs cost the collector value, allowing a complete collection without generating a local trading profit.

Discover all ten items to claim $1,500 and 5 reputation once, keeping the items. Discoveries persist after selling and also count when goods are bought from players. Upgrade to ten slots after three completed trips and $2,500, then sixteen slots after ten trips and $10,000. Training, crimes, banking and home mutations are blocked while away; passive resource recovery and education continue. Return travel costs no extra cash, even with an empty bag.

The new travel tables are added at startup without removing existing accounts or progress. Keep your `db` folder. The test suite covers concurrent departures, finite stock, cargo limits, delivery exactly once, collection claims, collector sales, player trades, restart persistence and older inventory schemas.


## City setting update

The city setting uses `/city`, `/airport`, `/property`, `/shop`, `/hospital`,
`/jail`, `/broker` and `/factions`. Existing routes continue to work.
Lockdown City is the starting city; timed flights visit London, Tokyo, Dubai
and Cape Town to import exclusive collectibles. Relocation is separate from a
short visit and retains the existing level requirements.

Existing database columns and item keys are deliberately retained for save
compatibility. Keep your `db` folder and existing artwork when updating.
This release includes a new city skyline, city descriptions and collectible
names, and fixes category-specific shop prices and server stock restrictions.

All 155 item photography designs are prepared separately. Realistic replacement
images have not yet been generated: the authorized image API fallback needs a
private `OPENAI_API_KEY`. The game continues to use existing artwork.
This is a city RPG update; it does not implement every Torn mechanic.


## City life and progression

- Four trainable battle stats: strength (damage), defense (protection), speed
  (accuracy and initiative) and dexterity (evasion). Combat logs show misses.
- Happiness starts at 100. Each distinct valid furnishing placed at home adds
  10 to its cap, up to 200. Happiness above 100 adds up to 25% gym gains; each
  energy point trained uses 1 happiness. It recovers by 5 every 15 minutes
  offline, without banking unused full-pool recovery. A $50 home break restores
  up to 25 happiness, with a shared 30-minute cooldown.
- Successful crimes grant criminal experience equal to nerve spent. Every 100
  experience adds 1 to nerve capacity, capped at 25 extra. Failures grant none.
  Existing mastery, level and furnishing bonuses are preserved.
- Relocation commits moving fees, bank cash-out, job termination, listing
  returns, property storage and lock reset together. Repeated requests cannot
  charge the moving fee twice for the same destination. Flights remain separate.

Existing databases receive additive migrations at startup. Saved money, items,
base stats, education and trips are retained. Old accounts start with 8 dexterity,
100 happiness and 0 new criminal experience. These are LOCKDOWN's documented
city rules, not a claim of exact Torn balance. Artwork remains as installed.
