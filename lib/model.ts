// The Node side of Token Radar: snapshot in, one ranked board out.
//
// The arithmetic is not here. It is in dashboard/model.js, the file the dashboard loads with a plain
// <script> tag, so the board's ranks and the detail drawer's recomputation are one function called
// twice. This file chooses which protocols are ranked, attaches the model's inputs to each row, and
// refuses a board the sealed gate would refuse.
//
// A protocol is pre-token when the index records no token at all (no market cap, no CoinGecko id, no
// symbol). The board covers every watchlist slug (the floor, never a ceiling) and adds the highest-TVL
// pre-token protocols below the floor: the early part of the radar. Live-token protocols are kept
// apart and shown with their real market caps, because they are the comparables the model prices
// against, not rows to farm.
import '../dashboard/model.js';

interface SnapshotProtocol {
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

interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

interface ModelValue {
  implied: number;
  low: number;
  high: number;
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  peers: number;
  multiple_source: string;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
  odds: number;
}

interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

interface Comparables {
  global: { n: number; median: number; q25: number; q75: number };
  cats: Record<string, { live: number; total: number; n: number; median: number | null; q25: number | null; q75: number | null }>;
  as_of: string;
  version: string;
}

interface RadarModelApi {
  constants: Record<string, number | string>;
  version: string;
  isPreToken(p: SnapshotProtocol): boolean;
  isRankable(p: SnapshotProtocol): boolean;
  comparables(snapshot: Snapshot): Comparables;
  value(p: SnapshotProtocol, ctx: Comparables): ModelValue;
  farm(p: SnapshotProtocol, v: ModelValue): FarmStep[];
  stepText(step: FarmStep): string;
}

const RM = (globalThis as unknown as { RadarModel: RadarModelApi }).RadarModel;

export const MODEL_VERSION = RM.version;
export const MODEL = RM.constants;

/** How many pre-token protocols below the watchlist floor the early radar carries, by TVL. */
export const EARLY_ROWS = 160;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, ctx: Comparables): Record<string, unknown>[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && RM.isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, v: RM.value(p, ctx) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.v.age_days,
    implied_value_usd: s.v.implied,
    implied_low_usd: s.v.low,
    implied_high_usd: s.v.high,
    multiple_of_tvl: s.v.multiple,
    launch_odds: s.v.odds,
    peer_tokens: s.v.peers,
    model: {
      version: MODEL_VERSION,
      multiple: s.v.multiple,
      multiple_source: s.v.multiple_source,
      growth_pct: s.v.growth_pct,
      growth_multiplier: round4(s.v.growth_multiplier),
      maturity_multiplier: round4(s.v.maturity_multiplier),
      age_days: s.v.age_days,
    },
    farm_steps: RM.farm(s.p, s.v).map(RM.stepText),
  }));
}

/** The live-token protocols, by market cap: the comparables, shown as facts rather than models. */
export function liveRows(snapshot: Snapshot): Record<string, unknown>[] {
  return snapshot.protocols
    .filter((p) => !RM.isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      multiple_of_tvl: p.tvl_usd > 0 && p.mcap_usd ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: Record<string, unknown>[]; radar: Record<string, unknown> } {
  const ctx = RM.comparables(snapshot);
  const board = buildBoard(snapshot, ctx);
  const live = liveRows(snapshot);
  const watch = new Set(snapshot.watchlist);
  const cats = Object.keys(ctx.cats)
    .map((cat) => ({
      category: cat,
      peers: ctx.cats[cat]!.n,
      live: ctx.cats[cat]!.live,
      total: ctx.cats[cat]!.total,
      multiple: ctx.cats[cat]!.median,
      q25: ctx.cats[cat]!.q25,
      q75: ctx.cats[cat]!.q75,
    }))
    .filter((c) => c.live > 0)
    .sort((a, b) => b.live - a.live || (a.category < b.category ? -1 : 1));
  const radar = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug as string)).length,
    live_size: live.length,
    comparables: { global: ctx.global, cats, version: ctx.version },
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      implied_low_usd: r.implied_low_usd,
      implied_high_usd: r.implied_high_usd,
      multiple_of_tvl: r.multiple_of_tvl,
      launch_odds: r.launch_odds,
      peer_tokens: r.peer_tokens,
      growth_multiplier: (r.model as Record<string, unknown>).growth_multiplier,
      maturity_multiplier: (r.model as Record<string, unknown>).maturity_multiplier,
    })),
    live,
  };
  return { board, radar };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: Record<string, unknown>[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board has ${board.length} rows`;
  for (let i = 0; i < board.length; i++) if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
  for (let i = 1; i < board.length; i++) {
    if ((board[i]!.implied_value_usd as number) > (board[i - 1]!.implied_value_usd as number)) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if ((board[0]!.implied_value_usd as number) === (board[board.length - 1]!.implied_value_usd as number)) return 'every row shares one implied value';
  for (const r of board) {
    const steps = r.farm_steps as string[];
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || (r.implied_value_usd as number) <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
