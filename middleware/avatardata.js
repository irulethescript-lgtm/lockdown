// ─── AVATAR LAYER SYSTEM ────────────────────────────────────────────────────
// Layered paper-doll avatar. Each category is one transparent PNG layer.

const AVATAR_CATEGORIES = [
  { id: 'head',     label: 'Skin Tone',   icon: '🟤', zIndex: 0 },
  { id: 'tattoos',  label: 'Tattoos',     icon: '🩸', zIndex: 1 },
  { id: 'eyebrows', label: 'Eyebrows',    icon: '〰️', zIndex: 2 },
  { id: 'eyes',     label: 'Eyes',        icon: '👁️', zIndex: 3 },
  { id: 'nose',     label: 'Nose',        icon: '👃', zIndex: 4 },
  { id: 'mouth',    label: 'Mouth',       icon: '👄', zIndex: 5 },
  { id: 'extras',   label: 'Extras',      icon: '🎭', zIndex: 6 },
  { id: 'hair',     label: 'Hair',        icon: '💈', zIndex: 7 },
  { id: 'hats',     label: 'Hats',        icon: '🎩', zIndex: 8 },
];

const AVATAR_PARTS = {

  // ── HEADS (skin tones) ──────────────────────────────────────────────────────
  head: [
    { key: 'head-001',      name: 'Light',    img: '/avatars/heads/head-001.png',       rep_cost: 0,   free: true  },
    { key: 'head-002-dark', name: 'Dark',     img: '/avatars/heads/head-002-dark.png',  rep_cost: 0,   free: true  },
    { key: 'head-003',      name: 'Pale',     img: '/avatars/heads/head-003.png',       rep_cost: 0,   free: true  },
    { key: 'head-004',      name: 'Tan',      img: '/avatars/heads/head-004.png',       rep_cost: 0,   free: true  },
    { key: 'head-005',      name: 'Zombie',   img: '/avatars/heads/head-005.png',       rep_cost: 100, free: false },
  ],

  // ── TATTOOS ─────────────────────────────────────────────────────────────────
  tattoos: [
    { key: 'none',                    name: 'None',             img: null,                                              rep_cost: 0,  free: true  },
    { key: 'tattoo-cheeks-red',       name: 'Cheek Marks',      img: '/avatars/tattoos/tattoo-cheeks-red.png',          rep_cost: 0,  free: true  },
    { key: 'tattoo-teardrops',        name: 'Teardrops',        img: '/avatars/tattoos/tattoo-teardrops.png',           rep_cost: 50, free: false },
    { key: 'tattoo-forehead-barcode', name: 'Forehead Barcode', img: '/avatars/tattoos/tattoo-forehead-barcode.png',    rep_cost: 75, free: false },
  ],

  // ── EYEBROWS ────────────────────────────────────────────────────────────────
  eyebrows: [
    { key: 'none',               name: 'None',           img: null,                                          rep_cost: 0,  free: true  },
    { key: 'brows-normal-brown', name: 'Normal Brown',   img: '/avatars/eyebrows/brows-normal-brown.png',    rep_cost: 0,  free: true  },
    { key: 'brows-normal-black', name: 'Normal Black',   img: '/avatars/eyebrows/brows-normal-black.png',   rep_cost: 0,  free: true  },
    { key: 'brows-normal-blonde',name: 'Normal Blonde',  img: '/avatars/eyebrows/brows-normal-blonde.png',  rep_cost: 0,  free: true  },
    { key: 'brows-flat-brown',   name: 'Flat Brown',     img: '/avatars/eyebrows/brows-flat-brown.png',     rep_cost: 0,  free: true  },
    { key: 'brows-flat-black',   name: 'Flat Black',     img: '/avatars/eyebrows/brows-flat-black.png',     rep_cost: 0,  free: true  },
    { key: 'brows-arched-brown', name: 'Arched Brown',   img: '/avatars/eyebrows/brows-arched-brown.png',   rep_cost: 25, free: false },
    { key: 'brows-arched-black', name: 'Arched Black',   img: '/avatars/eyebrows/brows-arched-black.png',   rep_cost: 25, free: false },
    { key: 'brows-angry-red',    name: 'Angry Red',      img: '/avatars/eyebrows/brows-angry-red.png',      rep_cost: 50, free: false },
  ],

  // ── EYES ────────────────────────────────────────────────────────────────────
  eyes: [
    { key: 'eyes-brown',        name: 'Brown',         img: '/avatars/eyes/eyes-brown.png',          rep_cost: 0,   free: true  },
    { key: 'eyes-blue',         name: 'Blue',          img: '/avatars/eyes/eyes-blue.png',           rep_cost: 0,   free: true  },
    { key: 'eyes-green',        name: 'Green',         img: '/avatars/eyes/eyes-green.png',          rep_cost: 0,   free: true  },
    { key: 'eyes-grey',         name: 'Grey',          img: '/avatars/eyes/eyes-grey.png',           rep_cost: 0,   free: true  },
    { key: 'eyes-amber',        name: 'Amber',         img: '/avatars/eyes/eyes-amber.png',          rep_cost: 0,   free: true  },
    { key: 'eyes-narrow-blue',  name: 'Narrow Blue',   img: '/avatars/eyes/eyes-narrow-blue.png',    rep_cost: 25,  free: false },
    { key: 'eyes-narrow-green', name: 'Narrow Green',  img: '/avatars/eyes/eyes-narrow-green.png',   rep_cost: 25,  free: false },
    { key: 'eyes-wide-blue',    name: 'Wide Blue',     img: '/avatars/eyes/eyes-wide-blue.png',      rep_cost: 25,  free: false },
    { key: 'eyes-glow-cyan',    name: 'Glow Cyan',     img: '/avatars/eyes/eyes-glow-cyan.png',      rep_cost: 100, free: false },
    { key: 'eyes-glow-red',     name: 'Glow Red',      img: '/avatars/eyes/eyes-glow-red.png',       rep_cost: 100, free: false },
    { key: 'eyes-glow-green',   name: 'Glow Green',    img: '/avatars/eyes/eyes-glow-green.png',     rep_cost: 100, free: false },
  ],

  // ── NOSE ────────────────────────────────────────────────────────────────────
  nose: [
    { key: 'none',                name: 'None',            img: null,                                          rep_cost: 0,  free: true  },
    { key: 'nose-small-light',    name: 'Small (Light)',   img: '/avatars/nose/nose-small-light.png',          rep_cost: 0,  free: true  },
    { key: 'nose-small-medium',   name: 'Small (Medium)',  img: '/avatars/nose/nose-small-medium.png',         rep_cost: 0,  free: true  },
    { key: 'nose-small-dark',     name: 'Small (Dark)',    img: '/avatars/nose/nose-small-dark.png',           rep_cost: 0,  free: true  },
    { key: 'nose-wide-light',     name: 'Wide (Light)',    img: '/avatars/nose/nose-wide-light.png',           rep_cost: 0,  free: true  },
    { key: 'nose-wide-medium',    name: 'Wide (Medium)',   img: '/avatars/nose/nose-wide-medium.png',          rep_cost: 0,  free: true  },
    { key: 'nose-pointed-light',  name: 'Pointed (Light)', img: '/avatars/nose/nose-pointed-light.png',        rep_cost: 25, free: false },
    { key: 'nose-pointed-medium', name: 'Pointed (Medium)',img: '/avatars/nose/nose-pointed-medium.png',       rep_cost: 25, free: false },
  ],

  // ── MOUTH ───────────────────────────────────────────────────────────────────
  mouth: [
    { key: 'mouth-neutral-light',  name: 'Neutral (Light)',  img: '/avatars/mouth/mouth-neutral-light.png',  rep_cost: 0,  free: true  },
    { key: 'mouth-neutral-medium', name: 'Neutral (Medium)', img: '/avatars/mouth/mouth-neutral-medium.png', rep_cost: 0,  free: true  },
    { key: 'mouth-neutral-dark',   name: 'Neutral (Dark)',   img: '/avatars/mouth/mouth-neutral-dark.png',   rep_cost: 0,  free: true  },
    { key: 'mouth-smile-light',    name: 'Smile (Light)',    img: '/avatars/mouth/mouth-smile-light.png',    rep_cost: 0,  free: true  },
    { key: 'mouth-smile-medium',   name: 'Smile (Medium)',   img: '/avatars/mouth/mouth-smile-medium.png',   rep_cost: 0,  free: true  },
    { key: 'mouth-smile-dark',     name: 'Smile (Dark)',     img: '/avatars/mouth/mouth-smile-dark.png',     rep_cost: 0,  free: true  },
    { key: 'mouth-grimace-medium', name: 'Grimace (Medium)', img: '/avatars/mouth/mouth-grimace-medium.png', rep_cost: 0,  free: true  },
    { key: 'mouth-grimace-dark',   name: 'Grimace (Dark)',   img: '/avatars/mouth/mouth-grimace-dark.png',   rep_cost: 0,  free: true  },
    { key: 'mouth-open-light',     name: 'Open (Light)',     img: '/avatars/mouth/mouth-open-light.png',     rep_cost: 0,  free: true  },
    { key: 'mouth-open-medium',    name: 'Open (Medium)',    img: '/avatars/mouth/mouth-open-medium.png',    rep_cost: 0,  free: true  },
    { key: 'mouth-smile-red',      name: 'Smile (Red Lips)', img: '/avatars/mouth/mouth-smile-red.png',      rep_cost: 25, free: false },
    { key: 'mouth-neutral-red',    name: 'Neutral (Red)',    img: '/avatars/mouth/mouth-neutral-red.png',    rep_cost: 25, free: false },
    { key: 'mouth-smile-purple',   name: 'Smile (Purple)',   img: '/avatars/mouth/mouth-smile-purple.png',   rep_cost: 50, free: false },
    { key: 'mouth-neutral-black',  name: 'Neutral (Black)',  img: '/avatars/mouth/mouth-neutral-black.png',  rep_cost: 50, free: false },
  ],

  // ── EXTRAS (masks, glasses, scars, beards) ──────────────────────────────────
  extras: [
    { key: 'none',                  name: 'None',               img: null,                                           rep_cost: 0,   free: true  },
    { key: 'mask-surgical',         name: 'Surgical Mask',      img: '/avatars/extras/mask-surgical.png',            rep_cost: 0,   free: true  },
    { key: 'glasses-round-black',   name: 'Round Glasses',      img: '/avatars/extras/glasses-round-black.png',      rep_cost: 0,   free: true  },
    { key: 'beard-black',           name: 'Beard (Black)',      img: '/avatars/extras/beard-black.png',              rep_cost: 0,   free: true  },
    { key: 'beard-brown',           name: 'Beard (Brown)',      img: '/avatars/extras/beard-brown.png',              rep_cost: 0,   free: true  },
    { key: 'beard-blonde',          name: 'Beard (Blonde)',     img: '/avatars/extras/beard-blonde.png',             rep_cost: 0,   free: true  },
    { key: 'beard-white',           name: 'Beard (White)',      img: '/avatars/extras/beard-white.png',              rep_cost: 25,  free: false },
    { key: 'glasses-round-gold',    name: 'Gold Glasses',       img: '/avatars/extras/glasses-round-gold.png',       rep_cost: 25,  free: false },
    { key: 'glasses-sunglasses',    name: 'Sunglasses',         img: '/avatars/extras/glasses-sunglasses.png',       rep_cost: 25,  free: false },
    { key: 'scar-cheek',            name: 'Cheek Scar',         img: '/avatars/extras/scar-cheek.png',               rep_cost: 50,  free: false },
    { key: 'mask-balaclava-black',  name: 'Balaclava (Black)',  img: '/avatars/extras/mask-balaclava-black.png',     rep_cost: 75,  free: false },
    { key: 'mask-balaclava-green',  name: 'Balaclava (Green)',  img: '/avatars/extras/mask-balaclava-green.png',     rep_cost: 75,  free: false },
    { key: 'mask-balaclava-brown',  name: 'Balaclava (Brown)',  img: '/avatars/extras/mask-balaclava-brown.png',     rep_cost: 75,  free: false },
    { key: 'mask-gas',              name: 'Gas Mask',           img: '/avatars/extras/mask-gas.png',                 rep_cost: 150, free: false },
  ],

  // ── HAIR ────────────────────────────────────────────────────────────────────
  hair: [
    { key: 'none',             name: 'Bald',           img: '/avatars/hair/hair-bald.png',           rep_cost: 0,   free: true  },
    { key: 'hair-short-black', name: 'Short Black',    img: '/avatars/hair/hair-short-black.png',    rep_cost: 0,   free: true  },
    { key: 'hair-short-brown', name: 'Short Brown',    img: '/avatars/hair/hair-short-brown.png',    rep_cost: 0,   free: true  },
    { key: 'hair-short-blonde',name: 'Short Blonde',   img: '/avatars/hair/hair-short-blonde.png',   rep_cost: 0,   free: true  },
    { key: 'hair-short-red',   name: 'Short Red',      img: '/avatars/hair/hair-short-red.png',      rep_cost: 0,   free: true  },
    { key: 'hair-long-black',  name: 'Long Black',     img: '/avatars/hair/hair-long-black.png',     rep_cost: 0,   free: true  },
    { key: 'hair-long-brown',  name: 'Long Brown',     img: '/avatars/hair/hair-long-brown.png',     rep_cost: 0,   free: true  },
    { key: 'hair-long-blonde', name: 'Long Blonde',    img: '/avatars/hair/hair-long-blonde.png',    rep_cost: 0,   free: true  },
    { key: 'hair-long-red',    name: 'Long Red',       img: '/avatars/hair/hair-long-red.png',       rep_cost: 0,   free: true  },
    { key: 'hair-afro-black',  name: 'Afro Black',     img: '/avatars/hair/hair-afro-black.png',     rep_cost: 0,   free: true  },
    { key: 'hair-afro-brown',  name: 'Afro Brown',     img: '/avatars/hair/hair-afro-brown.png',     rep_cost: 0,   free: true  },
    { key: 'hair-short-white', name: 'Short White',    img: '/avatars/hair/hair-short-white.png',    rep_cost: 25,  free: false },
    { key: 'hair-long-white',  name: 'Long White',     img: '/avatars/hair/hair-long-white.png',     rep_cost: 25,  free: false },
    { key: 'hair-spiky-black', name: 'Spiky Black',    img: '/avatars/hair/hair-spiky-black.png',    rep_cost: 25,  free: false },
    { key: 'hair-spiky-red',   name: 'Spiky Red',      img: '/avatars/hair/hair-spiky-red.png',      rep_cost: 25,  free: false },
    { key: 'hair-mohawk-black',name: 'Mohawk Black',   img: '/avatars/hair/hair-mohawk-black.png',   rep_cost: 50,  free: false },
    { key: 'hair-mohawk-red',  name: 'Mohawk Red',     img: '/avatars/hair/hair-mohawk-red.png',     rep_cost: 50,  free: false },
    { key: 'hair-short-blue',  name: 'Short Blue',     img: '/avatars/hair/hair-short-blue.png',     rep_cost: 75,  free: false },
    { key: 'hair-short-green', name: 'Short Green',    img: '/avatars/hair/hair-short-green.png',    rep_cost: 75,  free: false },
    { key: 'hair-spiky-blue',  name: 'Spiky Blue',     img: '/avatars/hair/hair-spiky-blue.png',     rep_cost: 100, free: false },
    { key: 'hair-mohawk-blue', name: 'Mohawk Blue',    img: '/avatars/hair/hair-mohawk-blue.png',    rep_cost: 100, free: false },
  ],

  // ── HATS ────────────────────────────────────────────────────────────────────
  hats: [
    { key: 'none',            name: 'None',            img: null,                                          rep_cost: 0,   free: true  },
    { key: 'hat-beanie-black',name: 'Beanie (Black)',  img: '/avatars/hats/hat-beanie-black.png',          rep_cost: 0,   free: true  },
    { key: 'hat-beanie-red',  name: 'Beanie (Red)',    img: '/avatars/hats/hat-beanie-red.png',            rep_cost: 0,   free: true  },
    { key: 'hat-beanie-blue', name: 'Beanie (Blue)',   img: '/avatars/hats/hat-beanie-blue.png',           rep_cost: 0,   free: true  },
    { key: 'hat-cap-black',   name: 'Cap (Black)',     img: '/avatars/hats/hat-cap-black.png',             rep_cost: 0,   free: true  },
    { key: 'hat-cap-red',     name: 'Cap (Red)',       img: '/avatars/hats/hat-cap-red.png',               rep_cost: 0,   free: true  },
    { key: 'hat-cap-brown',   name: 'Cap (Brown)',     img: '/avatars/hats/hat-cap-brown.png',             rep_cost: 0,   free: true  },
    { key: 'hat-beret-black', name: 'Beret (Black)',   img: '/avatars/hats/hat-beret-black.png',           rep_cost: 25,  free: false },
    { key: 'hat-beret-red',   name: 'Beret (Red)',     img: '/avatars/hats/hat-beret-red.png',             rep_cost: 25,  free: false },
    { key: 'hat-beanie-green',name: 'Beanie (Green)',  img: '/avatars/hats/hat-beanie-green.png',          rep_cost: 25,  free: false },
    { key: 'hat-hood-black',  name: 'Hood (Black)',    img: '/avatars/hats/hat-hood-black.png',            rep_cost: 50,  free: false },
    { key: 'hat-hood-grey',   name: 'Hood (Grey)',     img: '/avatars/hats/hat-hood-grey.png',             rep_cost: 50,  free: false },
    { key: 'hat-tophat-black',name: 'Top Hat (Black)', img: '/avatars/hats/hat-tophat-black.png',          rep_cost: 75,  free: false },
    { key: 'hat-tophat-brown',name: 'Top Hat (Brown)', img: '/avatars/hats/hat-tophat-brown.png',          rep_cost: 75,  free: false },
  ],
};

const DEFAULT_AVATAR = {
  head:     'head-001',
  tattoos:  'none',
  eyebrows: 'brows-normal-brown',
  eyes:     'eyes-brown',
  nose:     'nose-small-medium',
  mouth:    'mouth-neutral-medium',
  extras:   'none',
  hair:     'hair-short-black',
  hats:     'none',
};

module.exports = { AVATAR_CATEGORIES, AVATAR_PARTS, DEFAULT_AVATAR };
