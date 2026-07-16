#!/usr/bin/env node
// SM-2 spaced-repetition algorithm (P.A. Wozniak, SuperMemo) — zero-dep implementation.
// sm2.ts — SM-2 spaced-repetition scheduling for the explain-this skill.
// Zero dependencies. Runs under both `bun sm2.ts` and `node sm2.ts` (Node 22+
// native type-stripping). Erasable TypeScript syntax only.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as process from "node:process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GradeResult = "hit" | "partial" | "miss";
type Mode = "inline" | "review";
type CardType = "recall" | "transfer" | "explain-back";
type Status = "active" | "retired" | "suspended";

interface Artifact {
  title: string;
  source: string;
  explained: string;
}

interface CardState {
  interval_days: number;
  ease: number;
  due: string;
  reps: number;
  lapses: number;
}

interface HistoryEntry {
  ts: string;
  result: GradeResult;
  mode: Mode;
}

interface Card {
  id: string;
  artifact: Artifact;
  question: string;
  answer: string;
  type: CardType;
  tags: string[];
  state: CardState;
  history: HistoryEntry[];
  status: Status;
}

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
const CARD_TYPES: string[] = ["recall", "transfer", "explain-back"];

const USAGE = `explain-this sm2 — SM-2 spaced-repetition scheduling

Usage:
  sm2.ts due [--limit N]                     List active cards due today (default limit 8)
  sm2.ts grade <card-id> <hit|partial|miss> [--mode inline|review]
                                             Grade a card, reschedule, log a signal
  sm2.ts add                                 Read one card JSON from stdin and store it
  sm2.ts stats                               Print counts as JSON
  sm2.ts --help                              Show this help

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

function cardsPath(): string {
  return path.join(dataHome(), "memory", "cards.jsonl");
}

function signalsPath(): string {
  return path.join(dataHome(), "memory", "signals.jsonl");
}

// ---------------------------------------------------------------------------
// Dates (local)
// ---------------------------------------------------------------------------

function parseLocal(s: string): Date {
  const parts = s.split("-").map((x) => Number(x));
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function fmtLocal(dt: Date): string {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function today(): string {
  return fmtLocal(new Date());
}

function addDays(base: string, n: number): string {
  const dt = parseLocal(base);
  dt.setDate(dt.getDate() + n);
  return fmtLocal(dt);
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// IO helpers
// ---------------------------------------------------------------------------

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonl(filePath: string): unknown[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const out: unknown[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      fail(`corrupt JSONL line in ${filePath}: ${trimmed.slice(0, 80)}`);
    }
  }
  return out;
}

function readCards(): Card[] {
  return readJsonl(cardsPath()) as Card[];
}

function writeCardsAtomic(cards: Card[]): void {
  const target = cardsPath();
  ensureDir(target);
  const body =
    cards.map((c) => JSON.stringify(c)).join("\n") +
    (cards.length > 0 ? "\n" : "");
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
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

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fail(msg: string): never {
  process.stderr.write(`error: ${msg}\n`);
  process.exit(1);
}

function warn(msg: string): void {
  process.stderr.write(`warning: ${msg}\n`);
}

function warnUnknownTags(tags: string[]): void {
  if (!Array.isArray(tags)) return;
  for (const t of tags) {
    if (!TAG_VOCAB.includes(t)) warn(`unknown tag: ${t}`);
  }
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

function intFlag(flags: Record<string, string>, name: string, def: number): number {
  const raw = flags[name];
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n)) fail(`${name} must be an integer, got: ${raw}`);
  return n;
}

// ---------------------------------------------------------------------------
// SM-2 core
// ---------------------------------------------------------------------------

function qOf(result: GradeResult): number {
  if (result === "hit") return 5;
  if (result === "partial") return 3;
  return 2;
}

function applyGrade(card: Card, result: GradeResult, mode: Mode): void {
  const q = qOf(result);
  const st = card.state;

  if (q >= 3) {
    st.reps += 1;
    if (st.reps === 1) st.interval_days = 1;
    else if (st.reps === 2) st.interval_days = 4;
    else st.interval_days = Math.round(st.interval_days * st.ease);
  } else {
    st.reps = 0;
    st.interval_days = 1;
    st.lapses += 1;
  }

  // Ease update (uses q). Floor at 1.3. Interval above used the pre-update ease.
  const ef = st.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  st.ease = Math.max(1.3, ef);

  st.due = addDays(today(), st.interval_days);
  if (st.interval_days > 120) card.status = "retired";

  card.history.push({ ts: nowIso(), result, mode });
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

function cmdDue(rest: string[]): void {
  const parsed = parseArgs(rest, ["--limit"]);
  if (parsed.error) fail(parsed.error);
  if (parsed.pos.length > 0) fail(`unexpected argument: ${parsed.pos[0]}`);
  const limit = intFlag(parsed.flags, "--limit", 8);
  if (limit < 0) fail("--limit must be >= 0");

  const t = today();
  const due = readCards()
    .filter((c) => c.status === "active" && c.state.due <= t)
    .sort((a, b) => (a.state.due < b.state.due ? -1 : a.state.due > b.state.due ? 1 : 0));

  for (const c of due.slice(0, limit)) {
    process.stdout.write(JSON.stringify(c) + "\n");
  }
}

function cmdGrade(rest: string[]): void {
  const parsed = parseArgs(rest, ["--mode"]);
  if (parsed.error) fail(parsed.error);
  if (parsed.pos.length !== 2) {
    fail("usage: sm2.ts grade <card-id> <hit|partial|miss> [--mode inline|review]");
  }
  const cardId = parsed.pos[0];
  const result = parsed.pos[1];
  if (!RESULTS.includes(result)) fail(`invalid result: ${result} (hit|partial|miss)`);
  const mode = parsed.flags["--mode"] ?? "review";
  if (!MODES.includes(mode)) fail(`invalid mode: ${mode} (inline|review)`);

  const cards = readCards();
  const idx = cards.findIndex((c) => c.id === cardId);
  if (idx < 0) fail(`no such card: ${cardId}`);

  const card = cards[idx];
  applyGrade(card, result as GradeResult, mode as Mode);

  writeCardsAtomic(cards);

  const sig: Signal = {
    ts: nowIso(),
    artifact: slug(card.artifact && card.artifact.title ? card.artifact.title : card.id),
    card: card.id,
    tags: Array.isArray(card.tags) ? card.tags : [],
    result: result as GradeResult,
    mode: mode as Mode,
    excluded: false,
  };
  appendSignal(sig);

  process.stdout.write(JSON.stringify(card) + "\n");
}

function cmdAdd(): void {
  const raw = readStdin().trim();
  if (raw.length === 0) fail("add: no JSON on stdin");
  let obj: Partial<Card>;
  try {
    obj = JSON.parse(raw) as Partial<Card>;
  } catch {
    fail("add: stdin is not valid JSON");
  }

  const required = ["id", "question", "answer", "type", "tags"];
  for (const key of required) {
    const v = (obj as Record<string, unknown>)[key];
    if (v === undefined || v === null || v === "") fail(`add: missing required field: ${key}`);
  }
  if (!Array.isArray(obj.tags)) fail("add: tags must be an array");
  if (typeof obj.type !== "string" || !CARD_TYPES.includes(obj.type)) {
    fail(`add: invalid type: ${String(obj.type)} (recall|transfer|explain-back)`);
  }
  warnUnknownTags(obj.tags);

  const cards = readCards();
  if (cards.some((c) => c.id === obj.id)) fail(`add: duplicate id: ${obj.id}`);

  const t = today();
  const card: Card = {
    id: obj.id as string,
    artifact:
      obj.artifact && typeof obj.artifact === "object"
        ? (obj.artifact as Artifact)
        : { title: "", source: "", explained: t },
    question: obj.question as string,
    answer: obj.answer as string,
    type: obj.type as CardType,
    tags: obj.tags as string[],
    state:
      obj.state && typeof obj.state === "object"
        ? (obj.state as CardState)
        : { interval_days: 0, ease: 2.5, due: t, reps: 0, lapses: 0 },
    history: Array.isArray(obj.history) ? (obj.history as HistoryEntry[]) : [],
    status: typeof obj.status === "string" ? (obj.status as Status) : "active",
  };

  cards.push(card);
  writeCardsAtomic(cards);
  process.stdout.write(JSON.stringify(card) + "\n");
}

function cmdStats(rest: string[]): void {
  if (rest.length > 0) fail(`unexpected argument: ${rest[0]}`);
  const cards = readCards();
  const t = today();
  let active = 0;
  let retired = 0;
  let suspended = 0;
  let dueToday = 0;
  for (const c of cards) {
    if (c.status === "active") active++;
    else if (c.status === "retired") retired++;
    else if (c.status === "suspended") suspended++;
    if (c.status === "active" && c.state && c.state.due <= t) dueToday++;
  }
  process.stdout.write(
    JSON.stringify({
      total: cards.length,
      active,
      retired,
      suspended,
      due_today: dueToday,
    }) + "\n",
  );
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
    case "due":
      cmdDue(rest);
      break;
    case "grade":
      cmdGrade(rest);
      break;
    case "add":
      cmdAdd();
      break;
    case "stats":
      cmdStats(rest);
      break;
    default:
      fail(`unknown command: ${cmd} (due|grade|add|stats)`);
  }
}

main();
