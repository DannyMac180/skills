#!/usr/bin/env node
// scan-signals.ts — evidence loop over signals.jsonl for the explain-this skill.
// Zero dependencies. Runs under both `bun scan-signals.ts` and `node scan-signals.ts`
// (Node 22+ native type-stripping). Erasable TypeScript syntax only.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GradeResult = "hit" | "partial" | "miss";
type Mode = "inline" | "review";

interface Signal {
  ts: string;
  artifact: string;
  card: string;
  tags: string[];
  result: GradeResult;
  mode: Mode;
  excluded: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TAG_VOCAB: string[] = [
  "terminology",
  "mechanism",
  "derivation",
  "transfer",
  "big-picture",
];
const RESULTS: string[] = ["hit", "partial", "miss"];
const MODES: string[] = ["inline", "review"];

const USAGE = `explain-this scan-signals — evidence loop over graded signals

Usage:
  scan-signals.ts scan [--window 60] [--threshold 4] [--min-artifacts 2]
      Report tags with enough misses across enough artifacts in the window.
  scan-signals.ts heal [--lookback 6] [--rate 0.8]
      Report tags whose recent hit-rate has recovered above --rate.
  scan-signals.ts log
      Read one signal JSON from stdin, stamp/validate, append, echo it.
  scan-signals.ts --help
      Show this help.

Data directory: $EXPLAIN_THIS_HOME or ~/.explain-this
All list output is JSON, one object per line, on stdout.`;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function dataHome(): string {
  const env = process.env.EXPLAIN_THIS_HOME;
  if (env && env.length > 0) return env;
  return path.join(os.homedir(), ".explain-this");
}

function signalsPath(): string {
  return path.join(dataHome(), "memory", "signals.jsonl");
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readSignals(): Signal[] {
  let raw: string;
  try {
    raw = fs.readFileSync(signalsPath(), "utf8");
  } catch {
    return [];
  }
  const out: Signal[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed) as Signal);
    } catch {
      fail(`corrupt JSONL line in ${signalsPath()}: ${trimmed.slice(0, 80)}`);
    }
  }
  return out;
}

function appendSignal(sig: Signal): void {
  const target = signalsPath();
  ensureDir(target);
  fs.appendFileSync(target, JSON.stringify(sig) + "\n");
}

function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function warn(msg: string): void {
  process.stderr.write(`warning: ${msg}\n`);
}

function resultWeight(result: GradeResult): number {
  if (result === "hit") return 1;
  if (result === "partial") return 0.5;
  return 0;
}

function missWeight(result: GradeResult): number {
  if (result === "miss") return 1;
  if (result === "partial") return 0.5;
  return 0;
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  pos: string[];
  flags: Record<string, string>;
  error?: string;
}

function parseArgs(rest: string[], valueFlags: string[]): ParsedArgs {
  const pos: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith("--")) {
      if (!valueFlags.includes(a)) return { pos, flags, error: `unknown flag: ${a}` };
      const v = rest[i + 1];
      if (v === undefined || v.startsWith("--")) {
        return { pos, flags, error: `missing value for ${a}` };
      }
      flags[a] = v;
      i++;
    } else {
      pos.push(a);
    }
  }
  return { pos, flags };
}

function numFlag(flags: Record<string, string>, name: string, def: number): number {
  const raw = flags[name];
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(`${name} must be a number, got: ${raw}`);
  return n;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

interface TagAccum {
  missWeight: number;
  artifacts: Set<string>;
  cards: Set<string>;
  first: string;
  last: string;
}

function cmdScan(rest: string[]): void {
  const parsed = parseArgs(rest, ["--window", "--threshold", "--min-artifacts"]);
  if (parsed.error) fail(parsed.error);
  if (parsed.pos.length > 0) fail(`unexpected argument: ${parsed.pos[0]}`);
  const windowDays = numFlag(parsed.flags, "--window", 60);
  const threshold = numFlag(parsed.flags, "--threshold", 4);
  const minArtifacts = numFlag(parsed.flags, "--min-artifacts", 2);

  const cutoff = Date.now() - windowDays * 86400000;
  const signals = readSignals().filter(
    (s) => !s.excluded && Number.isFinite(Date.parse(s.ts)) && Date.parse(s.ts) >= cutoff,
  );

  const byTag = new Map<string, TagAccum>();
  for (const s of signals) {
    const w = missWeight(s.result);
    if (w === 0) continue; // only miss/partial contribute to the miss evidence
    const tags = Array.isArray(s.tags) ? s.tags : [];
    for (const tag of tags) {
      let acc = byTag.get(tag);
      if (!acc) {
        acc = { missWeight: 0, artifacts: new Set(), cards: new Set(), first: s.ts, last: s.ts };
        byTag.set(tag, acc);
      }
      acc.missWeight += w;
      acc.artifacts.add(s.artifact);
      acc.cards.add(s.card);
      if (s.ts < acc.first) acc.first = s.ts;
      if (s.ts > acc.last) acc.last = s.ts;
    }
  }

  const rows: Array<{
    tag: string;
    misses: number;
    artifacts: number;
    window_days: number;
    first: string;
    last: string;
    evidence: string[];
  }> = [];

  for (const [tag, acc] of byTag) {
    const misses = Math.floor(acc.missWeight);
    const artifacts = acc.artifacts.size;
    if (misses >= threshold && artifacts >= minArtifacts) {
      rows.push({
        tag,
        misses,
        artifacts,
        window_days: windowDays,
        first: acc.first,
        last: acc.last,
        evidence: Array.from(acc.cards),
      });
    }
  }

  rows.sort((a, b) => (b.misses - a.misses) || (a.tag < b.tag ? -1 : 1));
  for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
}

function cmdHeal(rest: string[]): void {
  const parsed = parseArgs(rest, ["--lookback", "--rate"]);
  if (parsed.error) fail(parsed.error);
  if (parsed.pos.length > 0) fail(`unexpected argument: ${parsed.pos[0]}`);
  const lookback = numFlag(parsed.flags, "--lookback", 6);
  const rate = numFlag(parsed.flags, "--rate", 0.8);
  if (lookback <= 0) fail("--lookback must be > 0");

  const signals = readSignals().filter((s) => !s.excluded && RESULTS.includes(s.result));

  const byTag = new Map<string, Signal[]>();
  for (const s of signals) {
    const tags = Array.isArray(s.tags) ? s.tags : [];
    for (const tag of tags) {
      let arr = byTag.get(tag);
      if (!arr) {
        arr = [];
        byTag.set(tag, arr);
      }
      arr.push(s);
    }
  }

  const rows: Array<{ tag: string; hit_rate: number; sample: number }> = [];
  for (const [tag, arr] of byTag) {
    if (arr.length < lookback) continue;
    const sorted = arr
      .slice()
      .sort((a, b) => (Date.parse(a.ts) - Date.parse(b.ts)) || (a.ts < b.ts ? -1 : 1));
    const last = sorted.slice(-lookback);
    let score = 0;
    for (const s of last) score += resultWeight(s.result);
    const hitRate = score / lookback;
    if (hitRate >= rate) rows.push({ tag, hit_rate: round2(hitRate), sample: lookback });
  }

  rows.sort((a, b) => (b.hit_rate - a.hit_rate) || (a.tag < b.tag ? -1 : 1));
  for (const r of rows) process.stdout.write(JSON.stringify(r) + "\n");
}

function cmdLog(rest: string[]): void {
  if (rest.length > 0) fail(`unexpected argument: ${rest[0]}`);
  const raw = readStdin().trim();
  if (raw.length === 0) fail("log: no JSON on stdin");
  let obj: Partial<Signal>;
  try {
    obj = JSON.parse(raw) as Partial<Signal>;
  } catch {
    fail("log: stdin is not valid JSON");
  }

  const result = obj.result;
  if (typeof result !== "string" || !RESULTS.includes(result)) {
    fail(`log: invalid result: ${String(result)} (hit|partial|miss)`);
  }
  const mode = obj.mode;
  if (typeof mode !== "string" || !MODES.includes(mode)) {
    fail(`log: invalid mode: ${String(mode)} (inline|review)`);
  }

  const tags = Array.isArray(obj.tags) ? obj.tags : [];
  for (const t of tags) {
    if (!TAG_VOCAB.includes(t)) warn(`unknown tag: ${t}`);
  }

  const sig: Signal = {
    ts: typeof obj.ts === "string" && obj.ts.length > 0 ? obj.ts : nowIso(),
    artifact: typeof obj.artifact === "string" ? obj.artifact : "",
    card: typeof obj.card === "string" ? obj.card : "",
    tags,
    result: result as GradeResult,
    mode: mode as Mode,
    excluded: obj.excluded === true,
  };

  appendSignal(sig);
  process.stdout.write(JSON.stringify(sig) + "\n");
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

function main(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  if (cmd === "--help" || cmd === "-h" || cmd === undefined) {
    process.stdout.write(USAGE + "\n");
    process.exit(0);
  }

  switch (cmd) {
    case "scan":
      cmdScan(rest);
      break;
    case "heal":
      cmdHeal(rest);
      break;
    case "log":
      cmdLog(rest);
      break;
    default:
      fail(`unknown command: ${cmd} (scan|heal|log)`);
  }
}

main();
