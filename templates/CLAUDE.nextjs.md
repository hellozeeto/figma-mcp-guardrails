# {프로젝트명} — 퍼블리싱 규칙 (Next.js)

> **공통 규칙은 `figma-mcp-guardrails` 스킬을 따른다** —
> 가드레일 `SKILL.md`, 구현 규칙 `references/rules.md` (토큰 · 이름 · 반응형 · 상태 · 폼 · 접근성).
> 이 파일에는 **이 프로젝트에서 정한 것만** 적는다. 공통 규칙을 여기 베껴 두지 않는다 —
> 한쪽만 고치면 둘이 어긋난다.

기능 사양: `{docs/기능정의.md}`

---

## 1. 작업 영역

| 영역 | 담당 |
|---|---|
| `app/**/page.tsx` · `components/` · `styles/` | 디자인팀 (화면) |
| `app/api/` · `lib/` · 데이터 연결 | 개발자 |
| `mocks/` | 디자인팀이 만들고 개발자가 실제 데이터로 바꾼다 |

- 작업 전 반드시 `git pull`
- 커밋 접두사: `publish:` 화면 / `dev:` 개발 / `fix:` 수정 / `docs:` 문서

---

## 2. 파일 위치

```
styles/
├─ tokens.css          토큰 — 값은 rules.md 2절 형식
└─ globals.css         리셋([hidden] · reduced-motion 포함) · 타이포
components/
└─ ProductCard/
   ├─ ProductCard.tsx
   └─ ProductCard.module.css
mocks/
└─ products.ts         더미 데이터 — 타입 필드명 = 기능정의서
public/fonts/          woff2 → next/font/local
```

---

## 3. 이 프로젝트의 선택

| 항목 | 결정 |
|---|---|
| 스타일 | CSS Modules. 클래스 `.card` `.title`, 변형 `.compact`, 상태 `.isActive` |
| 반복 | 컴포넌트 하나 + `mocks/` 배열 `map` |
| 클라이언트 컴포넌트 | `'use client'` 는 상호작용이 있는 컴포넌트에만 |
| 동적 값 | `style={{ '--swatch': color } as React.CSSProperties}` — CSS 변수만 |
| API 연결 자리 | `// TODO(api): POST /api/...` 로 남긴다 |
| 브레이크포인트 | `{768px}` · `{1200px}` |
| 컨테이너 폭 | `{1280px}` |

---

## 4. 넘기기 전

```bash
node .claude/skills/figma-mcp-guardrails/scripts/lint.mjs --tokens tokens --tokens globals
node .claude/skills/figma-mcp-guardrails/scripts/check.mjs http://localhost:3000 {/ /signup} {--ignore 외부도메인}
npm run build
```

`lint.mjs` 는 `.claude/settings.json` 훅으로도 건다 — README "훅으로 걸기".

체크리스트는 `rules.md` 10절.
