// Token Launch Radar — the value model (entry 2, dian566).
//
// One sealed snapshot in, one ranked board out. The board covers every slug
// on the snapshot's watchlist (the floor, never the ceiling) and adds the
// strongest pre-token protocols below the floor, by TVL, that pass the same
// exclusion rule the watchlist uses: no CEX, bridge, liquid-staking or
// restaked product, no wrapped/staked name, no exchange name, no version
// marker. A protocol is pre-token when its record carries no token at all
// (no market cap, no CoinGecko id, no symbol). Live-token protocols are kept
// apart: they are the comparables, never board rows.
//
// Implied value follows only from the snapshot's own figures:
//
//   sector multiple = median(mcap / tvl) of live-token protocols in the
//                       same category (global median when a category has
//                       fewer than three live comparables), clamped to
//                       [0.02, 2.0]
//   base            = tvl_usd x sector multiple
//   growth          = clamp(change_7d, -60, 120) per cent, 0 when unreported
//   growth mult     = 1 + (growth / 100) x 0.5
//   maturity        = 0.6 + min(age_days, 1095) / 1095 x 0.4
//                     (age from listed_at to the snapshot's as_of;
//                      365 days when listed_at is unreported)
//   implied         = max(1, round(base x growth mult x maturity))
//
// No protocol name is ever special-cased: the same function scores every row.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  multiple_floor: number;
  multiple_cap: number;
  min_category_comps: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  multiple_floor: 0.02,
  multiple_cap: 2.0,
  min_category_comps: 3,
};

export const MODEL_VERSION = 'dossier-radar-1';

/** Early rows below the watchlist floor, by TVL. Watchlist rows are 40. */
export const EARLY_ROWS = 160;

/** Live-token comparables carried into the dashboard, by market cap. */
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  farm_steps: string[];
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number;
  tier: 'watchlist' | 'early';
  base_usd: number;
  sector_multiple: number;
  growth_mult: number;
  maturity_mult: number;
  comps: { slug: string; name: string; mcap_usd: number; tvl_usd: number; multiple: number }[];
  risks: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  mcap_usd: number;
  tvl_usd: number;
  multiple: number;
}

export interface Radar {
  rows: BoardRow[];
  live: LiveRow[];
  early_size: number;
  live_size: number;
  global_multiple: number;
  model: ModelConstants;
  version: string;
}

const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

const VERSION_SUFFIX = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** True when the protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null && p.mcap_usd === null;
}

/** True when the protocol is a wrapped, staked, bridged or exchange product, not a launch of its own. */
export function isExcludedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  if (WRAPPED_WORD.test(p.name)) return true;
  if (VERSION_SUFFIX.test(p.name)) return true;
  for (const prefix of EXCHANGE_PREFIXES) {
    if (p.name.startsWith(prefix)) return true;
  }
  return false;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function ageDays(p: SnapshotProtocol, asOf: Date): number {
  if (p.listed_at === null) return MODEL.unknown_age_days;
  const listed = new Date(`${p.listed_at}T00:00:00Z`);
  const days = Math.floor((asOf.getTime() - listed.getTime()) / 86_400_000);
  return days < 0 ? 0 : days;
}

/** Median mcap/TVL of the live-token protocols in a category, or the global median. */
export function sectorMultiple(
  category: string | null,
  live: SnapshotProtocol[],
  globalMultiple: number,
): number {
  const same = live.filter(
    (p) => p.category === category && p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0,
  );
  const ratios = same.map((p) => p.mcap_usd! / p.tvl_usd);
  const base = ratios.length >= MODEL.min_category_comps ? median(ratios) : globalMultiple;
  return clamp(base, MODEL.multiple_floor, MODEL.multiple_cap);
}

export function parseSnapshot(text: string): Snapshot {
  const raw = JSON.parse(text) as Snapshot;
  if (!Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error('snapshot: protocols and watchlist must be arrays');
  }
  return raw;
}

/** Score one pre-token protocol. Pure: the same function scores every row. */
export function scoreProtocol(
  p: SnapshotProtocol,
  live: SnapshotProtocol[],
  globalMultiple: number,
  asOf: Date,
): Omit<BoardRow, 'rank' | 'farm_steps' | 'tier'> {
  const multiple = sectorMultiple(p.category, live, globalMultiple);
  const base = p.tvl_usd * multiple;
  const growth = clamp(p.change_7d ?? 0, MODEL.growth_floor, MODEL.growth_cap);
  const growthMult = 1 + (growth / 100) * MODEL.growth_weight;
  const age = ageDays(p, asOf);
  const maturityMult = MODEL.maturity_floor + (Math.min(age, MODEL.maturity_days) / MODEL.maturity_days) * MODEL.maturity_range;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  const comps = live
    .filter((q) => q.category === p.category && q.tvl_usd > 0 && q.mcap_usd !== null && q.mcap_usd > 0)
    .map((q) => ({ slug: q.slug, name: q.name, mcap_usd: q.mcap_usd!, tvl_usd: q.tvl_usd, multiple: q.mcap_usd! / q.tvl_usd }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd)
    .slice(0, 3);
  const risks: string[] = [];
  if ((p.change_7d ?? 0) < -10) risks.push(`TVL fell ${Math.abs(p.change_7d ?? 0).toFixed(1)}% in 7 days — momentum is against it right now.`);
  if (age < 180) risks.push(`Only ${age} days on record — young protocol, thin history to judge by.`);
  if (p.chains.length <= 1) risks.push(`Single-chain (${p.chains[0] ?? 'unknown'}) — a chain outage or fee spike hits everything.`);
  if (p.change_7d === null) risks.push('No 7-day TVL change reported — growth is assumed flat, not measured.');
  return {
    slug: p.slug,
    name: p.name,
    implied_value_usd: implied,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    age_days: age,
    base_usd: Math.round(base),
    sector_multiple: multiple,
    growth_mult: growthMult,
    maturity_mult: maturityMult,
    comps,
    risks,
  };
}

/** Concrete farm steps for a protocol, with cost and time in every step. */
export function farmSteps(p: SnapshotProtocol): FarmStep[] {
  const chain = p.chains[0] ?? 'its main chain';
  const cat = (p.category ?? '').toLowerCase();
  const name = p.name;
  const act: string = cat.includes('dex') || cat.includes('exchange')
    ? 'swap'
    : cat.includes('lending')
      ? 'supply assets'
      : cat.includes('yield') || cat.includes('vault')
        ? 'deposit into a vault'
        : cat.includes('perpetual') || cat.includes('derivative')
          ? 'open a small position'
          : cat.includes('rwa') || cat.includes('real world')
            ? 'take a small RWA position'
            : 'use the app';
  const steps: FarmStep[] = [
    {
      text: `Set up a fresh wallet and fund it with $50–$200 on ${chain} for gas and the first ${act} — about $2–$8 in gas, 15–30 minutes.`,
      cost: '$50–$200 capital, $2–$8 gas',
      time: '15–30 minutes',
    },
    {
      text: `Open ${name} on ${chain} and ${act} with a small real amount ($25–$100), keeping the receipt hash — about $1–$5 in gas, 10–20 minutes.`,
      cost: '$25–$100 capital, $1–$5 gas',
      time: '10–20 minutes',
    },
    {
      text: `Repeat the core action once a week for 4–8 weeks so the activity reads as a real user, not a one-off — about $1–$5 in gas per week, 10 minutes a week.`,
      cost: '$1–$5 gas per week',
      time: '10 minutes a week, 4–8 weeks',
    },
    {
      text: `Use a second feature of ${name} (a different pool, market or vault on ${chain}) at least twice, $10–$50 each time — about $2–$6 in gas, 20–40 minutes total.`,
      cost: '$20–$100 capital, $2–$6 gas',
      time: '20–40 minutes',
    },
    {
      text: `Keep a log (dates, amounts, hashes) and check ${name} weekly for quests, points or announcements; stop adding funds the moment a token or snapshot is announced and decide on the position then — free, 5 minutes a week.`,
      cost: 'free',
      time: '5 minutes a week',
    },
  ];
  return steps;
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const asOf = new Date(`${snapshot.as_of}T00:00:00Z`);
  const live = snapshot.protocols.filter((p) => !isPreToken(p));
  const liveRatios = live
    .filter((p) => p.tvl_usd > 0 && p.mcap_usd !== null && p.mcap_usd > 0)
    .map((p) => p.mcap_usd! / p.tvl_usd);
  const globalMultiple = clamp(median(liveRatios), MODEL.multiple_floor, MODEL.multiple_cap);
  const bySlug = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const watchlist = snapshot.watchlist
    .map((slug) => bySlug.get(slug))
    .filter((p): p is SnapshotProtocol => p !== undefined && isPreToken(p));
  const early = snapshot.protocols
    .filter((p) => isPreToken(p) && !isExcludedProduct(p) && !snapshot.watchlist.includes(p.slug))
    .sort((a, b) => b.tvl_usd - a.tvl_usd)
    .slice(0, EARLY_ROWS);
  const scored: BoardRow[] = [...watchlist.map((p) => ({ p, tier: 'watchlist' as const })), ...early.map((p) => ({ p, tier: 'early' as const }))]
    .map(({ p, tier }) => {
      const s = scoreProtocol(p, live, globalMultiple, asOf);
      const steps = farmSteps(p);
      return { ...s, rank: 0, farm_steps: steps.map((s2) => `${s2.text} (Cost: ${s2.cost}; time: ${s2.time}.)`), tier };
    })
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd || b.tvl_usd - a.tvl_usd);
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });
  // A crowded category is its own risk: many pre-token rivals chase the same launch.
  const perCategory = new Map<string, number>();
  for (const row of scored) perCategory.set(row.category ?? '', (perCategory.get(row.category ?? '') ?? 0) + 1);
  for (const row of scored) {
    const count = perCategory.get(row.category ?? '') ?? 0;
    if (count > 25) {
      row.risks.push(`${count} pre-token protocols share the ${row.category ?? 'Uncategorised'} category — a crowded field for one launch.`);
    }
  }
  const liveRows: LiveRow[] = live
    .filter((p) => p.mcap_usd !== null && p.tvl_usd > 0)
    .sort((a, b) => b.mcap_usd! - a.mcap_usd!)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      mcap_usd: p.mcap_usd!,
      tvl_usd: p.tvl_usd,
      multiple: p.mcap_usd! / p.tvl_usd,
    }));
  const radar: Radar = {
    rows: scored,
    live: liveRows,
    early_size: early.length,
    live_size: live.length,
    global_multiple: globalMultiple,
    model: MODEL,
    version: MODEL_VERSION,
  };
  return { board: scored, radar };
}

/** The gate's own refusal, or null when the board is valid. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100) return `board holds ${board.length} rows, fewer than 100`;
  const slugs = new Set(board.map((r) => r.slug));
  for (const slug of snapshot.watchlist) {
    if (!slugs.has(slug)) return `board misses watchlist slug ${slug}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `ranks are not exactly 1..${board.length}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return 'implied value rises with rank';
  }
  const values = new Set(board.map((r) => r.implied_value_usd));
  if (values.size === 1 && board.length > 1) return 'all implied values are equal';
  for (const row of board) {
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug}: farm_steps must be 3..12`;
    for (const step of row.farm_steps) {
      const t = step.trim();
      if (t.length < 20 || t.length > 600) return `${row.slug}: a farm step is ${t.length} chars`;
    }
  }
  return null;
}

/** The dashboard's data file: one global, no network. */
export function dataScript(radar: Radar, snapshot: Snapshot): string {
  const payload = {
    meta: {
      as_of: snapshot.as_of,
      floor_usd: snapshot.floor_usd,
      protocols: snapshot.protocols.length,
      watchlist: snapshot.watchlist.length,
      rows: radar.rows.length,
      model_version: radar.version,
      global_multiple: radar.global_multiple,
      model: radar.model,
    },
    rows: radar.rows,
    live: radar.live,
  };
  return `window.TOKEN_RADAR = ${JSON.stringify(payload)};\n`;
}
