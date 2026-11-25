import type { Snapshot, SnapshotProtocol } from './snapshot.ts';
import { farmSteps } from './farm-plans.ts';

/**
 * Snapshot valuation: usable tokenized ratios require finite mcap > 0 and TVL > 0.
 * Category multiple = (n * median of ratios clipped to global p25..p75 + 8 * raw global median) / (n + 8).
 * Momentum = clamp(1 + change_7d / 100, 0.7, 1.5); missing change is zero.
 * Age is days from listed_at to the latest listed_at in the snapshot; missing age is zero.
 * Seasoning = 0.8 + 0.4 * min(age / 720, 1).
 * Reach = min(1 + 0.02 * (chains.length - 1), 1.10).
 * Implied value = max(1, round(TVL * category multiple * momentum * seasoning * reach)).
 */
export const MODEL_CONSTANTS = {
  shrinkage_weight: 8,
  momentum_min: 0.7,
  momentum_max: 1.5,
  seasoning_base: 0.8,
  seasoning_range: 0.4,
  seasoning_days: 720,
  reach_per_chain: 0.02,
  reach_cap: 1.10,
};

export interface CategoryCalibration {
  category: string | null;
  n: number;
  median: number | null;
  multiple: number;
}

export interface Calibration {
  constants: typeof MODEL_CONSTANTS;
  global_n: number;
  global_median: number;
  global_p25: number;
  global_p75: number;
  latest_listed_at: string | null;
  categories: CategoryCalibration[];
}

export interface Breakdown {
  category_n: number;
  category_median: number | null;
  category_multiple: number;
  change_7d_used: number;
  momentum: number;
  age_days: number;
  seasoning: number;
  chain_count: number;
  reach: number;
  unrounded_value_usd: number;
}

export interface BoardRow extends SnapshotProtocol {
  rank: number;
  implied_value_usd: number;
  implied_multiple: number;
  watchlist: boolean;
  below_floor: boolean;
  token_status: 'no token recorded';
  signal_tier: 'S' | 'A' | 'B';
  category_rank: number;
  category_size: number;
  model: Breakdown;
  farm_steps: string[];
}

const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const VERSION_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/i;

export function isPreToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

export function passesObservableRules(protocol: SnapshotProtocol): boolean {
  return isPreToken(protocol) && !EXCLUDED_CATEGORIES.has(protocol.category ?? '')
    && !VERSION_MARKER.test(protocol.name) && !PRODUCT_WORD.test(protocol.name)
    && !EXCHANGE_PREFIX.test(protocol.name);
}

export function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0;
}

function quantile(sorted: number[], probability: number): number {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  return sorted[lower]! + (sorted[Math.ceil(position)]! - sorted[lower]!) * (position - lower);
}

export function computeSnapshotCalibration(snapshot: Snapshot): Calibration {
  const groups = new Map<string | null, number[]>();
  for (const protocol of snapshot.protocols) groups.set(protocol.category, []);
  const ratios: number[] = [];
  for (const protocol of snapshot.protocols) {
    if (isPreToken(protocol) || protocol.mcap_usd === null || !Number.isFinite(protocol.mcap_usd)
      || protocol.mcap_usd <= 0 || !Number.isFinite(protocol.tvl_usd) || protocol.tvl_usd <= 0) continue;
    const ratio = protocol.mcap_usd / protocol.tvl_usd;
    ratios.push(ratio);
    groups.get(protocol.category)!.push(ratio);
  }
  if (ratios.length === 0) throw new Error('Snapshot has no usable positive tokenized market-cap/TVL ratios');
  ratios.sort((first, second) => first - second);
  const globalMedian = quantile(ratios, 0.5);
  const globalP25 = quantile(ratios, 0.25);
  const globalP75 = quantile(ratios, 0.75);
  const categories = [...groups.entries()].sort(([first], [second]) => compareText(first ?? '', second ?? '')).map(([category, values]) => {
    const clipped = values.map((ratio) => Math.min(globalP75, Math.max(globalP25, ratio))).sort((first, second) => first - second);
    const median = clipped.length ? quantile(clipped, 0.5) : null;
    return {
      category,
      n: values.length,
      median,
      multiple: (values.length * (median ?? globalMedian) + MODEL_CONSTANTS.shrinkage_weight * globalMedian)
        / (values.length + MODEL_CONSTANTS.shrinkage_weight),
    };
  });
  const listingDates = snapshot.protocols.flatMap((protocol) => protocol.listed_at ? [protocol.listed_at] : []).sort(compareText);
  return {
    constants: MODEL_CONSTANTS,
    global_n: ratios.length,
    global_median: globalMedian,
    global_p25: globalP25,
    global_p75: globalP75,
    latest_listed_at: listingDates.at(-1) ?? null,
    categories,
  };
}

export function valueProtocol(protocol: SnapshotProtocol, calibration: Calibration): { implied: number; model: Breakdown } {
  const category = calibration.categories.find((group) => group.category === protocol.category);
  const multiple = category?.multiple ?? calibration.global_median;
  const change = protocol.change_7d ?? 0;
  const momentum = Math.min(MODEL_CONSTANTS.momentum_max, Math.max(MODEL_CONSTANTS.momentum_min, 1 + change / 100));
  const age = protocol.listed_at && calibration.latest_listed_at
    ? (Date.parse(calibration.latest_listed_at) - Date.parse(protocol.listed_at)) / 86_400_000 : 0;
  const seasoning = MODEL_CONSTANTS.seasoning_base + MODEL_CONSTANTS.seasoning_range * Math.min(age / MODEL_CONSTANTS.seasoning_days, 1);
  const reach = Math.min(1 + MODEL_CONSTANTS.reach_per_chain * (protocol.chains.length - 1), MODEL_CONSTANTS.reach_cap);
  const unrounded = protocol.tvl_usd * multiple * momentum * seasoning * reach;
  return {
    implied: Math.max(1, Math.round(unrounded)),
    model: {
      category_n: category?.n ?? 0,
      category_median: category?.median ?? null,
      category_multiple: multiple,
      change_7d_used: change,
      momentum,
      age_days: age,
      seasoning,
      chain_count: protocol.chains.length,
      reach,
      unrounded_value_usd: unrounded,
    },
  };
}

export function buildBoard(snapshot: Snapshot, calibration: Calibration): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const candidates = snapshot.protocols.filter((protocol) => watchlist.has(protocol.slug) || passesObservableRules(protocol));
  const scored = candidates.map((protocol) => ({ protocol, ...valueProtocol(protocol, calibration) }));
  const compareValue = (first: typeof scored[number], second: typeof scored[number]) => second.implied - first.implied
    || second.protocol.tvl_usd - first.protocol.tvl_usd || compareText(first.protocol.slug, second.protocol.slug);
  scored.sort(compareValue);
  const retained = scored.length > 240
    ? scored.filter((entry) => watchlist.has(entry.protocol.slug)).concat(scored.filter((entry) => !watchlist.has(entry.protocol.slug)).slice(0, 240 - watchlist.size)).sort(compareValue)
    : scored;
  const categorySizes = new Map<string | null, number>();
  for (const entry of retained) categorySizes.set(entry.protocol.category, (categorySizes.get(entry.protocol.category) ?? 0) + 1);
  const categoryRanks = new Map<string | null, number>();
  return retained.map((entry, index) => {
    const protocol = entry.protocol;
    const rank = index + 1;
    const categoryRank = (categoryRanks.get(protocol.category) ?? 0) + 1;
    categoryRanks.set(protocol.category, categoryRank);
    return {
      ...protocol,
      rank,
      implied_value_usd: entry.implied,
      implied_multiple: entry.implied / protocol.tvl_usd,
      watchlist: watchlist.has(protocol.slug),
      below_floor: protocol.tvl_usd < snapshot.floor_usd,
      token_status: 'no token recorded',
      signal_tier: rank <= 10 ? 'S' : rank <= 40 ? 'A' : 'B',
      category_rank: categoryRank,
      category_size: categorySizes.get(protocol.category)!,
      model: entry.model,
      farm_steps: farmSteps(protocol),
    };
  });
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 240) return `board size ${board.length} is outside 100..240`;
  const slugs = new Set(board.map((row) => row.slug));
  if (slugs.size !== board.length) return 'duplicate board slugs';
  if (snapshot.watchlist.some((slug) => !slugs.has(slug))) return 'watchlist coverage is incomplete';
  const steps = new Set<string>();
  for (const [index, row] of board.entries()) {
    if (!isPreToken(row)) return `${row.slug} records a token`;
    if (row.rank !== index + 1 || (index > 0 && row.implied_value_usd > board[index - 1]!.implied_value_usd)) return `invalid rank/value order at ${row.slug}`;
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 100_000_000_000_000) return `invalid value at ${row.slug}`;
    if (row.farm_steps.length !== 5) return `${row.slug} needs exactly five farm steps`;
    for (const step of row.farm_steps) {
      if (step.trim().length < 120 || step.trim().length > 400 || steps.has(step)) return `invalid or repeated farm step at ${row.slug}`;
      steps.add(step);
    }
  }
  if (board[0]!.implied_value_usd === board.at(-1)!.implied_value_usd) return 'all board values are equal';
  return null;
}

export function buildRadar(snapshot: Snapshot, calibration: Calibration) {
  const board = buildBoard(snapshot, calibration);
  return {
    board,
    radar: {
      product: 'Pre-Token Radar',
      model_version: 'snapshot-shrinkage-1',
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      protocols_scanned: snapshot.protocols.length,
      pre_token_candidates: snapshot.protocols.filter(isPreToken).length,
      tokenized_count: snapshot.protocols.filter((protocol) => !isPreToken(protocol)).length,
      observable_candidates: snapshot.protocols.filter(passesObservableRules).length,
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: board.filter((row) => row.below_floor).length,
      total_implied_value_usd: board.reduce((total, row) => total + row.implied_value_usd, 0),
      calibration,
      rows: board,
    },
  };
}

export function dataScript(radar: ReturnType<typeof buildRadar>['radar']): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
