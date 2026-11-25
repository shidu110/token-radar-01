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

const dashboardBytes = readdirSync(join(here, 'dashboard')).reduce((total, name) => total + statSync(join(here, 'dashboard', name)).size, 0);
if (dashboardBytes > 60_000) throw new Error(`Dashboard source exceeds 60 KB: ${dashboardBytes} bytes`);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: boardRows })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));
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
