# 구현 규칙

프로젝트의 `CLAUDE.md` 가 있으면 그쪽이 우선한다. 여기는 프로젝트 규칙이 비어 있는 자리를 채운다.

---

## 1. 금지

| 금지 | 이유 |
|---|---|
| Figma 자동 생성 이름 (`Frame577`, `group-504`, `rectangle-369`) | 유지보수 불가. **역할로** 이름 짓는다 (`.product-card` ○ / `.right-box` ✗ / `.blue-card` ✗) |
| 인라인 스타일 | 값을 찾을 수 없다. 동적 값은 **CSS 변수로만** 넘긴다 (아래 예외) |
| `!important` | 캐스케이드를 망친다. 구조로 해결한다. 단 `prefers-reduced-motion` 오버라이드는 예외 |
| 색·간격 숫자를 컴포넌트에 직접 | 전부 토큰으로 |
| 외부 CDN 폰트·스크립트 | 배포 환경 장애에 그대로 노출된다. 파일로 들고 있는다 |
| 성공 흉내 (`setTimeout` 완료) | → failure-cases 4 |

동적 값 예외 — 제품마다 다른 색 같은 것만:

```html
<span class="product-card__swatch" style="--swatch: #3DDC84"></span>
```

---

## 2. 토큰

```css
:root {
  /* color */ --c-bg: ; --c-text: ; --c-text-sub: ; --c-primary: ; --c-line: ; --c-danger: ;
  /* type  */ --fs-sm: 0.75rem; --fs-base: 0.875rem; --fs-md: 1rem; --lh-body: 1.6;
  /* input */ --fs-input-min: 1rem;   /* 터치 화면 16px 바닥 — failure-cases 7 */
  /* space */ --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;
  /* etc   */ --radius: 8px; --radius-pill: 999px; --container: 1280px;
}
@media (hover: hover) and (pointer: fine) { :root { --fs-input-min: 0px; } }
```

- Figma 값이 어긋나면 **토큰을 늘리지 말고** 가까운 토큰에 맞춘다
- 묶은 값은 목록으로 남긴다 — 디자이너가 시안을 고칠 근거가 된다
- 토큰을 쓰기 전에 정의돼 있는지 확인한다. 정의 안 된 CSS 변수는 **오류 없이 무시된다**

---

## 3. 이름 — BEM 또는 CSS Modules

```
.block              .product-card
.block__element     .product-card__title
.block--modifier    .product-card--compact
.is-state           .is-active  .is-disabled  .is-invalid
```

CSS Modules 면 `.card` `.title` `.compact` `.isActive` 처럼 같은 구분을 유지한다.
상태 클래스는 분리한다 — JS 가 토글하고 서버 템플릿이 조건부로 붙인다.

---

## 4. 반복과 더미 데이터

- 카드 N 개를 복사해 붙이지 않는다. **하나 + 반복** (`map`, 템플릿 루프, `@loop` 주석)
- 더미는 Lorem ipsum 금지. **실제 데이터 톤**으로 — 긴 이름, 두 줄 제목, 가격 미정, 0건 같은 극단값을 섞는다
- 더미 데이터는 한곳(`mocks/`)에 모으고 **필드명을 기능정의서와 맞춘다**

---

## 5. 반응형

| 규칙 | |
|---|---|
| **가로 스크롤 금지** | 375px 에서 `scrollWidth == clientWidth` |
| 넓은 표·코드 | 자체 컨테이너 안에서만 `overflow-x: auto` |
| 단위 | 고정 px 레이아웃 금지. `%` `rem` `flex` `grid` |
| 브레이크포인트 | 모바일 우선, `min-width` 로만 확장 |
| 이미지 | `max-width: 100%` |

시안이 데스크톱 한 벌뿐이면 구간별 설계를 표로 남긴다.

| 구간 | 그리드 | 헤더 | 그 밖 |
|---|---|---|---|
| ~559 | | | |
| 560~1023 | | | |
| 1024~ | | | |

---

## 6. 상태

컴포넌트마다 **전부** 만든다. 시안에 없으면 만들고 주석으로 표시한다.

| 상태 | 예 |
|---|---|
| 기본 | |
| 빈 상태 | 장바구니 0건, 검색 결과 없음 |
| 로딩 | 스켈레톤, 스피너, 버튼 `is-loading` |
| 오류 | 폼 검증 실패, 요청 실패 |
| 비활성 | `is-disabled` |
| 선택·활성 | `is-active` |

---

## 7. 폼

```html
<div class="field">
  <label class="field__label" for="f-name">Name <span class="field__req">*</span></label>
  <input class="field__input" id="f-name" name="name" required>
  <p class="field__error" hidden>Please enter your name</p>
</div>
```

- `name` = 기능정의서 필드명
- 모든 입력에 `label` + `for`
- 필수 = `*` 표시 + `required`
- **오류 자리는 처음부터, `hidden` 으로** — 클라이언트·서버 검증이 같은 자리를 쓴다
- 체크박스는 테두리를 줄 수 없다 → `outline` + 글자색
- 버튼은 `<button type="submit">`
- 입력 칸 글자는 `max(시안 크기, var(--fs-input-min))`

---

## 8. 이미지 · 아이콘 · 폰트

| | |
|---|---|
| 아이콘 | 인라인 SVG. 아이콘 폰트·스프라이트 금지 |
| 장식 이미지 | `alt=""` |
| 의미 있는 이미지 | `alt` 필수 |
| 첫 화면 밖 | `loading="lazy"` |
| 용량 | 히어로 ~200KB, 카드 이미지 ~60KB. Figma 원본(수 MB)을 그대로 넣지 않는다 |
| 로고·패턴 | 가능하면 SVG 로 받는다 |
| 폰트 | woff2 파일을 직접 들고 `@font-face` (또는 `next/font/local`) |

---

## 9. 접근성 최소선

- 제목 계층을 건너뛰지 않는다
- `Tab` 으로 모든 인터랙션에 도달
- 포커스 링 제거 금지 (`outline: none` ✗)
- 모달 — 열릴 때 포커스 이동, `Esc` 로 닫힘, 포커스 가두기
- 색만으로 정보를 전달하지 않는다 (오류 = 색 + 문구)
- `prefers-reduced-motion` 이면 애니메이션 즉시

---

## 10. 넘기기 전 체크

- [ ] 최종 프레임 노드 ID 를 기록했다 (G1)
- [ ] 인라인 스타일(CSS 변수 예외)·`!important`·CDN 없음
- [ ] Figma 자동 생성 이름·소수점 px 없음 (G2)
- [ ] 쓴 토큰이 전부 정의돼 있다 (G3)
- [ ] 성공 흉내 코드 없음 — 연결 자리는 `TODO(api)` (G4)
- [ ] 오류 자리가 처음부터 마크업에 있다 (G5)
- [ ] 요청 범위 밖 기능 없음 (G6)
- [ ] `scripts/check.mjs` 통과 — 가로 넘침·콘솔 오류·깨진 리소스·입력 16px (G7)
- [ ] 시안과 다르게 한 곳 / 시안·스펙 충돌 / 새로 만든 상태 — 표 세 개 (G8)
- [ ] 폼이 있는 화면은 실제 아이폰에서 한 번 눌러 봤다
