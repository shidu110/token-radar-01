import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, computeSnapshotCalibration, dataScript } from './lib/model.ts';
import { parseSnapshot } from './lib/snapshot.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const position = process.argv.indexOf(`--${name}`);
  if (position >= 0 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const assignment = process.argv.find((argument) => argument.startsWith(`--${name}=`));
  return assignment === undefined ? fallback : assignment.slice(name.length + 3);
}

function copyFiles(from: string, to: string): string[] {
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}; pass --input <snapshot.json|directory>\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? 'out');
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const calibration = computeSnapshotCalibration(snapshot);
const { board, radar } = buildRadar(snapshot, calibration);
const issue = boardIssue(board, snapshot);
if (issue !== null) throw new Error(`token radar: ${issue}`);
const boardRows = board.map(({ slug, name, rank, implied_value_usd, farm_steps }) => ({ slug, name, rank, implied_value_usd, farm_steps }));

function median(values: number[]): number {
  const sorted = values.toSorted((first, second) => first - second);
  return (sorted[Math.floor((sorted.length - 1) / 2)]! + sorted[Math.floor(sorted.length / 2)]!) / 2;
}

const categoryRates = [...new Set(board.map((row) => row.category))]
  .sort((first, second) => (first ?? '') < (second ?? '') ? -1 : (first ?? '') > (second ?? '') ? 1 : 0)
  .map((category) => {
    const protocols = snapshot.protocols.filter((protocol) => protocol.category === category);
    const tokenized = protocols.filter((protocol) => protocol.gecko_id !== null || protocol.symbol !== null || (protocol.mcap_usd ?? 0) > 0).length;
    return {
      category,
      snapshot_count: protocols.length,
      tokenized_count: tokenized,
      tokenization_rate_percent: 100 * tokenized / protocols.length,
      median_tvl_usd: median(protocols.map((protocol) => protocol.tvl_usd)),
    };
  });
const dashboardData = {
  ...radar,
  board_summary: {
    protocols_ranked: board.length,
    watchlist_covered: board.filter((row) => row.watchlist).length,
    watchlist_total: snapshot.watchlist.length,
    median_implied_value_usd: median(board.map((row) => row.implied_value_usd)),
    total_implied_value_usd: radar.total_implied_value_usd,
    snapshot_date: snapshot.as_of,
  },
  category_rates: categoryRates,
  rows: radar.rows.map((row) => ({
    ...row,
    signals: {
      age_days: row.listed_at === null ? null : row.model.age_days,
      age_years: row.listed_at === null ? null : row.model.age_days / 365.25,
      age_reference: calibration.latest_listed_at,
      chain_count: row.chains.length,
      category_median_tvl_usd: categoryRates.find((group) => group.category === row.category)!.median_tvl_usd,
      tvl_vs_category_median: row.tvl_usd / categoryRates.find((group) => group.category === row.category)!.median_tvl_usd,
      momentum_direction: row.change_7d === null ? 'unreported' : row.change_7d > 0 ? 'up' : row.change_7d < 0 ? 'down' : 'flat',
      momentum_percent: row.change_7d,
      watchlist: row.watchlist,
    },
  })),
};
const dashboardFiles = readdirSync(join(here, 'dashboard')).filter((name) => /\.(html|css|js)$/.test(name) && name !== 'data.js');
const dashboardBytes = dashboardFiles.reduce((total, name) => total + statSync(join(here, 'dashboard', name)).size, 0);
if (dashboardBytes > 62_000) throw new Error(`Dashboard source exceeds 62,000 bytes: ${dashboardBytes} bytes`);
for (const name of dashboardFiles) {
  if (/https?:\/\/|xmlns/i.test(readFileSync(join(here, 'dashboard', name), 'utf8'))) throw new Error(`Dashboard source contains a forbidden URL/namespace in ${name}`);
}
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: boardRows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(dashboardData));
copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4 || shots.some((name) => !/^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/.test(name))) throw new Error('screenshots/ requires 3..4 validly named images');
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
}));
process.stdout.write(`token radar: ${radar.protocols_scanned} scanned; ${radar.pre_token_candidates} record no token; ${board.length} ranked; ${radar.watchlist_size}/${radar.watchlist_size} watchlist; ${radar.early_size} below floor\n`);
process.stdout.write(`token radar: ${calibration.global_n} positive-cap ratios; global median ${calibration.global_median}; latest listing ${calibration.latest_listed_at}; dashboard ${dashboardBytes} bytes\n`);
process.stdout.write(`token radar: LOO ${calibration.backtest.n} rows; variant ${calibration.backtest.chosen} shipped; MdAPE A ${calibration.backtest.variants[0]!.mdape} B ${calibration.backtest.variants[1]!.mdape}; residual p25 ${calibration.residual_p25} p75 ${calibration.residual_p75}\n`);
process.stdout.write(`token radar: wrote board.json, data.js, dashboard/, screenshots/ and dossier.json to ${out}\n`);
