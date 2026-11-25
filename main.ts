import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { buildRadar, boardIssue } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const inputPath = process.env.MAKEFUN_INPUT_DIR
  ? `${process.env.MAKEFUN_INPUT_DIR}/snapshot.json`
  : '/input/snapshot.json';

const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(inputPath, 'utf8');
const snapshot = JSON.parse(raw);

const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);

const ok = !issue;
const coverage = board.length;
const scored = { live: radar.live.length, early: radar.early_size, ok, coverage, issue: issue ?? null };

writeFileSync(`${outputDir}/board.json`, JSON.stringify(board));

const dashboardSrc = `${__dirname}/dashboard`;
const screenshotsSrc = `${__dirname}/screenshots`;

if (existsSync(dashboardSrc)) {
  cpSync(dashboardSrc, `${outputDir}/dashboard`, { recursive: true });
  // The dashboard is a static page: it reads window.RADAR, so the same run writes the data file
  // beside it. No network, no fetch, no server: opening dashboard/index.html renders the board.
  writeFileSync(`${outputDir}/dashboard/data.js`, `window.RADAR = ${JSON.stringify(radar)};\n`);
}
if (existsSync(screenshotsSrc)) {
  cpSync(screenshotsSrc, `${outputDir}/screenshots`, { recursive: true });
}

try {
  const dossier = buildDossier(outputDir, { text_max_bytes: 65536 });
  writeFileSync(`${outputDir}/dossier.json`, Buffer.from(dossier).toString('utf8'));
} catch (e) {
  console.error('dossier build failed:', e);
  process.exit(1);
}

console.log(JSON.stringify(scored));