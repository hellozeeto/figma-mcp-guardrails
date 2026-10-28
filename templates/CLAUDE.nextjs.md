# {프로젝트명} — 퍼블리싱 규칙 (Next.js)

> Figma MCP 로 퍼블리싱할 때는 `figma-mcp-guardrails` 스킬을 먼저 읽는다.
> 기능 사양은 `{docs/기능정의.md}` 를 본다.

## 0. 작업 영역

| 영역 | 담당 |
|---|---|
| `app/**/page.tsx` · `components/` · `styles/` | 디자인팀 (화면) |
| `app/api/` · `lib/` · 데이터 연결 | 개발자 |
| `mocks/` | 디자인팀이 만들고 개발자가 실제 데이터로 바꾼다 |

- 작업 전 반드시 `git pull`
- 커밋 접두사: `publish:` 화면 / `dev:` 개발 / `fix:` 수정 / `docs:` 문서

---

## 1. 절대 금지

| 금지 | 이유 |
|---|---|
| Figma 자동 생성 이름 (`Frame577`, `group-504`) | 역할로 이름 짓는다 |
| 인라인 `style={{}}` | 동적 값은 CSS 변수로만 (아래 예외) |
| `!important` | 구조로 해결한다 |
| 색·크기 숫자를 컴포넌트에 직접 | 전부 `tokens.css` 변수로 |
| 외부 CDN 폰트·스크립트 | `next/font/local` 로 직접 들고 있는다 |
| **성공 흉내** (`setTimeout` 완료) | 연결 자리는 `// TODO(api):` 로 남기고 멈춘다 |
| **요청받지 않은 기능** | 필요해 보이면 만들기 전에 묻는다 |

```tsx
<span className={s.swatch} style={{ '--swatch': color } as React.CSSProperties} />
```

---

## 2. 스타일 — CSS Modules + 토큰

```
styles/
├─ tokens.css     변수만
└─ globals.css    리셋 · 타이포 · 레이아웃
components/
└─ ProductCard/
   ├─ ProductCard.tsx
   └─ ProductCard.module.css
```

- 컴포넌트 1개 = 폴더 1개 = `.module.css` 1개
- 클래스는 역할로: `.card` `.title` `.price`
- 변형 `.compact`, 상태 `.isActive` `.isDisabled` `.isInvalid`

```css
:root {
  /* color */ --c-bg: ; --c-text: ; --c-primary: ; --c-line: ; --c-danger: ;
  /* type  */ --fs-sm: 0.75rem; --fs-base: 0.875rem; --fs-md: 1rem;
  /* input */ --fs-input-min: 1rem;
  /* space */ --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
  /* etc   */ --radius: 8px; --radius-pill: 999px; --container: 1280px;
}
@media (hover: hover) and (pointer: fine) { :root { --fs-input-min: 0px; } }
```

Figma 값이 어긋나면 토큰을 늘리지 말고 가까운 토큰에 맞춘다. 어긋난 지점은 목록으로 남긴다.

---

## 3. 데이터 — 반복은 map, 더미는 mocks/

- 컴포넌트 하나 + 배열 `map`. 복사해 붙이지 않는다
- 더미는 `mocks/*.ts` 에, **타입 필드명을 기능정의서와 맞춘다**
- Lorem ipsum 금지. 실제 데이터 톤 + 극단값(긴 이름, 가격 미정, 0건)

```ts
// mocks/products.ts
export type Product = { cat_no: string; name: string; price: number | null };
export const products: Product[] = [ /* ... */ ];
```

---

## 4. 컴포넌트

헤더 / 푸터 / 카드 / 버튼 / 폼 필드 / 모달 / 탭 / 아코디언 / 페이지네이션 / 테이블 행 / 빈 상태

- 두 화면 이상 나오면 `components/` 로. **새로 만들기 전에 있는 것부터 찾는다**
- `'use client'` 는 상호작용이 있는 컴포넌트에만

---

## 5. 반응형

- **375px 가로 스크롤 금지**
- 넓은 표·코드는 자체 컨테이너 안에서만 `overflow-x: auto`
- 모바일 우선, `min-width` 로만 확장 (`768px`, `1200px`)
- 시안이 데스크톱 한 벌뿐이면 구간별 설계를 표로 남긴다

---

## 6. 상태 화면

기본 / **빈 상태** / 로딩 / 오류 / 비활성 / 선택 — 전부 만든다. 시안에 없으면 만들고 표시한다.

---

## 7. 폼

```tsx
<div className={s.field}>
  <label htmlFor="f-name">Name <span className={s.req}>*</span></label>
  <input id="f-name" name="name" required className={s.input} />
  <p className={s.error} hidden>Please enter your name</p>
</div>
```

- `name` = 기능정의서 필드명
- **오류 자리는 처음부터 두고 `hidden`**
- 입력 칸 글자 `font-size: max(var(--fs-base), var(--fs-input-min))` — 아이폰 확대 방지
- 버튼은 `<button type="submit">`

---

## 8. 넘기기 전

```bash
node .claude/skills/figma-mcp-guardrails/scripts/check.mjs http://localhost:3000 / /signup
```

- [ ] `check.mjs` 통과
- [ ] `npm run build` 통과
- [ ] 폼 화면은 실제 아이폰에서 한 번
- [ ] 시안과 다르게 한 곳 / 시안·스펙 충돌 / 새로 만든 상태 — 표로 보고
