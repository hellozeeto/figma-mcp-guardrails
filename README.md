# figma-mcp-guardrails

Figma MCP 로 시안을 코드로 옮길 때, **화면은 멀쩡한데 실제로는 깨지는** 실수를 막는 Claude Code 스킬.

디자인 충실도(토큰, 시안 일치)를 다루는 스킬은 이미 있다. 이 스킬은 그다음 단계 —
실제 서비스로 돌려 보고 나서야 드러나는 실수들을 작업 순서와 검증 단계에 넣었다.

---

## 막는 것

| # | 실수 | 화면에서는 | 실제로는 | 어디서 잡았나 |
|---|---|---|---|---|
| G1 | 와이어프레임 프레임으로 작업 | 그럴듯한 페이지 | 최종 시안과 색·폰트·폭이 전부 다름 | 시안 대조 (다 만든 뒤) |
| G2 | Figma 소수점 수치 복사 (`37.33px`) | 시안과 똑같음 | 같은 간격이 파일마다 흩어짐 | 코드 리뷰 |
| G3 | 정의되지 않은 CSS 변수 사용 | 오류 없음 | 그림자가 조용히 사라짐 | 몇 주 뒤 눈으로 |
| G4 | `setTimeout` 으로 전송 흉내 | "완료" 화면 | 계정이 안 만들어짐 | **curl 은 통과**, 브라우저에서만 |
| G5 | 오류 문구 자리를 조건부로만 | — | 버튼이 안 눌리는 것처럼 보임 | 사용자 보고 |
| G6 | 요청 없는 기능 추가 | 좋은 기능처럼 보임 | 아무도 요청 안 함 | 한 달 뒤 운영 화면 |
| G7 | 입력 칸 글자 14px | 시안과 같음 | 아이폰에서 확대돼 잘림 | **에뮬레이션으로 재현 안 됨**, 실기기에서만 |
| G8 | 시안·기능정의서 충돌을 말없이 선택 | — | 7곳이 스펙과 다름 | 항목별 대조 |

사례별 증상·원인·규칙 → [`references/failure-cases.md`](skills/figma-mcp-guardrails/references/failure-cases.md)

---

## 구성

```
skills/figma-mcp-guardrails/
├─ SKILL.md                    가드레일 8개 + 작업 순서 (프레임 확정 → 토큰 → 노드 → 구현 → 검증 → 보고)
├─ references/
│  ├─ rules.md                 구현 규칙 — 토큰, 이름, 반응형, 상태, 폼, 접근성, 체크리스트
│  ├─ failure-cases.md         실수 8가지의 증상 · 원인 · 발견 경로 · 확인 날짜와 재확인 조건
│  ├─ adding-guardrails.md     G9 후보를 찾고 채택하는 절차
│  └─ observations.md          보류한 패턴 — 아직 규칙이 아닌 것
└─ scripts/
   ├─ lint.mjs                 코드 검사 — G2 · G3 · G4 · !important. 훅으로 건다
   └─ check.mjs                Playwright 화면 점검
templates/
└─ CLAUDE.nextjs.md            Next.js 프로젝트용 CLAUDE.md — 프로젝트별 결정만. 공통 규칙은 스킬을 참조
```

---

## 설치

프로젝트 단위:

```bash
mkdir -p .claude/skills
cp -r skills/figma-mcp-guardrails .claude/skills/
```

모든 프로젝트에서:

```bash
cp -r skills/figma-mcp-guardrails ~/.claude/skills/
```

Figma MCP 서버 연결은 [Figma 공식 가이드](https://github.com/figma/mcp-server-guide)를 따른다.

---

## 쓰기

Figma 링크를 주고 화면을 만들어 달라고 하면 Claude 가 스킬을 읽고 순서대로 진행한다.

```
이 프레임으로 회원가입 화면 만들어줘 https://www.figma.com/design/...?node-id=12-345
```

후보 프레임이 여럿이면 먼저 묻고(G1), 끝나면 표 세 개로 보고한다 —
시안과 다르게 한 곳 / 시안·기능정의서 충돌 / 새로 만든 상태.

---

## 코드 검사 — `lint.mjs`

브라우저 없이 파일만 읽는다. 의존성 없음 (Node 18+).

| 규칙 | 잡는 것 |
|---|---|
| G2 | 소수점 px(`37.33px`), 토큰 파일 밖의 색 직접 사용(`#a2bde4`, `rgb(…)`) |
| G3 | 정의 안 된 CSS 변수 — 프로젝트 전체에서 정의를 모아 대조. `var(--x, 기본값)` 은 제외 |
| G4 | `preventDefault()` 직후 20줄 안의 `setTimeout` — 성공 흉내 의심. `_preview` 파일은 제외 |
| `!important` | `[hidden]` 리셋 · `prefers-reduced-motion` 블록 밖 |

```bash
node .claude/skills/figma-mcp-guardrails/scripts/lint.mjs            # 전체
node .claude/skills/figma-mcp-guardrails/scripts/lint.mjs src/styles # 일부
```

```
components/card.css:2  G2         소수점 px 37.33px — 가까운 토큰으로
components/card.css:2  G3         정의 안 된 변수 --shadow-1 — 오류 없이 무시된다
components/form.js:5   G4         전송을 막은 뒤 setTimeout — 성공 흉내가 아닌지 확인

3건 — G2 1 · G3 1 · G4 1
```

| 옵션 | |
|---|---|
| `--only G3,G4` | 일부 규칙만 — 기존 코드베이스에 처음 걸 때 G2 는 양이 많다 |
| `--tokens <글자>` | 토큰·리셋 파일로 볼 파일명 (기본 `tokens` `reset` `globals` `base`) |
| `--skip <글자>` | 경로에 이 글자가 든 파일 제외 |

의도한 줄은 그 줄 주석에 `guardrails-ignore` 와 이유를 적는다.

### 훅으로 걸기

`.claude/settings.json` — Claude 가 파일을 고칠 때마다 그 파일을 검사하고, 걸리면 결과를 Claude 에게 돌려준다.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/skills/figma-mcp-guardrails/scripts/lint.mjs --hook --only G3,G4,!important" }
        ]
      }
    ]
  }
}
```

새 프로젝트면 `--only` 를 빼고 전부 건다.

---

## 화면 점검 — `check.mjs`

375 · 768 · 1366 · 1920 네 폭에서 페이지를 연다.

| 검사 | |
|---|---|
| 가로 넘침 | 넘친 요소를 짚어 준다. 스크롤 컨테이너 안(표·코드)은 제외 |
| 콘솔 오류 | `console.error`, 잡히지 않은 예외 |
| 깨진 리소스 | 4xx/5xx, 실패한 요청, 그려지지 않은 이미지 (지연 로딩까지 스크롤해서) |
| 입력 16px | 터치 폭에서 16px 미만 입력 칸 (G7) |
| 스크린샷 | 폭별 전체 페이지 — 시안 대조용 |

```bash
npm i -D playwright
npx playwright install chromium

node .claude/skills/figma-mcp-guardrails/scripts/check.mjs http://localhost:3000 / /signup /cart
```

```
✗  375  http://localhost:3000/signup
        가로넘침 608 > 375
                   ↳ div.promo-banner (right 608px)
        입력<16px input.field__input[name=email] 14px
✓ 1366  http://localhost:3000/signup

문제 2건
```

문제가 있으면 종료 코드 1 — CI 에 그대로 걸 수 있다.

| 옵션 | |
|---|---|
| `--out <dir>` | 스크린샷 폴더 (기본 `./check-shots`) |
| `--no-shot` | 스크린샷 생략 |
| `--only 375,1366` | 일부 폭만 |
| `--channel chrome` | 설치된 Chrome 사용 |
| `--ignore <글자>` | 주소에 이 글자가 든 요청·콘솔 오류 무시. 여러 번 (외부 태그·폰트 등) |

- `ERR_ABORTED`(페이지 이동·미리 불러오기 취소)는 실패로 세지 않는다
- 입력 16px 검사는 **지금 숨은 칸도 본다** — 닫힌 시트·모달 안 폼이 열리면 그대로 확대된다.
  포커스를 받을 수 없는 칸(비활성, `inert`·`aria-hidden` 안, `tabindex=-1`)만 뺀다

> **한계** — iOS Safari 의 입력 확대·주소창 높이 변화는 재현하지 못한다.
> 16px 검사는 원인을 정적으로 찾을 뿐이다. 폼 화면은 실제 아이폰에서 한 번 본다.

---

## 규칙 늘리기 · 지우기

G1~G8 은 끝이 아니다. 퍼블리싱 묶음이 끝나면 PR 리뷰 · QA 피드백 · 세션 기록을 모아
**G1~G8 로 설명되지 않는 패턴**을 AI 에게 찾게 하고, 근거와 발생 횟수가 붙은 후보를 사람이 고른다.
채택하면 커밋 — git 이력이 규칙의 버전 기록이 된다.

환경에 기대는 규칙(G7 아이폰 확대 등)은 언젠가 낡는다. `failure-cases.md` 각 항목의
**확인** 줄(날짜 · 환경 · 재확인 조건)이 지워도 되는지 판단할 근거다.

절차 → [`references/adding-guardrails.md`](skills/figma-mcp-guardrails/references/adding-guardrails.md)

---

## 함께 쓰기

- [figma/mcp-server-guide](https://github.com/figma/mcp-server-guide) — Figma 공식 MCP 스킬 (`figma-design-to-code` 등).
  디자인 충실도는 그쪽, 운영에서 깨지는 지점은 이쪽이 맡는다. 이 저장소는 그 내용을 복제하지 않았다.

---

## 라이선스

MIT
