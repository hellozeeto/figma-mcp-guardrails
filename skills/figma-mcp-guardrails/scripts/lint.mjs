#!/usr/bin/env node
/* =============================================================================
 * lint.mjs — 코드만 보고 잡을 수 있는 가드레일
 * =============================================================================
 * 브라우저 없이 파일을 읽어 검사한다. check.mjs 가 "돌려 보고" 잡는다면
 * 이쪽은 "쓰는 순간" 잡는다 — Claude Code 훅으로 걸면 Edit/Write 직후에 돈다.
 *
 *   G2  소수점 px        37.33px · 1.067px — Figma 축척 값을 그대로 옮긴 것
 *   G2  색 직접 사용     #0b6ef5 · rgb(…) — 토큰 파일 밖에서
 *   G3  정의 안 된 변수   var(--shadow-1) 인데 --shadow-1: 이 어디에도 없다
 *   G4  성공 흉내 의심   preventDefault() 직후 setTimeout — 전송을 막고 완료를 띄우는 모양
 *   !important          [hidden] 리셋 · prefers-reduced-motion 블록 밖
 *
 * 쓰는 법
 *   node lint.mjs                 지금 폴더 전체
 *   node lint.mjs src/styles      일부만
 *   node lint.mjs --hook          Claude Code PostToolUse 훅 (README "훅으로 걸기")
 *
 * 옵션
 *   --only G2,G3        일부 규칙만
 *   --tokens <글자>      토큰·리셋 파일로 볼 파일명. 여러 번 (기본: tokens · reset · globals · base)
 *   --skip <글자>        경로에 이 글자가 들어간 파일은 건너뛴다. 여러 번
 *
 * 한 줄만 예외로 두려면 그 줄에 `guardrails-ignore` 를 적는다 (주석 안에).
 *
 * G3 은 프로젝트 전체에서 정의를 모은다. 훅 모드에서도 정의는 전체에서 찾고,
 * 검사는 방금 고친 파일만 한다.
 * ========================================================================== */

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const EXT = new Set(['.css', '.scss', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.vue', '.svelte']);
const STYLE_EXT = new Set(['.css', '.scss']);
const SCRIPT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.vue', '.svelte']);
const SKIP_DIR = new Set(['node_modules', '.git', '.next', '.nuxt', 'dist', 'build', 'out', 'coverage', 'check-shots', 'vendor']);
const MAX_BYTES = 1024 * 1024;

function parseArgs(argv) {
  const opt = { targets: [], hook: false, only: null, tokens: [], skip: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hook') opt.hook = true;
    else if (a === '--only') opt.only = argv[++i].split(',');
    else if (a === '--tokens') opt.tokens.push(argv[++i]);
    else if (a === '--skip') opt.skip.push(argv[++i]);
    else opt.targets.push(a);
  }
  if (opt.tokens.length === 0) opt.tokens = ['tokens', 'reset', 'globals', 'base'];
  return opt;
}

async function walk(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name)) await walk(p, out);
    } else if (EXT.has(path.extname(e.name))) {
      out.push(p);
    }
  }
  return out;
}

async function read(file) {
  try {
    if ((await stat(file)).size > MAX_BYTES) return null;
    return await readFile(file, 'utf8');
  } catch { return null; }
}

/* 주석을 같은 길이의 공백으로 바꾼다 — 줄 번호와 위치가 그대로 남는다.
   // 는 줄 머리나 공백 뒤일 때만 — 주소 안의 // 를 지우지 않는다 */
function stripComments(src, ext) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  let s = src.replace(/\/\*[\s\S]*?\*\//g, blank);
  if (ext === '.html' || ext === '.vue' || ext === '.svelte') s = s.replace(/<!--[\s\S]*?-->/g, blank);
  if (SCRIPT_EXT.has(ext)) s = s.replace(/(^|[\s;{}(])\/\/[^\n]*/g, (m, pre) => pre + blank(m.slice(pre.length)));
  return s;
}

const lineOf = (s, idx) => s.slice(0, idx).split('\n').length;

/* 여는 { 위치에서 짝이 맞는 } 까지 */
function blockEnd(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return s.length;
}

/* !important 가 허락된 구간 — [hidden] 규칙, reduced-motion 블록 */
function allowedRanges(s) {
  const ranges = [];
  for (const m of s.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{/g)) {
    const open = m.index + m[0].length - 1;
    ranges.push([open, blockEnd(s, open)]);
  }
  for (const m of s.matchAll(/(^|[},])\s*\[hidden\][^{,]*\{/g)) {
    const open = m.index + m[0].length - 1;
    ranges.push([open, s.indexOf('}', open)]);
  }
  return ranges;
}

/* 프로젝트 전체에서 정의된 CSS 변수 이름 */
function collectDefinitions(src, set) {
  for (const m of src.matchAll(/--([\w-]+)\s*:/g)) set.add(m[1]);                 // CSS · style="--x: …"
  for (const m of src.matchAll(/['"`]--([\w-]+)['"`]\s*[:,)]/g)) set.add(m[1]);   // { '--x': v } · setProperty('--x', v)
}

function lintFile(file, raw, ctx) {
  const ext = path.extname(file);
  const base = path.basename(file).toLowerCase();
  const isToken = ctx.tokens.some((t) => base.includes(t));
  const s = stripComments(raw, ext);
  const rawLines = raw.split('\n');
  const found = [];
  const on = (rule) => !ctx.only || ctx.only.includes(rule);
  const add = (idx, rule, msg) => {
    const line = lineOf(s, idx);
    if (/guardrails-ignore/.test(rawLines[line - 1] || '')) return;
    found.push({ file, line, rule, msg });
  };

  if (STYLE_EXT.has(ext)) {
    if (on('G2') && !isToken) {
      for (const m of s.matchAll(/(?<![\w.-])(\d*\.\d+)px\b/g)) {
        add(m.index, 'G2', `소수점 px ${m[0]} — 가까운 토큰으로`);
      }
      for (const m of s.matchAll(/:[^;{}]*?(#[0-9a-fA-F]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(\s*\d)/g)) {
        add(m.index + m[0].indexOf(m[1]), 'G2', `색 직접 사용 ${m[1]}${m[1].startsWith('#') ? '' : '…'} — tokens 로`);
      }
    }
    if (on('!important')) {
      const ok = allowedRanges(s);
      for (const m of s.matchAll(/!important/g)) {
        if (!ok.some(([a, b]) => m.index > a && m.index < b)) {
          add(m.index, '!important', '[hidden] 리셋 · reduced-motion 밖의 !important — 구조로 해결');
        }
      }
    }
  }

  if (on('G3')) {
    for (const m of s.matchAll(/var\(\s*--([\w-]+)\s*(,)?/g)) {
      if (m[2]) continue;                       // var(--x, 기본값) 은 의도한 것이다
      if (m[1].endsWith('-')) continue;         // 'var(--swatch-' + id + ')' — 실행 중에 이름을 만든다
      if (!ctx.defined.has(m[1])) add(m.index, 'G3', `정의 안 된 변수 --${m[1]} — 오류 없이 무시된다`);
    }
  }

  if (on('G4') && SCRIPT_EXT.has(ext) && !base.includes('_preview')) {
    for (const m of s.matchAll(/preventDefault\s*\(\s*\)/g)) {
      const after = s.slice(m.index, m.index + 1200);
      const t = after.search(/\bsetTimeout\s*\(/);
      if (t >= 0 && lineOf(after, t) <= 20) {
        add(m.index + t, 'G4', '전송을 막은 뒤 setTimeout — 성공 흉내가 아닌지 확인. 연결 자리는 TODO(api)');
      }
    }
  }

  return found;
}

async function readStdin() {
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

const opt = parseArgs(process.argv.slice(2));
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let targets;
if (opt.hook) {
  let input = {};
  try { input = JSON.parse(await readStdin()); } catch { process.exit(0); }
  const f = input?.tool_input?.file_path;
  if (!f || !EXT.has(path.extname(f))) process.exit(0);
  targets = [path.resolve(root, f)];
} else {
  const roots = opt.targets.length ? opt.targets.map((t) => path.resolve(t)) : [root];
  targets = [];
  for (const r of roots) {
    const st = await stat(r).catch(() => null);
    if (st?.isDirectory()) await walk(r, targets);
    else if (st) targets.push(r);
  }
}
targets = targets.filter((f) => !opt.skip.some((k) => f.includes(k)));

/* G3 정의는 언제나 프로젝트 전체에서 */
const defined = new Set();
for (const f of await walk(root)) {
  const src = await read(f);
  if (src) collectDefinitions(src, defined);
}

const ctx = { only: opt.only, tokens: opt.tokens, defined };
const findings = [];
for (const f of targets) {
  const src = await read(f);
  if (src) findings.push(...lintFile(f, src, ctx));
}

findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

const rel = (f) => path.relative(root, f) || f;
const report = findings.map((x) => `${rel(x.file)}:${x.line}  ${x.rule.padEnd(10)} ${x.msg}`).join('\n');

if (opt.hook) {
  if (findings.length) {
    /* 종료 코드 2 — Claude Code 가 stderr 를 Claude 에게 돌려준다 */
    process.stderr.write(`figma-mcp-guardrails: ${findings.length}건\n${report}\n` +
      `규칙: .claude/skills/figma-mcp-guardrails/SKILL.md · 의도한 것이면 그 줄에 guardrails-ignore\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (findings.length) console.log(report);
const byRule = findings.reduce((a, x) => ((a[x.rule] = (a[x.rule] || 0) + 1), a), {});
console.log(findings.length
  ? `\n${findings.length}건 — ${Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(' · ')}`
  : '문제 없음');
process.exit(findings.length ? 1 : 0);
