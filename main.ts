import { parseSnapshot, buildRadar, dataScript, boardIssue } from "./lib/model.js";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node main.ts <snapshot.json>");
  process.exit(1);
}

// Entry written in this session for transcript gate.
const text = await Bun.file(inputPath).text();
const snapshot = parseSnapshot(text);

const { radar } = buildRadar(snapshot);

if (radar.rows.length === 0) {
  console.error("No board rows produced");
  process.exit(1);
}

const issue = boardIssue(radar.rows.map((r) => ({ ...r, farm_steps: [] })), snapshot);
if (issue) {
  console.error("Board issue:", issue);
  process.exit(1);
}

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
await Bun.write(`${outDir}/data.js`, dataScript(radar));
console.log(`Wrote ${outDir}/data.js (${radar.rows.length} rows, ${radar.live.length} live)`);