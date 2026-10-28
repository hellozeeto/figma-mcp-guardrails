#!/usr/bin/env node
/* =============================================================================
 * check.mjs — 퍼블리싱 결과 자동 점검
 * =============================================================================
 * 4개 폭에서 페이지를 열어 "화면만 보면 멀쩡한데 실제로는 깨진" 것을 찾는다.
 *
 *   가로 넘침       375px 에서 손가락을 좌우로 움직여야 하는가. 넘친 요소를 짚어 준다
 *   콘솔 오류       console.error · 잡히지 않은 예외
 *   깨진 리소스     4xx/5xx 응답, 실패한 요청, 그려지지 않은 이미지
 *   입력 16px       터치 폭에서 16px 미만 입력 칸 — iOS 가 확대한다 (failure-cases 7)
 *   스크린샷        시안 대조용. --out 폴더에 폭별로
 *
 * 쓰는 법
 *   npm i -D playwright && npx playwright install chromium
 *   node check.mjs http://localhost:3000 / /signup /cart --out shots
 *
 * 옵션
 *   --out <dir>      스크린샷 폴더 (기본 ./check-shots)
 *   --no-shot        스크린샷을 찍지 않는다
 *   --only <폭,…>    일부 폭만 (예: --only 375,1366)
 *   --channel <이름>  설치된 브라우저를 쓴다 (예: chrome)
 *
 * 문제가 하나라도 있으면 종료 코드 1 — CI 에 그대로 걸 수 있다.
 *
 * ⚠ 이 점검은 iOS Safari 의 확대·주소창 높이 변화 자체를 재현하지 못한다.
 *   16px 검사는 원인을 정적으로 찾는 것이다. 폼 화면은 실제 아이폰에서 한 번 본다.
 * ========================================================================== */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const VIEWPORTS = [
  { name: '375',  width: 375,  height: 812,  touch: true },
  { name: '768',  width: 768,  height: 1024, touch: true },
  { name: '1366', width: 1366, height: 768,  touch: false },
  { name: '1920', width: 1920, height: 1080, touch: false },
];

/* 글자를 받지 않는 입력은 확대 대상이 아니다 */
const NON_TEXT = ['hidden', 'checkbox', 'radio', 'submit', 'button', 'reset',
                  'file', 'range', 'color', 'image'];

function parseArgs(argv) {
  const opt = { base: null, paths: [], out: 'check-shots', shot: true, only: null, channel: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opt.out = argv[++i];
    else if (a === '--no-shot') opt.shot = false;
    else if (a === '--only') opt.only = argv[++i].split(',');
    else if (a === '--channel') opt.channel = argv[++i];
    else if (!opt.base) opt.base = a;
    else opt.paths.push(a);
  }
  if (!opt.base) {
    console.error('usage: node check.mjs <base-url> [path ...] [--out dir] [--no-shot] [--only 375,1366] [--channel chrome]');
    process.exit(2);
  }
  if (opt.paths.length === 0) opt.paths = ['/'];
  return opt;
}

/* 페이지 안에서 돈다 — 직렬화되어 넘어가므로 바깥 변수를 쓰지 않는다 */
function inspect({ touch, nonText }) {
  const label = (el) => {
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    const cls = [...el.classList].slice(0, 2).join('.');
    return el.tagName.toLowerCase() + (cls ? `.${cls}` : '');
  };

  /* 스크롤 컨테이너 안에서 넘치는 것은 의도된 것이다 (표·코드 블록) */
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
    }
    return false;
  };

  const doc = document.documentElement;
  const vw = doc.clientWidth;
  const out = { overflow: null, smallInputs: [], brokenImages: [] };

  if (doc.scrollWidth > vw) {
    const culprits = [];
    for (const el of document.body.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= vw + 1 || clipped(el)) continue;
      /* 부모도 넘쳤으면 부모만 남긴다 — 원인에 가까운 것 */
      if (culprits.some((c) => c.el.contains(el))) continue;
      culprits.push({ el, right: Math.round(r.right) });
      if (culprits.length >= 5) break;
    }
    out.overflow = {
      scrollWidth: doc.scrollWidth,
      clientWidth: vw,
      culprits: culprits.map((c) => `${label(c.el)} (right ${c.right}px)`),
    };
  }

  if (touch) {
    for (const el of document.querySelectorAll('input, select, textarea')) {
      if (el.tagName === 'INPUT' && nonText.includes((el.type || 'text').toLowerCase())) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 16) out.smallInputs.push(`${label(el)}${el.name ? `[name=${el.name}]` : ''} ${fs}px`);
    }
  }

  for (const img of document.images) {
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
      out.brokenImages.push(img.getAttribute('src'));
    }
  }

  return out;
}

async function scrollThrough(page) {
  /* 지연 로딩 이미지를 깨운다. 끝까지 내렸다가 맨 위로 */
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function checkPage(browser, vp, url, opt) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.touch,
    hasTouch: vp.touch,
    deviceScaleFactor: vp.touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  const issues = [];

  page.on('console', (m) => { if (m.type() === 'error') issues.push(`console  ${m.text()}`); });
  page.on('pageerror', (e) => issues.push(`예외     ${e.message}`));
  page.on('requestfailed', (r) => issues.push(`요청실패 ${r.url()} (${r.failure()?.errorText})`));
  page.on('response', (r) => { if (r.status() >= 400) issues.push(`HTTP ${r.status()} ${r.url()}`); });

  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
  } catch (e) {
    issues.push(`열기실패 ${e.message.split('\n')[0]}`);
    await ctx.close();
    return issues;
  }

  await scrollThrough(page);

  const r = await page.evaluate(inspect, { touch: vp.touch, nonText: NON_TEXT });
  if (r.overflow) {
    issues.push(`가로넘침 ${r.overflow.scrollWidth} > ${r.overflow.clientWidth}`);
    for (const c of r.overflow.culprits) issues.push(`           ↳ ${c}`);
  }
  for (const s of r.smallInputs) issues.push(`입력<16px ${s}`);
  for (const s of r.brokenImages) issues.push(`깨진이미지 ${s}`);

  if (opt.shot) {
    const slug = new URL(url).pathname.replace(/^\/|\/$/g, '').replace(/[^\w-]+/g, '_') || 'index';
    await page.screenshot({ path: path.join(opt.out, `${slug}@${vp.name}.png`), fullPage: true });
  }

  await ctx.close();
  return issues;
}

const opt = parseArgs(process.argv.slice(2));
const viewports = opt.only ? VIEWPORTS.filter((v) => opt.only.includes(v.name)) : VIEWPORTS;
if (opt.shot) await mkdir(opt.out, { recursive: true });

const browser = await chromium.launch({ channel: opt.channel });
let total = 0;

for (const p of opt.paths) {
  const url = new URL(p, opt.base).href;
  for (const vp of viewports) {
    const issues = await checkPage(browser, vp, url, opt);
    total += issues.filter((s) => !s.startsWith('  ')).length;
    console.log(`${issues.length ? '✗' : '✓'} ${vp.name.padStart(4)}  ${url}`);
    for (const s of issues) console.log(`        ${s}`);
  }
}

await browser.close();
console.log(total ? `\n문제 ${total}건` : '\n문제 없음');
if (opt.shot) console.log(`스크린샷: ${path.resolve(opt.out)}`);
process.exit(total ? 1 : 0);
