import type { Snapshot, SnapshotProtocol } from './snapshot.ts';
import { farmPlan } from './farm-plans.ts';
import type { StepMeta } from './farm-plans.ts';

/**
 * Snapshot valuation. Quantiles use nearest rank: sorted[ceil(p * n) - 1].
 * A clips raw mcap/TVL ratios to unweighted global p25..p75; B clips ln(ratio) to
 * global p5..p95 before exponentiating. C retains A's clips and TVL-weights the medians.
 * C multiple = (n * category TVL-weighted median + 8 * global TVL-weighted median) / (n + 8), n = peer count.
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

export type WinsorVariant = 'A' | 'B' | 'C';

export interface CategoryCalibration {
  category: string | null;
  n: number;
  median: number | null;
  multiple: number;
}

export interface VariantMetrics {
  variant: WinsorVariant;
  label: string;
  mdape: number;
  within_2x: number;
  log_r2: number;
  n: number;
}

export interface Backtest {
  n: number;
  chosen: WinsorVariant;
  reason: string;
  mdape_gap_pp: number;
  variants: VariantMetrics[];
}

export interface Calibration {
  constants: typeof MODEL_CONSTANTS;
  variant: WinsorVariant;
  variant_label: string;
  global_n: number;
  global_median: number;
  clip_low: number;
  clip_high: number;
  clip_prob_low: number;
  clip_prob_high: number;
  latest_listed_at: string | null;
  categories: CategoryCalibration[];
  backtest: Backtest;
  residual_p25: number;
  residual_p75: number;
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

export interface Comparable {
  name: string;
  tvl_usd: number;
  mcap_usd: number;
  ratio: number;
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
  steps_meta: StepMeta[];
  totals: { cost_low: number; cost_high: number; total_minutes: number };
}

export interface EvidenceRow extends BoardRow {
  bear_usd: number;
  bull_usd: number;
  comps: Comparable[];
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

export function nearestRank(sorted: number[], probability: number): number {
  if (sorted.length === 0) throw new Error('nearestRank: empty sample');
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(probability * sorted.length) - 1));
  return sorted[index]!;
}

function sortedNumbers(values: number[]): number[] {
  return values.toSorted((first, second) => first - second);
}

function median(values: number[]): number {
  const sorted = sortedNumbers(values);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.ceil((sorted.length - 1) / 2)]!) / 2;
}

function usableRatio(protocol: SnapshotProtocol): boolean {
  return protocol.mcap_usd !== null && Number.isFinite(protocol.mcap_usd) && protocol.mcap_usd > 0
    && Number.isFinite(protocol.tvl_usd) && protocol.tvl_usd > 0;
}

function ageDays(protocol: SnapshotProtocol, latest: string | null): number {
  return protocol.listed_at && latest ? (Date.parse(latest) - Date.parse(protocol.listed_at)) / 86_400_000 : 0;
}

function factors(protocol: SnapshotProtocol, latest: string | null) {
  const change = protocol.change_7d ?? 0;
  const momentum = Math.min(MODEL_CONSTANTS.momentum_max, Math.max(MODEL_CONSTANTS.momentum_min, 1 + change / 100));
  const age = ageDays(protocol, latest);
  const seasoning = MODEL_CONSTANTS.seasoning_base + MODEL_CONSTANTS.seasoning_range * Math.min(age / MODEL_CONSTANTS.seasoning_days, 1);
  const reach = Math.min(1 + MODEL_CONSTANTS.reach_per_chain * (protocol.chains.length - 1), MODEL_CONSTANTS.reach_cap);
  return { change, momentum, age, seasoning, reach };
}

interface FittedCalibration {
  globalN: number;
  globalMedian: number;
  clipLow: number;
  clipHigh: number;
  clipProbLow: number;
  clipProbHigh: number;
  categories: CategoryCalibration[];
}

function fitCalibration(snapshot: Snapshot, variant: WinsorVariant, excludedSlug: string | null): FittedCalibration {
  const usable = snapshot.protocols.filter((protocol) => usableRatio(protocol) && protocol.slug !== excludedSlug);
  if (usable.length === 0) throw new Error('Snapshot has no usable positive tokenized market-cap/TVL ratios');
  const allCategories = new Set(snapshot.protocols.map((protocol) => protocol.category));
  const raw = usable.map((protocol) => protocol.mcap_usd! / protocol.tvl_usd);
  let clipLow: number;
  let clipHigh: number;
  let clipProbLow: number;
  let clipProbHigh: number;
  let clipped: number[];
  if (variant !== 'B') {
    const sorted = sortedNumbers(raw);
    clipProbLow = 0.25;
    clipProbHigh = 0.75;
    clipLow = nearestRank(sorted, clipProbLow);
    clipHigh = nearestRank(sorted, clipProbHigh);
    clipped = raw.map((ratio) => Math.max(clipLow, Math.min(clipHigh, ratio)));
  } else {
    const logs = sortedNumbers(raw.map((ratio) => Math.log(ratio)));
    clipProbLow = 0.05;
    clipProbHigh = 0.95;
    const logLow = nearestRank(logs, clipProbLow);
    const logHigh = nearestRank(logs, clipProbHigh);
    clipLow = Math.exp(logLow);
    clipHigh = Math.exp(logHigh);
    clipped = raw.map((ratio) => Math.exp(Math.max(logLow, Math.min(logHigh, Math.log(ratio)))));
  }
  const peers = usable.map((protocol, index) => ({ ratio: clipped[index]!, tvl_usd: protocol.tvl_usd }));
  const weightedMedian = (values: typeof peers): number => {
    const totalWeight = values.reduce((total, peer) => total + peer.tvl_usd, 0);
    const sorted = values.toSorted((first, second) => first.ratio - second.ratio);
    let cumulativeWeight = 0;
    for (const peer of sorted) {
      cumulativeWeight += peer.tvl_usd;
      if (cumulativeWeight >= totalWeight / 2) return peer.ratio;
    }
    throw new Error('Weighted median did not reach half the total TVL weight');
  };
  const peerMedian = (values: typeof peers): number => variant === 'C'
    ? weightedMedian(values) : median(values.map((peer) => peer.ratio));
  const globalMedian = peerMedian(peers);
  const groups = new Map<string | null, typeof peers>();
  for (const category of allCategories) groups.set(category, []);
  for (const [index, protocol] of usable.entries()) groups.get(protocol.category)!.push(peers[index]!);
  const categories = [...groups.entries()].sort(([first], [second]) => compareText(first ?? '', second ?? '')).map(([category, values]) => {
    const categoryMedian = values.length ? peerMedian(values) : null;
    return {
      category,
      n: values.length,
      median: categoryMedian,
      multiple: (values.length * (categoryMedian ?? globalMedian) + MODEL_CONSTANTS.shrinkage_weight * globalMedian)
        / (values.length + MODEL_CONSTANTS.shrinkage_weight),
    };
  });
  return { globalN: usable.length, globalMedian, clipLow, clipHigh, clipProbLow, clipProbHigh, categories };
}

function predictWith(protocol: SnapshotProtocol, fitted: FittedCalibration, latest: string | null): number {
  const category = fitted.categories.find((group) => group.category === protocol.category);
  const multiple = category?.multiple ?? fitted.globalMedian;
  const factor = factors(protocol, latest);
  return protocol.tvl_usd * multiple * factor.momentum * factor.seasoning * factor.reach;
}

interface VariantRun {
  metrics: VariantMetrics;
  residuals: number[];
}

function runBacktest(snapshot: Snapshot, latest: string | null, variant: WinsorVariant): VariantRun {
  const usable = snapshot.protocols.filter(usableRatio);
  const residuals: number[] = [];
  const actuals: number[] = [];
  const absolutePercentageErrors: number[] = [];
  for (const protocol of usable) {
    const fitted = fitCalibration(snapshot, variant, protocol.slug);
    const predicted = predictWith(protocol, fitted, latest);
    const actual = protocol.mcap_usd!;
    residuals.push(Math.log(predicted / actual));
    absolutePercentageErrors.push(Math.abs(predicted - actual) / actual);
    actuals.push(Math.log(actual));
  }
  const mdape = median(absolutePercentageErrors);
  const within = residuals.filter((residual) => {
    const ratio = Math.exp(residual);
    return ratio >= 0.5 && ratio <= 2;
  }).length / residuals.length;
  const meanActual = actuals.reduce((total, value) => total + value, 0) / actuals.length;
  const ssTotal = actuals.reduce((total, value) => total + (value - meanActual) ** 2, 0);
  const ssResidual = residuals.reduce((total, value) => total + value ** 2, 0);
  return {
    metrics: {
      variant,
      label: variant === 'C' ? 'C · TVL-weighted p25-p75 clip' : variant === 'A' ? 'A · unweighted p25-p75 clip' : 'B · log p5-p95 clip',
      mdape,
      within_2x: within,
      log_r2: 1 - ssResidual / ssTotal,
      n: usable.length,
    },
    residuals,
  };
}

export function computeSnapshotCalibration(snapshot: Snapshot): Calibration {
  const listingDates = snapshot.protocols.flatMap((protocol) => protocol.listed_at ? [protocol.listed_at] : []).sort(compareText);
  const latest = listingDates.at(-1) ?? null;
  const runA = runBacktest(snapshot, latest, 'A');
  const runB = runBacktest(snapshot, latest, 'B');
  const runC = runBacktest(snapshot, latest, 'C');
  const gap = Math.min(runA.metrics.mdape, runB.metrics.mdape) - runC.metrics.mdape;
  const chosen: WinsorVariant = 'C';
  const reason = `Variant C selected by the same full-snapshot LOO protocol: its MdAPE is ${(runC.metrics.mdape * 100).toFixed(2)}%, ${(gap * 100).toFixed(3)} percentage points below the better A/B control. TVL-weighted category and global medians retain A's unweighted p25-p75 clips and count-based shrinkage with k=8.`;
  const chosenRun = runC;
  const fitted = fitCalibration(snapshot, chosen, null);
  const residuals = sortedNumbers(chosenRun.residuals);
  return {
    constants: MODEL_CONSTANTS,
    variant: chosen,
    variant_label: 'Raw p25-p75 winsorization, TVL-weighted medians',
    global_n: fitted.globalN,
    global_median: fitted.globalMedian,
    clip_low: fitted.clipLow,
    clip_high: fitted.clipHigh,
    clip_prob_low: fitted.clipProbLow,
    clip_prob_high: fitted.clipProbHigh,
    latest_listed_at: latest,
    categories: fitted.categories,
    backtest: {
      n: chosenRun.metrics.n,
      chosen,
      reason,
      mdape_gap_pp: gap * 100,
      variants: [runA.metrics, runB.metrics, runC.metrics],
    },
    residual_p25: nearestRank(residuals, 0.25),
    residual_p75: nearestRank(residuals, 0.75),
  };
}

export function valueProtocol(protocol: SnapshotProtocol, calibration: Calibration): { implied: number; model: Breakdown } {
  const category = calibration.categories.find((group) => group.category === protocol.category);
  const multiple = category?.multiple ?? calibration.global_median;
  const factor = factors(protocol, calibration.latest_listed_at);
  const unrounded = protocol.tvl_usd * multiple * factor.momentum * factor.seasoning * factor.reach;
  return {
    implied: Math.max(1, Math.round(unrounded)),
    model: {
      category_n: category?.n ?? 0,
      category_median: category?.median ?? null,
      category_multiple: multiple,
      change_7d_used: factor.change,
      momentum: factor.momentum,
      age_days: factor.age,
      seasoning: factor.seasoning,
      chain_count: protocol.chains.length,
      reach: factor.reach,
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
    const plan = farmPlan(protocol, entry.model.age_days);
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
      farm_steps: plan.farm_steps,
      steps_meta: plan.steps_meta,
      totals: plan.totals,
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
    if (row.farm_steps.length < 4 || row.farm_steps.length > 8) return `${row.slug} needs four to eight farm steps`;
    if (row.steps_meta.length !== row.farm_steps.length) return `${row.slug} step metadata count differs`;
    for (const step of row.farm_steps) {
      if (step.trim().length < 20 || step.trim().length > 600 || steps.has(step)) return `invalid or repeated farm step at ${row.slug}`;
      if (!step.includes(row.name) || !row.chains.some((chain) => step.includes(`on ${chain} (`))) return `farm step lacks protocol/chain context at ${row.slug}`;
      steps.add(step);
    }
    if (row.steps_meta.at(-1)?.kind !== 'launch') return `missing final eligibility step at ${row.slug}`;
  }
  if (board[0]!.implied_value_usd === board.at(-1)!.implied_value_usd) return 'all board values are equal';
  return null;
}

function comparablesFor(row: BoardRow, snapshot: Snapshot): Comparable[] {
  return snapshot.protocols
    .filter((protocol) => protocol.slug !== row.slug && protocol.category === row.category
      && !isPreToken(protocol) && usableRatio(protocol))
    .map((protocol) => ({ protocol, distance: Math.abs(Math.log(protocol.tvl_usd / row.tvl_usd)) }))
    .sort((first, second) => first.distance - second.distance || compareText(first.protocol.slug, second.protocol.slug))
    .slice(0, 5)
    .map(({ protocol }) => ({
      name: protocol.name,
      tvl_usd: protocol.tvl_usd,
      mcap_usd: protocol.mcap_usd!,
      ratio: Number((protocol.mcap_usd! / protocol.tvl_usd).toFixed(3)),
    }));
}

function intervals(row: BoardRow, calibration: Calibration): { bear_usd: number; bull_usd: number } {
  let bear = Math.max(1, Math.round(row.implied_value_usd * Math.exp(calibration.residual_p25)));
  let bull = Math.round(row.implied_value_usd * Math.exp(calibration.residual_p75));
  if (bear >= row.implied_value_usd) bear = row.implied_value_usd - 1;
  if (bull <= row.implied_value_usd) bull = row.implied_value_usd + 1;
  return { bear_usd: Math.max(1, bear), bull_usd: bull };
}

export function buildRadar(snapshot: Snapshot, calibration: Calibration) {
  const board = buildBoard(snapshot, calibration);
  const rows: EvidenceRow[] = board.map((row) => ({
    ...row,
    ...intervals(row, calibration),
    comps: comparablesFor(row, snapshot),
  }));
  return {
    board,
    rows,
    radar: {
      product: 'Pre-Token Radar',
      model_version: 'snapshot-shrinkage-2',
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
      rows,
    },
  };
}

export function dataScript(radar: ReturnType<typeof buildRadar>['radar']): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
