#!/usr/bin/env bun
// Static cost, cache and reach scan of a Claude Mod's hooks modules.
//
//   bun scripts/audit-mod.ts <mod-dir> [--json]
//   node --experimental-strip-types --no-warnings scripts/audit-mod.ts <mod-dir> [--json]
//
// Reads the source the way a reviewer would skim it, with regexes and bracket
// matching, not a parser. It points Claude at the lines worth reading; it is
// not a verdict. references/cost-review.md says what to do with each finding.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

type Call = { noun: string; method: string; line: number; file: string; args: string; at: number; end: number }
type Hook = {
  event: string
  matcher: string
  file: string
  line: number
  calls: Call[]
  helpers: string[]
  text: string
  callsNext: boolean
}
type Flag = { level: 'high' | 'medium' | 'low'; where: string; what: string }
type Source = { path: string; raw: string; code: string; skeleton: string; isClient: boolean }

const NOUNS = [
  'plugin', 'ui', 'model', 'audio', 'mcp', 'session', 'turn', 'prompt', 'tool', 'command',
  'config', 'telemetry', 'agent', 'fs', 'store', 'state', 'clock', 'http', 'process', 'settings', 'env',
]

const MODEL_CALLS: Record<string, string> = {
  'model.fork': 'one fork: the session model over the whole transcript, prefix read from the main cache',
  'model.complete': 'one completion with no history: the prompt you pass, full input price',
  'model.classify': 'one completion (classifier) over the text you pass',
  'agent.spawn': 'a whole subagent run, its own context',
  'prompt.submit': 'a full main-thread turn: the whole context re-sent',
  'session.compact': 'a compaction: one model call over the conversation',
}

const FREQUENCY: Record<string, string> = {
  'turn.complete': 'every turn, subagent turns included',
  'turn.start': 'every turn',
  'turn.step': 'every model request of every turn',
  'tool.call': 'every tool call',
  'tool.check': 'every tool permission check',
  'session.append': 'every row stored',
  'session.measure': 'after every turn',
  'ui.render': 'every draw, up to 10-30 a second',
  'prompt.submit': 'every prompt',
  'prompt.edit': 'every edit of the prompt box',
  'prompt.suggest': 'every suggestion',
}

const WHEN: Record<string, string> = {
  'ui.press': 'when the person presses it',
  'command.run': 'when the person runs the command',
  'session.start': 'once, at session start',
  'session.end': 'once, at session end',
}

const CACHE_EVENTS: Record<string, string> = {
  'prompt.section': 'a system prompt section',
  'prompt.compose': 'the whole system prompt (not cached for you: runs on each render)',
  'prompt.context': "the first message's context blocks",
  'prompt.attachment': 'an injected reminder or attachment',
  'tool.describe': 'a tool description (sits ahead of the system prompt)',
}

// Values that differ call to call. A state or store read is only as stable
// as what writes it, so it is reported apart.
const VOLATILE: [RegExp, string][] = [
  [/\bclock\.now\b/, 'clock.now'], [/\bDate\b/, 'Date'], [/\bMath\.random\b/, 'Math.random'],
  [/\bsession\.usage\b/, 'session.usage'], [/\bsession\.turns\b/, 'session.turns'],
  [/\bsession\.messages\b/, 'session.messages'], [/\brandomUUID\b/, 'randomUUID'],
  [/\bfs\.read\b/, 'fs.read'], [/\bhttp\.fetch\b/, 'http.fetch'], [/\bprocess\.run\b/, 'process.run'],
]
const STATEFUL: [RegExp, string][] = [
  [/\bstate\.get\b/, 'state.get'], [/\bstore\.get\b/, 'store.get'], [/(?<![\w$.])read\(\s*[\w$]+\s*,/, 'read()'],
]

const GATES: [RegExp, string][] = [
  [/\bagentId\b/, 'agentId'],
  [/\bisAborted\b/, 'isAborted'],
  [/\be\.reason\b/, 'e.reason'],
  [/\be\.index\b/, 'e.index'],
  [/\btoolUses\b/, 'toolUses'],
  [/\b(enabled|disabled|isOn|isOff|paused|muted)\b/i, 'on/off flag'],
  [/\bstore\.get\b|\bstate\.get\b|\bread\(/, 'reads its own state'],
  [/\boptions\.\w+/, 'userConfig option'],
  [/%\s*\w+/, 'every-N counter'],
  [/\.length\s*[<>]=?/, 'length threshold'],
  [/\bsession\.usage\b/, 'context size'],
]

// Blank comments (keeping line breaks) for `code`; also blank string and
// template contents for `skeleton`, so brackets inside strings never count.
const mask = (src: string) => {
  let code = ''
  let skel = ''
  let i = 0
  const stack: ('code' | 'tpl')[] = ['code']
  const depth: number[] = [0]
  const blank = (s: string) => s.replace(/[^\n]/g, ' ')
  while (i < src.length) {
    const c = src[i]!
    const two = src.slice(i, i + 2)
    const mode = stack[stack.length - 1]
    if (mode === 'tpl') {
      if (c === '\\') { code += src.slice(i, i + 2); skel += blank(src.slice(i, i + 2)); i += 2; continue }
      if (c === '`') { stack.pop(); code += c; skel += c; i++; continue }
      if (two === '${') { stack.push('code'); depth.push(0); code += two; skel += two; i += 2; continue }
      code += c; skel += blank(c); i++; continue
    }
    if (two === '//') {
      const end = src.indexOf('\n', i)
      const stop = end === -1 ? src.length : end
      code += blank(src.slice(i, stop)); skel += blank(src.slice(i, stop)); i = stop; continue
    }
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end === -1 ? src.length : end + 2
      code += blank(src.slice(i, stop)); skel += blank(src.slice(i, stop)); i = stop; continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      const s = src.slice(i, j + 1)
      code += s; skel += c + blank(s.slice(1, -1)) + (s.length > 1 ? s[s.length - 1] : ''); i = j + 1; continue
    }
    if (c === '`') { stack.push('tpl'); code += c; skel += c; i++; continue }
    if (c === '{') depth[depth.length - 1]!++
    if (c === '}') {
      if (stack.length > 1 && depth[depth.length - 1] === 0) {
        stack.pop(); depth.pop(); code += c; skel += c; i++; continue
      }
      depth[depth.length - 1]!--
    }
    code += c; skel += c; i++
  }
  return { code, skeleton: skel }
}

const PAIRS: Record<string, string> = { '(': ')', '{': '}', '[': ']' }

// Index of the bracket closing the one at `open`, read on the skeleton.
const closing = (skel: string, open: number) => {
  const want = PAIRS[skel[open]!]
  if (!want) return -1
  let d = 0
  for (let i = open; i < skel.length; i++) {
    const c = skel[i]!
    if (c in PAIRS) d++
    else if (c === ')' || c === '}' || c === ']') {
      d--
      if (d === 0) return c === want ? i : -1
    }
  }
  return -1
}

const lineAt = (src: string, pos: number) => src.slice(0, pos).split('\n').length
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.cjs', '.cts']

const resolveFile = (base: string, spec: string) => {
  const p = resolve(base, spec)
  const tries = [p, ...EXTS.map(x => p + x), ...EXTS.map(x => join(p, 'index' + x))]
  return tries.find(t => existsSync(t) && statSync(t).isFile() && !t.endsWith('.d.ts'))
}

const load = (path: string, isClient: boolean): Source => {
  const raw = readFileSync(path, 'utf8')
  return { path, raw, isClient, ...mask(raw) }
}

// The hooks modules and every relative file they import, plus Client modules.
const collect = (root: string, entries: string[]) => {
  const seen = new Map<string, Source>()
  const queue = entries.map(p => ({ path: p, isClient: false }))
  while (queue.length > 0) {
    const { path, isClient } = queue.shift()!
    if (seen.has(path)) continue
    const src = load(path, isClient)
    seen.set(path, src)
    const dir = dirname(path)
    for (const m of src.code.matchAll(/\b(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const hit = resolveFile(dir, m[1]!)
      if (hit) queue.push({ path: hit, isClient })
    }
    for (const m of src.code.matchAll(/\bmodule\s*=\s*\{?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const hit = resolveFile(dir, m[1]!) ?? resolveFile(root, m[1]!)
      if (hit) queue.push({ path: hit, isClient: true })
    }
  }
  return [...seen.values()]
}

const receivers = new Set(['$'])
const CALL_RE = () => new RegExp(`(?<![\\w$.])([\\w$]+)\\s*\\.\\s*(${NOUNS.join('|')})\\s*\\.\\s*(\\w+)\\s*\\(`, 'g')

const callsIn = (src: Source, from: number, to: number): Call[] => {
  const out: Call[] = []
  const slice = src.code.slice(from, to)
  for (const m of slice.matchAll(CALL_RE())) {
    const at = from + m.index!
    if (src.skeleton[at] !== src.code[at]) continue
    if (!receivers.has(m[1]!)) continue
    const open = at + m[0].length - 1
    const close = closing(src.skeleton, open)
    const args = close > open ? squash(src.code.slice(open + 1, close)) : ''
    out.push({ noun: m[2]!, method: m[3]!, line: lineAt(src.raw, at), file: src.path, args, at, end: close })
  }
  // The state library's helpers are $.state calls under another name.
  for (const m of slice.matchAll(/(?<![\w$.])(read|update)\(\s*([\w$]+)\s*,/g)) {
    const at = from + m.index!
    if (src.skeleton[at] !== src.code[at] || !receivers.has(m[2]!)) continue
    const line = lineAt(src.raw, at)
    out.push({ noun: 'state', method: 'get', line, file: src.path, args: `via ${m[1]}()`, at, end: at })
    if (m[1] === 'update') out.push({ noun: 'state', method: 'set', line, file: src.path, args: 'via update()', at, end: at })
  }
  return out
}

type Helper = { name: string; src: Source; from: number; to: number }

// Named functions declared anywhere: `function f(`, `const f = (...) =>`.
const helpersOf = (src: Source): Helper[] => {
  const out: Helper[] = []
  const re = /\b(?:function\s*\*?\s*([\w$]+)\s*(?=\()|(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?=<[^>]*>\s*\(|\(|[\w$]+\s*=>|function\b))/g
  for (const m of src.code.matchAll(re)) {
    const at = m.index!
    if (src.skeleton[at] !== src.code[at]) continue
    const isDeclaration = m[1] !== undefined
    let p = at + m[0].length
    const fx = src.code.slice(p).match(/^function\s*\*?\s*[\w$]*\s*/)
    if (fx) p += fx[0].length
    const generic = src.code.slice(p).match(/^<[^>]*>\s*/)
    if (generic) p += generic[0].length
    // Its first parameter may be `$` under another name.
    let first = ''
    let afterParams = p
    if (src.skeleton[p] === '(') {
      const c = closing(src.skeleton, p)
      if (c === -1) continue
      first = src.code.slice(p + 1, c).match(/^\s*([\w$]+)/)?.[1] ?? ''
      afterParams = c + 1
    } else {
      first = src.code.slice(p).match(/^([\w$]+)/)?.[1] ?? ''
      afterParams = p + first.length
    }
    // The body: a bracketed block or expression, else the rest of the line.
    let opener = -1
    if (isDeclaration || fx) {
      opener = src.skeleton.indexOf('{', afterParams)
    } else {
      const arrow = src.skeleton.indexOf('=>', afterParams)
      if (arrow === -1) continue
      opener = arrow + 2 + src.skeleton.slice(arrow + 2).search(/\S|$/)
    }
    let to = opener !== -1 && src.skeleton[opener]! in PAIRS ? closing(src.skeleton, opener) : -1
    if (to === -1) {
      const nl = src.code.indexOf('\n', Math.max(opener, at))
      to = nl === -1 ? src.code.length : nl
    }
    if (first && first !== 'e') receivers.add(first)
    out.push({ name: (m[1] ?? m[2])!, src, from: at, to: to + 1 })
  }
  return out
}

const findHooks = (src: Source) => {
  const out: { event: string; matcher: string; from: number; to: number; line: number }[] = []
  for (const m of src.code.matchAll(/(?<![\w$.])on\(\s*(['"`])([^'"`]+)\1/g)) {
    const at = m.index!
    if (src.skeleton[at] !== 'o') continue
    const open = at + 2
    let to = closing(src.skeleton, open)
    if (to === -1) continue
    // A chained `.catch(($, e, next) => ...)` is part of the same hook.
    const tail = src.skeleton.slice(to + 1).match(/^\s*\.catch\s*\(/)
    const caught = tail ? closing(src.skeleton, to + tail[0].length) : -1
    if (caught !== -1) to = caught
    let matcher = ''
    const rest = src.skeleton.slice(at + m[0].length)
    const mm = rest.match(/^\s*,\s*\{/)
    if (mm) {
      const o = at + m[0].length + mm[0].length - 1
      const c = closing(src.skeleton, o)
      const after = src.skeleton.slice(c + 1).match(/^\s*,/)
      if (c !== -1 && after) matcher = squash(src.code.slice(o, c + 1))
    }
    const fn = src.code.slice(at + m[0].length).match(/,\s*(?:\{[^]*?\}\s*,\s*)?(?:async\s*)?(?:function\s*\*?\s*[\w$]*\s*)?\(?\s*([\w$]+)/)
    if (fn && fn[1] !== 'async') receivers.add(fn[1]!)
    out.push({ event: m[2]!, matcher, from: at, to: to + 1, line: lineAt(src.raw, at) })
  }
  return out
}

const audit = (dirArg: string) => {
  let root = resolve(dirArg)
  if (root.endsWith('plugin.json')) root = dirname(dirname(root))
  const manifestPath = join(root, '.claude-plugin', 'plugin.json')
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {}
  const hooksJson = join(root, 'hooks', 'hooks.json')
  if (!existsSync(hooksJson)) throw new Error(`no hooks/hooks.json under ${root}: not a mod`)
  const modules: string[] = JSON.parse(readFileSync(hooksJson, 'utf8')).modules ?? []
  const entries = modules
    .map(m => resolveFile(join(root, 'hooks'), m))
    .filter((p): p is string => p !== undefined)
  const sources = collect(root, entries)

  if (entries.length === 0) throw new Error(`hooks/hooks.json names no module that exists under ${root}/hooks`)

  // Hooks are found first so their `$` parameter names are known receivers. A
  // function whose body holds a hook (the exported register) is no helper.
  const holders = sources.flatMap(src => findHooks(src).map(h => ({ src, at: h.from })))
  const helpers = sources.flatMap(helpersOf)
    .filter(hp => !holders.some(o => o.src === hp.src && o.at > hp.from && o.at < hp.to))
  const rawHooks = sources.flatMap(src => findHooks(src).map(h => ({ ...h, src })))
  const helperCalls = new Map<string, Call[]>()
  for (const hp of helpers) helperCalls.set(hp.name, callsIn(hp.src, hp.from, hp.to))

  const usedHelpers = (text: string, skip: Set<string>): string[] => {
    const found: string[] = []
    for (const hp of helpers) {
      if (skip.has(hp.name)) continue
      if (new RegExp(`(?<![\\w$.])${hp.name.replace(/\$/g, '\\$')}\\b`).test(text)) found.push(hp.name)
    }
    return found
  }

  // Text of [from, to) with `ranges` blanked, or with everything else blanked.
  const view = (str: string, from: number, to: number, ranges: [number, number][], keepOnly: boolean) => {
    let out = ''
    for (let k = from; k < to; k++) {
      const inside = ranges.some(([a, b]) => k >= a && k < b)
      out += inside === keepOnly || str[k] === '\n' ? str[k] : ' '
    }
    return out
  }

  const build = (
    h: (typeof rawHooks)[number],
    event: string,
    ranges: [number, number][],
    keepOnly: boolean,
  ): Hook => {
    const inRange = (at: number) => ranges.some(([a, b]) => at >= a && at < b) === keepOnly
    const text = view(h.src.code, h.from, h.to, ranges, keepOnly)
    const skel = view(h.src.skeleton, h.from, h.to, ranges, keepOnly)
    const direct = callsIn(h.src, h.from, h.to).filter(c => inRange(c.at))
    // Helpers this hook reaches, transitively.
    const names = new Set<string>()
    const own = new Set(helpers.filter(hp => hp.src === h.src && hp.from >= h.from && hp.to <= h.to).map(hp => hp.name))
    let frontier = usedHelpers(skel, own)
    while (frontier.length > 0) {
      const nextNames: string[] = []
      for (const n of frontier) {
        if (names.has(n)) continue
        names.add(n)
        const hp = helpers.find(x => x.name === n)!
        nextNames.push(...usedHelpers(hp.src.skeleton.slice(hp.from, hp.to), new Set([n, ...names])))
      }
      frontier = nextNames
    }
    const viaHelpers = [...names].flatMap(n => helperCalls.get(n) ?? [])
    const seen = new Set<string>()
    const calls = [...direct, ...viaHelpers].filter(c => {
      const k = `${c.file}:${c.line}:${c.noun}.${c.method}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const helperText = [...names].map(n => {
      const hp = helpers.find(x => x.name === n)!
      return hp.src.code.slice(hp.from, hp.to)
    }).join('\n')
    return {
      event,
      matcher: h.matcher,
      file: relative(root, h.src.path),
      line: h.line,
      calls,
      helpers: [...names],
      text: text + '\n' + helperText,
      callsNext: /(?<![\w$.])next(\.to)?\s*\(/.test(text) || /yield\*\s*next\(/.test(text),
    }
  }

  // A render hook's onPress/onSubmit closures run on the person's action, not
  // per draw, so they are reported as a hook of their own.
  const handlerSpans = (src: Source, from: number, to: number) => {
    const spans: [number, number][] = []
    const slice = src.skeleton.slice(from, to)
    for (const m of slice.matchAll(/\bon(?:Press|Submit|Input|Select|LinkPress|Change)\s*([=:])\s*/g)) {
      const at = from + m.index!
      let p = at + m[0].length
      let end = -1
      if (m[1] === '=' && src.skeleton[p] === '{') {
        end = closing(src.skeleton, p)
      } else {
        const arrow = src.skeleton.indexOf('=>', p)
        if (arrow === -1 || arrow > to) continue
        p = arrow + 2 + src.skeleton.slice(arrow + 2).search(/\S|$/)
        const head = src.skeleton.slice(p).match(/^(?:await\s+|void\s+)?[\w$.]*\s*/)
        const q = p + (head ? head[0].length : 0)
        end = src.skeleton[q]! in PAIRS ? closing(src.skeleton, q) : q
      }
      if (end > at) spans.push([at, end + 1])
    }
    return spans
  }

  const hooks: Hook[] = rawHooks.flatMap(h => {
    if (h.event !== 'ui.render') return [build(h, h.event, [], false)]
    const spans = handlerSpans(h.src, h.from, h.to)
    if (spans.length === 0) return [build(h, h.event, [], false)]
    const press = build(h, 'ui.press', spans, true)
    press.matcher = `(handlers drawn by ui.render${h.matcher ? ' ' + h.matcher : ''})`
    press.callsNext = true
    return [build(h, h.event, spans, false), press]
  })

  return { root, manifest, sources, hooks }
}

const MODEL_CALL_TEXT = /\b(model\s*\.\s*(fork|complete|classify)|agent\s*\.\s*spawn|prompt\s*\.\s*submit|session\s*\.\s*compact)\s*\(/

// A gate only counts when it comes before the call it guards.
const beforeFirstModelCall = (h: Hook) => {
  const direct = h.text.search(MODEL_CALL_TEXT)
  const viaHelper = h.helpers
    .map(n => h.text.search(new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}\\s*\\(`)))
    .filter(i => i !== -1)
  const cut = Math.min(...[direct, ...viaHelper].filter(i => i !== -1), h.text.length)
  return h.text.slice(0, cut)
}

const flagsFor = (hooks: Hook[], pluginName: string, sources: Source[]) => {
  // A matcher naming a const (`{ tool: TOOL }`) is read through its definition.
  const resolved = (h: Hook) => h.matcher.replace(/:\s*([A-Za-z_$][\w$]*)/g, (all, id: string) => {
    for (const src of sources) {
      const def = src.code.match(new RegExp(`\\bconst\\s+${id.replace(/\$/g, '\\$')}\\s*=\\s*([^\\n]+)`))
      if (def) return `: ${def[1]!.trim()}`
    }
    return all
  })
  const isOwnTool = (h: Hook) => h.event === 'tool.call' && new RegExp(`mcp__(${pluginName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\$\\{)`).test(resolved(h))
  const flags: Flag[] = []
  const where = (h: Hook) => `${h.event}${h.matcher ? ' ' + h.matcher : ''} (${h.file}:${h.line})`
  const has = (h: Hook, key: string) => h.calls.some(c => `${c.noun}.${c.method}` === key)

  for (const h of hooks) {
    const models = h.calls.filter(c => MODEL_CALLS[`${c.noun}.${c.method}`])
    const freq = FREQUENCY[h.event]

    // Model calls on a hot event, and whether anything gates them.
    if (models.length > 0 && freq) {
      const gates = GATES.filter(([re]) => re.test(beforeFirstModelCall(h))).map(([, n]) => n)
      const kinds = [...new Set(models.map(c => `${c.noun}.${c.method}`))].join(', ')
      if (h.event === 'ui.render' || h.event === 'turn.step' || h.event === 'session.append') {
        flags.push({ level: 'high', where: where(h), what: `${kinds} on ${freq}` })
      } else if (gates.length === 0) {
        flags.push({ level: 'high', where: where(h), what: `${kinds} on ${freq}, no gate seen` })
      } else {
        flags.push({ level: 'medium', where: where(h), what: `${kinds} on ${freq}; gates seen: ${gates.join(', ')}` })
      }
      if (h.event === 'turn.complete' && !/\bagentId\b/.test(h.text)) {
        flags.push({ level: 'medium', where: where(h), what: 'model call does not check e.agentId: it also runs on subagent turns' })
      }
    }

    // Hooks whose answer is part of the cached prefix.
    if (CACHE_EVENTS[h.event]) {
      const volatile = VOLATILE.filter(([re]) => re.test(h.text)).map(([, n]) => n)
      const stateful = STATEFUL.filter(([re]) => re.test(h.text)).map(([, n]) => n)
      if (volatile.length > 0) {
        flags.push({ level: 'high', where: where(h), what: `${CACHE_EVENTS[h.event]} built from values that change (${volatile.join(', ')}): a different answer re-bills the cache` })
      } else if (stateful.length > 0) {
        flags.push({ level: 'medium', where: where(h), what: `${CACHE_EVENTS[h.event]} depends on stored state (${stateful.join(', ')}): fine if it changes only on a user action, a cache re-write each time it does` })
      } else {
        flags.push({ level: 'medium', where: where(h), what: `changes ${CACHE_EVENTS[h.event]}; check the answer is identical every call` })
      }
      if (h.event === 'prompt.compose' && /['"]shared['"]/.test(h.text) && volatile.length > 0) {
        flags.push({ level: 'high', where: where(h), what: "varying text marked scope 'shared' hits the shared cache for nobody" })
      }
    }

    if (h.event === 'turn.step' && /next\(\s*\{[^}]*\b(model|effort)\b/.test(h.text)) {
      // Only a comparison with 0 pins the choice to the turn's first request;
      // `e.index % 2` reads the index and still switches per request.
      const perTurn = /\bindex\s*[!=]==?\s*0\b|\bturnId\b/.test(h.text)
      const switchesModel = /next\(\s*\{[^}]*\bmodel\b/.test(h.text)
      flags.push({
        level: switchesModel && !perTurn ? 'high' : 'medium',
        where: where(h),
        what: !switchesModel
          ? 'rewrites effort per request: whether effort alone misses the cache is unverified, so measure it'
          : perTurn
            ? 'switches model, apparently once per turn: each switch forfeits the warm cache'
            : 'switches model per request: every switch reads a cold cache',
      })
    }

    for (const c of h.calls.filter(c => c.noun === 'ui' && c.method === 'invalidate')) {
      if (/prompt\.|tool\.describe|command\.describe|config\.describe/.test(c.args)) {
        const hot = freq !== undefined || has(h, 'clock.every')
        flags.push({ level: hot ? 'high' : 'medium', where: `${where(h)} line ${c.line}`, what: `invalidates ${c.args}: the next turn re-renders part of the cached prefix` })
      }
    }

    if (has(h, 'tool.register') && h.event !== 'session.start' && h.event !== 'engine.create') {
      flags.push({ level: 'medium', where: where(h), what: 'registers a tool outside session.start: the tool list changes mid-session' })
    }

    if (has(h, 'session.append')) {
      flags.push({ level: freq ? 'medium' : 'low', where: where(h), what: 'appends rows the model re-reads on every later turn' })
    }

    // Timers: what wakes the session while nobody is typing.
    for (const c of h.calls.filter(c => c.noun === 'clock' && (c.method === 'every' || c.method === 'after'))) {
      const ms = c.args.match(/^([\d_]+)/)?.[1]?.replace(/_/g, '')
      const wakes = h.calls.some(x => MODEL_CALLS[`${x.noun}.${x.method}`] && x.file === c.file && x.at > c.at && x.at < c.end)
      const stacks = c.method === 'every' && freq !== undefined
      const level = wakes ? 'high' : stacks || (c.method === 'every' && ms !== undefined && Number(ms) < 1000) ? 'medium' : 'low'
      flags.push({
        level,
        where: `${where(h)} line ${c.line}`,
        what: `clock.${c.method}(${ms ?? c.args.split(',')[0]} ms)${wakes ? ': its callback makes model calls or submits prompts, so it spends tokens while the session is idle' : ''}${freq ? `, started on ${freq}` : ''}${stacks ? ': each firing adds another interval unless an earlier one is cancelled' : ''}`,
      })
    }

    // State that only ever grows.
    const writes = h.calls.some(c => (c.noun === 'state' && c.method === 'set') || (c.noun === 'store' && c.method === 'set'))
    if (writes && (freq || h.event === 'session.start') && /\[\s*\.\.\.|\.concat\(|\.push\(/.test(h.text) && !/\.slice\(|\.splice\(|\.length\s*[<>]/.test(h.text)) {
      flags.push({ level: 'medium', where: where(h), what: 'appends to stored state with no cap seen ($.store rejects past 4 MiB)' })
    }
    if (h.calls.some(c => c.noun === 'store') && !/\.catch\(|\bcatch\s*\(|\bcatch\s*\{/.test(h.text)) {
      flags.push({ level: 'medium', where: where(h), what: '$.store call with no catch: set rejects past 4 MiB, and an uncaught rejection fails the hook' })
    }
    if (h.calls.some(c => MODEL_CALLS[`${c.noun}.${c.method}`]) && !/\.catch\(|\bcatch\s*\(|\bcatch\s*\{/.test(h.text)) {
      flags.push({ level: 'low', where: where(h), what: 'model call with no catch seen: a request the engine blocks (bad model or maxTokens) rejects, and a fire-and-forget rejection has no hook to land in' })
    }

    // Reach: what this mod can touch or change.
    const reach: [string, Flag['level'], string][] = [
      ['process.run', 'high', 'runs host commands'],
      ['process.spawn', 'high', 'runs host commands'],
      ['fs.write', 'high', 'writes files'],
      ['mcp.call', 'high', 'calls MCP tools with your credentials, no permission prompt'],
      ['mcp.connect', 'medium', 'connects MCP servers'],
      ['http.fetch', 'medium', 'makes network requests'],
      ['session.authorize', 'high', 'takes an auth handle'],
      ['env.set', 'medium', 'changes environment variables'],
      ['config.set', 'medium', 'changes settings'],
      ['session.send', 'medium', 'sends messages to other agents or sessions'],
      ['prompt.submit', 'medium', 'starts turns on its own'],
      ['agent.spawn', 'medium', 'starts subagents'],
      ['telemetry.log', 'low', 'writes telemetry'],
    ]
    for (const [key, level, what] of reach) {
      for (const c of h.calls.filter(c => `${c.noun}.${c.method}` === key)) {
        const literal = c.args.match(/^['"`]([^'"`]*)['"`]/)?.[1]
        flags.push({ level, where: `${where(h)} line ${c.line}`, what: `${what}: ${key}(${literal !== undefined ? `'${literal}'` : c.args.length > 60 ? c.args.slice(0, 57) + '...' : c.args || '...'})` })
      }
    }

    if (h.event === 'tool.call') {
      if (/\bdeny\s*:/.test(h.text) && !isOwnTool(h)) flags.push({ level: 'medium', where: where(h), what: 'can deny tool calls' })
      if (/next\(\s*\{\s*\.\.\.\s*\w+\s*,[^)]*\binput\b/.test(h.text)) {
        const told = /\bcontext\s*:/.test(h.text)
        flags.push({ level: 'high', where: where(h), what: `rewrites tool input${told ? '' : ', and returns no context telling the model'}` })
      }
    }
    if (h.event === 'tool.check' && /decision\s*:\s*['"]allow['"]/.test(h.text)) {
      flags.push({ level: 'high', where: where(h), what: 'answers decision: allow, which skips the permission prompt' })
    }
    if (h.event === 'session.append' && /next\(\s*\{\s*\.\.\.\s*\w+\s*,[^)]*\bmessage\b/.test(h.text)) {
      flags.push({ level: 'high', where: where(h), what: 'rewrites stored conversation rows the model reads' })
    }
    if (h.event === 'plugin.register' && /\brefuse\s*:/.test(h.text)) {
      flags.push({ level: 'high', where: where(h), what: 'can refuse other plugins at load' })
    }
    if (h.event.startsWith('telemetry.')) {
      flags.push({ level: 'medium', where: where(h), what: 'sees telemetry records' })
    }
    if (h.event === 'session.send' || h.event === 'session.receive') {
      flags.push({ level: 'medium', where: where(h), what: 'sees or changes messages between agents' })
    }
    if (h.event === 'engine.create') {
      flags.push({ level: 'medium', where: where(h), what: 'shapes $ for other plugins (adds or withholds nouns)' })
    }

    // Never calling next answers for every plugin beneath, and the engine.
    const ownsIt = (h.event === 'command.run' && /command\s*:/.test(h.matcher)) ||
      isOwnTool(h) ||
      h.event === 'ui.press' || h.event === 'ui.message'
    if (!h.callsNext && !ownsIt) {
      flags.push({ level: 'medium', where: where(h), what: 'never calls next: replaces every hook beneath it, other mods included' })
    }
  }
  return flags
}

const estimate = (hooks: Hook[]) => {
  const lines: string[] = []
  for (const h of hooks) {
    for (const c of h.calls) {
      const key = `${c.noun}.${c.method}`
      if (!MODEL_CALLS[key]) continue
      const model = h.text.match(/\bmodel\s*:\s*['"]([^'"]+)['"]/)?.[1]
      const max = h.text.match(/\bmaxTokens\s*:\s*([\d_]+)/)?.[1]?.replace(/_/g, '')
      let cost = MODEL_CALLS[key]!
      if (key === 'model.fork') cost += `; output on the session model`
      if (key === 'model.complete' || key === 'model.classify') cost += `; model ${model ?? '(not a literal)'}, up to ${max ?? '1024 (default)'} out`
      const timer = h.calls.find(t => t.noun === 'clock' && (t.method === 'every' || t.method === 'after') && t.file === c.file && c.at > t.at && c.at < t.end)
      const when = timer ? `from a clock.${timer.method} timer, idle or not` : FREQUENCY[h.event] ?? WHEN[h.event] ?? `when ${h.event} fires`
      lines.push(`${h.event} -> ${key} (${h.file.replace(/[^/]+$/, '')}${c.file.split('/').pop()}:${c.line}): ${when}; ${cost}`)
    }
  }
  return lines
}

const RANK = { high: 3, medium: 2, low: 1 } as const

const report = (dirArg: string, asJson: boolean) => {
  const { root, manifest, sources, hooks } = audit(dirArg)
  const name: string = manifest.name ?? 'unnamed'
  const flags = flagsFor(hooks, name, sources).sort((a, b) => RANK[b.level] - RANK[a.level])
  const byNoun = new Map<string, Set<string>>()
  for (const h of hooks) for (const c of h.calls) {
    const s = byNoun.get(c.noun) ?? new Set<string>()
    s.add(c.method)
    byNoun.set(c.noun, s)
  }
  // Command names, literal or through a top-level const.
  const constant = (src: Source, id: string) =>
    src.code.match(new RegExp(`\\bconst\\s+${id.replace(/\$/g, '\\$')}\\s*=\\s*['"]([^'"]+)['"]`))?.[1]
  const commands = sources.flatMap(s =>
    [...s.code.matchAll(/command\s*\.\s*register\(\s*\{[^}]*?\bname\s*:\s*(?:['"]([^'"]+)['"]|([\w$]+))/g)]
      .map(m => m[1] ?? constant(s, m[2]!) ?? m[2]!)
      .map(n => '/' + n))
  const top = flags[0]?.level ?? 'low'
  const tokens = estimate(hooks)

  if (asJson) {
    console.log(JSON.stringify({
      plugin: name,
      version: manifest.version,
      files: sources.map(s => ({ path: relative(root, s.path), isClient: s.isClient })),
      hooks: hooks.map(({ text, ...h }) => ({ ...h, calls: h.calls.map(c => ({ ...c, file: relative(root, c.file) })) })),
      calls: Object.fromEntries([...byNoun].map(([n, s]) => [n, [...s].sort()])),
      commands,
      modelCalls: tokens,
      flags,
      risk: top,
      note: 'Heuristic static scan: a pointer to lines worth reading, not a verdict.',
    }, null, 2))
    return
  }

  const out: string[] = []
  const say = (s = '') => out.push(s)
  say(`Mod: ${name} ${manifest.version ?? ''}${manifest.author?.name ? ' by ' + manifest.author.name : ''}`)
  say(`Risk (heuristic): ${top}${flags[0] ? ': ' + flags[0].what : ''}`)
  say()
  say('Files read:')
  for (const s of sources) say(`  ${relative(root, s.path)}${s.isClient ? '  (Client surface module)' : ''}`)
  say()
  say('Events hooked:')
  for (const h of hooks) {
    say(`  ${h.event}${h.matcher ? ' ' + h.matcher : ''}  ${h.file}:${h.line}${FREQUENCY[h.event] ? '  [' + FREQUENCY[h.event] + ']' : ''}${h.callsNext ? '' : '  [no next]'}`)
  }
  if (hooks.length === 0) say('  none found')
  say()
  say('$ calls by noun:')
  for (const [n, s] of [...byNoun].sort()) say(`  ${n}: ${[...s].sort().join(', ')}`)
  if (byNoun.size === 0) say('  none found')
  say()
  say('Model calls (tokens per turn):')
  for (const t of tokens) say(`  ${t}`)
  if (tokens.length === 0) say('  none: this mod spends no tokens of its own')
  say()
  say(`Off switch: ${commands.length > 0 ? commands.join(', ') + ' (check one of them turns the cost off)' : 'no slash command registered'}`)
  say()
  const section = (title: string, test: (f: Flag) => boolean) => {
    const list = flags.filter(test)
    say(title)
    for (const f of list) say(`  [${f.level}] ${f.what}\n         at ${f.where}`)
    if (list.length === 0) say('  none found')
    say()
  }
  const isCache = (f: Flag) => /cache|prefix|tool list|invalidates|re-read|model\/effort/.test(f.what)
  const isReach = (f: Flag) => /runs host|writes files|MCP|network|auth handle|environment|settings|messages|starts|telemetry|deny|rewrites|allow|refuse|shapes \$/.test(f.what)
  section('Cache risks:', isCache)
  section('Side effects and reach:', f => !isCache(f) && isReach(f))
  section('Cost and robustness:', f => !isCache(f) && !isReach(f))
  say('This is a heuristic static scan, not a verdict: it reads source with regexes,')
  say('misses calls made through renamed or destructured `$`, and cannot see values')
  say('computed at run time. Read the flagged lines, run `claude plugin validate`,')
  say('and measure with references/cost-review.md before telling the user it is safe.')
  console.log(out.join('\n'))
}

const args = process.argv.slice(2)
const dir = args.find(a => !a.startsWith('--'))
if (!dir) {
  console.error('usage: bun scripts/audit-mod.ts <mod-dir> [--json]')
  process.exit(2)
}
try {
  report(dir, args.includes('--json'))
} catch (err) {
  console.error(`audit-mod: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
