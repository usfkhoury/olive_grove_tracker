// Plain JS (no JSX imports) so src/lib/*.test.js can run under node --test.
export const TANAKE_KG = 15; // one 16 L tin ≈ 15 kg of oil
export const TANAKE_L = 16;
export const KG_PER_L = TANAKE_KG / TANAKE_L;

// Must match the select options on the Notion "Tree checks" DB.
export const CHECK_OPTIONS = {
  canopy_density: ['Low', 'Medium', 'High', 'Very high'],
  fruit_size: ['Small', 'Medium', 'Big'],
  pruning_planned: ['Skip', 'Light', 'Medium', 'Heavy'],
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Local date, not UTC — toISOString() would yield yesterday between midnight
// and ~2-3am Lebanon time. en-CA formats as YYYY-MM-DD.
export const today = () => new Date().toLocaleDateString('en-CA');

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Plain-language explanations shown behind ⓘ buttons.
export const GLOSSARY = {
  ratio: 'Kg of olives needed for 1 kg of oil. 5:1 = 5 kg olives → 1 kg oil. Lower means more oil per kg; early green (khadir) picking runs higher, about 5.5–6:1.',
  tanake: 'تنكة — a 16 L tin, about 15 kg of oil.',
  ripeness: 'Jaén scale from skin and flesh colour: 0 deep green · 1 yellow-green · 2 green with red spots on under half the skin · 3 red/purple on over half · 4 black skin, white flesh · 5 black, flesh under half purple · 6 black, flesh over half purple · 7 purple to the stone. Khadir target ≈ 1.5–2.5.',
  sacks: 'كيس جنفاص — jute sacks filled from this tree, about 25 kg of olives each. The only per-tree yield measure, since each press mixes many trees.',
  adjustment: 'A correction after counting the bottles at home: the difference between what the ledger says and what is really there.',
};
