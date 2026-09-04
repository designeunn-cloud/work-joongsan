---
name: 업무 관리 프로그램
description: 엑셀 업무요청 자동 인테이크 및 진행상황 대시보드
colors:
  primary: "#4f46e5"
  primary-hover: "#6366f1"
  primary-subtle: "#eef2ff"
  primary-strong: "#4338ca"
  neutral-canvas: "#f5f5f5"
  neutral-surface: "#ffffff"
  neutral-border: "#e5e5e5"
  neutral-border-strong: "#d4d4d4"
  neutral-text-muted: "#a3a3a3"
  neutral-text-secondary: "#737373"
  neutral-text: "#525252"
  neutral-text-strong: "#171717"
  status-progress: "#3b82f6"
  status-progress-subtle: "#eff6ff"
  status-progress-strong: "#1d4ed8"
  status-review: "#f97316"
  status-review-subtle: "#fff7ed"
  status-review-strong: "#c2410c"
  status-done: "#10b981"
  status-done-subtle: "#ecfdf5"
  status-done-strong: "#047857"
  status-overdue: "#ef4444"
  status-overdue-subtle: "#fef2f2"
  status-overdue-strong: "#b91c1c"
typography:
  body:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  label:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
  stat:
    fontFamily: "Arial, Helvetica, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  control: "8px"
  container: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  card:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text-strong}"
    rounded: "{rounded.container}"
    padding: "12px 16px"
  input:
    backgroundColor: "{colors.neutral-surface}"
    textColor: "{colors.neutral-text-strong}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
---

# Design System: 업무 관리 프로그램

## Overview

**Creative North Star: "The Practical Baseline"**

이 시스템은 의도적으로 화려하지 않다. 디자인팀 담당자 1인이 매일 반복해서 훑어보는 내부 업무 도구이기 때문에, 표현보다 스캔 속도와 신뢰감을 우선한다 — 확인 결과 아직 브랜드 정체성이 확정되지 않은 상태이고, 이번 문서화에서도 "지금 그대로(기본 Tailwind 느낌) 유지"를 선택했다. 즉 이것은 미완성이 아니라 확정된 선택이다: 장식이 없는 것 자체가 이 시스템의 성격이다.

톤앤매너는 **차분하고 절제됨**으로 확정됐다 — 색은 상태(진행중/검토/완료/지연)를 알려줄 때만 등장하고, 그 외에는 여백·정렬·1px 뉴트럴 보더로 구조를 표현한다. 인디고(#4f46e5)는 유일한 브랜드성 강조색으로, 내비게이션 활성 상태와 기본 액션 버튼에만 예약되어 있다.

**Key Characteristics:**
- 장식 없는 실용주의 — 그림자·그라데이션·장식적 아이콘이 거의 없음
- 상태 색상(파랑/주황/에메랄드/빨강)은 오직 의미 전달 용도로만 사용
- 인디고 강조색은 "지금 이대로 유지"가 확정된 결정
- 타이포그래피는 시스템 산세리프 스택 하나만 사용 (표현보다 판독성)

## Colors

전체 팔레트는 뉴트럴 그레이 위에 인디고 하나만 브랜드 강조색으로 얹고, 나머지 색(파랑/주황/에메랄드/빨강)은 업무 상태를 나타내는 의미 전용 색이다.

### Primary
- **Confident Indigo** (`#4f46e5`): 사이드바 활성 메뉴 텍스트, 기본(Primary) 버튼 배경, 탭의 활성 밑줄에 사용. 이 시스템에서 유일하게 "브랜드"로 읽히는 색이며, 이번 문서화에서 현재 값 그대로 유지하기로 확정했다.
- **Indigo Hover** (`#6366f1`): Primary 버튼의 hover 배경.
- **Indigo Subtle** (`#eef2ff`): 활성 사이드바 항목 배경, 태그 칩(#태그) 배경 — 인디고를 "면"으로 쓸 때는 항상 이 옅은 톤.
- **Indigo Strong** (`#4338ca`): 활성 사이드바 텍스트, 활성 탭 텍스트.

### Neutral
- **Canvas Gray** (`#f5f5f5`, `neutral-100`): 앱 전체 배경(`body`) — 콘텐츠 표면과 구분되는 바탕.
- **Surface White** (`#ffffff`): 사이드바, 카드, 모달 등 모든 콘텐츠 표면.
- **Hairline Border** (`#e5e5e5`, `neutral-200`): 카드/구분선의 기본 1px 보더.
- **Border Strong** (`#d4d4d4`, `neutral-300`): 버튼/인풋의 보더 — 클릭 가능한 대상임을 표시.
- **Text Muted** (`#a3a3a3`, `neutral-400`): 드래그 핸들, 가장 낮은 우선순위 아이콘.
- **Text Secondary** (`#737373`, `neutral-500`): 라벨, 보조 정보(담당자, 타임스탬프).
- **Text Body** (`#525252`, `neutral-600`): 내비게이션 비활성 텍스트, 보조 버튼 텍스트.
- **Text Strong** (`#171717`, `neutral-900`): 제목, 카드 본문, 숫자 — 가장 진한 텍스트.

### Named Rules
**The Semantic-Only Color Rule.** 파랑·주황·에메랄드·빨강은 오직 업무 상태(진행중/검토/완료/지연)를 뜻할 때만 쓴다. 장식이나 강조 목적으로 상태색을 재사용하지 않는다 — 강조가 필요하면 인디고를 쓴다.

## Typography

**Body / UI Font:** Arial, Helvetica, sans-serif (시스템 산세리프 스택)

**Character:** 판독성 위주의 중립적인 시스템 폰트 하나만 쓴다. (참고: `next/font`로 Geist Sans/Geist Mono를 로드해두었지만, `globals.css`의 `body` 규칙이 `font-family: Arial, Helvetica, sans-serif`를 직접 지정하고 있어 실제로는 거의 모든 화면에서 Geist가 아니라 이 시스템 폰트 스택이 렌더링된다. Geist는 코드 한 곳(`DailyJournal.tsx`의 `<pre>` 블록, `font-sans` 유틸리티)에서만 실제로 적용된다.)

### Hierarchy
- **Stat** (700, 24px, line-height 1.2): 대시보드 통계 카드의 큰 숫자.
- **Title** (600, 15px, line-height 1.4): 업무 카드 제목(업무요청내용).
- **Body** (400, 14px, line-height 1.5): 버튼, 인풋, 기본 UI 텍스트.
- **Label** (500, 12px, line-height 1.3): 필드 라벨, 칩/뱃지, 보조 타임스탬프.

## Layout

사이드바(고정폭 224px, 접으면 64px) + 메인 콘텐츠의 좌우 2분할 셸. 메인 영역은 카드/테이블이 뉴트럴 캔버스(`#f5f5f5`) 위에 흰 표면으로 떠 있는 구조. 카드 내부 간격은 4px 단위 스케일(4/8/12/16/24px)을 쓰고, 버튼·인풋은 `padding: 6px 12px`, 카드는 `padding: 12px 16px`, 모달은 `padding: 24px`가 기준값이다. 반응형 브레이크포인트는 Tailwind 기본값을 그대로 쓰며, 업무 카드(`TaskCard`)만 컨테이너 쿼리(`@container`, `@[680px]:`)로 카드 폭에 따라 1열/2열 레이아웃을 전환한다.

## Elevation & Depth

이 시스템은 **정지 상태에서 완전히 평면(flat)**이다 — 카드와 인풋은 그림자 없이 1px 뉴트럴 보더만으로 경계를 표현한다. 그림자는 오직 상호작용에 대한 응답으로만 나타난다: 카드는 hover 시 `shadow-sm → shadow-md`로 살짝 떠오르고, 모달/오버레이는 `shadow-lg`로 확실히 분리된다.

### Shadow Vocabulary
- **Rest** (없음, 보더만): 카드·인풋·사이드바의 기본 상태.
- **Hover Lift** (`box-shadow: 0 1px 2px rgba(0,0,0,0.05)` → `0 4px 6px rgba(0,0,0,0.07)`, Tailwind `shadow-sm`→`shadow-md`): 완료되지 않은 업무 카드에 마우스를 올렸을 때.
- **Overlay** (`box-shadow: 0 10px 15px rgba(0,0,0,0.1)`, Tailwind `shadow-lg`): 모달(`AddTaskModal`, `EditTaskModal`, `EditLeaveModal`).

### Named Rules
**The Rest-Is-Flat Rule.** 그림자는 상태 변화(hover)나 레이어 분리(모달)에 대한 응답으로만 등장한다. 정지 상태의 표면에 그림자를 얹지 않는다.

## Shapes

라운드 반경은 역할에 따라 두 단계로 고정되어 있다: 버튼·인풋·내비게이션 항목 같은 **컨트롤**은 8px(`rounded-lg`), 카드·모달·통계 타일 같은 **컨테이너**는 12px(`rounded-xl`)를 쓴다. 칩/뱃지/점(dot)/드래그 핸들은 완전한 원(`rounded-full`)이다. 업무 카드는 상태를 나타내는 4px 두께의 좌측 보더(`border-l-4`)를 갖는다 — 진행중은 옅은 파랑, 검토는 옅은 주황, 완료는 옅은 에메랄드, 지연은 빨강.

### Named Rules
**The Status Spine Rule.** 업무 카드 왼쪽의 4px 컬러 보더가 상태를 알려주는 1차 신호다 — 텍스트를 읽지 않고도 목록을 훑을 수 있어야 한다는 원칙을 지키는 장치이므로, 새 상태 아이콘이나 배지를 별도로 추가하지 않는다.

## Components

### Buttons
- **Shape:** 8px 라운드 (`rounded-lg`)
- **Primary:** 배경 `#4f46e5`(Confident Indigo), 텍스트 흰색, `padding: 6px 12px`, `font-size: 14px`. 폼의 주요 제출 액션에만 사용(예: "저장", "추가").
- **Secondary / Ghost:** 배경 흰색, 텍스트 `neutral-600`, 보더 `neutral-300`. hover 시 배경 `neutral-100`. 취소/보조 액션에 사용.
- **Icon Button:** 정사각형에 가까운 `padding: 8px`, 보더 `neutral-300`, 텍스트 `neutral-600`. 삭제 버튼만 hover 시 빨강(`red-300` 보더, `red-600` 텍스트, `red-50` 배경)으로 전환된다.
- **Hover / Focus:** 배경색 전환만 있고 별도 그림자·확대 효과는 없다.

### Chips / Pills
- **Style:** `rounded-full`, `padding: 2px 8px`, `font-size: 12px`, 앞에 작은 색 점(dot)을 동반.
- **State:** 상태별 색 쌍(배경 subtle + 텍스트 strong)을 그대로 따른다 — 예: 지연 뱃지는 `bg-red-50 text-red-700` + 빨강 점.

### Cards / Containers
- **Corner Style:** 12px (`rounded-xl`)
- **Background:** 기본 흰색, 완료된 업무는 `neutral-50` + `opacity: 0.7`로 톤다운.
- **Shadow Strategy:** 정지 시 없음, hover 시 `shadow-sm → shadow-md` (Elevation 섹션 참고).
- **Border:** 1px `neutral-200` + 좌측 4px 상태색 보더(Status Spine Rule).
- **Internal Padding:** `12px 16px`.

### Inputs / Fields
- **Style:** 보더 `neutral-300`, `rounded-lg`, `padding: 6px 12px`, `font-size: 14px`, 배경 흰색.
- **Focus (인라인 편집 시):** 보더가 `indigo-300`로 바뀌며 아웃라인 없이 보더 색만으로 포커스를 표시.
- **Label:** 인풋 위 `12px`, `neutral-500` 텍스트로 라벨 표기 (`Field` 컴포넌트).

### Navigation
- **Style:** 흰 배경 사이드바(224px, 접으면 64px), 우측 1px 보더로 콘텐츠 영역과 분리.
- **Default:** 텍스트 `neutral-600`.
- **Hover:** 배경 `neutral-100`, 텍스트 `neutral-900`.
- **Active:** 배경 `indigo-50`, 텍스트 `indigo-700`, `rounded-lg`.
- **접기/펼치기:** 너비만 트랜지션되고 라벨은 숨김 처리 — 아이콘만 남는 축소 모드 지원.

### Stat Card (Signature Component)
대시보드 상단의 통계 타일. 원형 색 칩 안에 아이콘, 아래에 `12px` 라벨과 `24px/700` 숫자. 톤(`indigo`/`red`/`emerald`/`blue`/`orange`)에 따라 아이콘 칩의 배경/텍스트 색만 바뀌고 카드 자체는 항상 흰 배경 + `rounded-xl` + `shadow-sm`을 유지한다.

## Do's and Don'ts

### Do:
- **Do** 인디고(`#4f46e5`)를 내비게이션 활성 상태와 Primary 버튼에만 예약해서 쓴다.
- **Do** 업무/작업 카드에는 4px 좌측 보더로 상태를 표시한다(Status Spine Rule) — 별도 상태 아이콘을 새로 만들지 않는다.
- **Do** 표면은 정지 상태에서 그림자 없이 1px 뉴트럴 보더만 쓰고, hover(카드)·오버레이(모달)에서만 그림자를 준다(Rest-Is-Flat Rule).
- **Do** 컨트롤(버튼/인풋/내비)은 8px, 컨테이너(카드/모달)는 12px로 라운드 반경을 일관되게 유지한다.
- **Do** 현재 시스템 산세리프 스택(Arial, Helvetica, sans-serif)을 그대로 유지한다 — 이번 문서화에서 별도 디스플레이 폰트를 도입하지 않기로 확정했다.

### Don't:
- **Don't** 파랑·주황·에메랄드·빨강을 상태 의미 없이 장식용으로 쓰지 않는다 — 이미 진행중/검토/완료/지연의 의미로 예약되어 있다.
- **Don't** 정지 상태의 카드나 인풋에 그림자를 추가하지 않는다 — 이 시스템의 기본은 완전히 평면이다.
- **Don't** 라운드 반경을 8px/12px 두 단계 밖으로 임의로 바꾸지 않는다.
- **Don't** Geist Sans/Mono를 실제로 적용하지 않은 채(현재는 `body` 규칙에 가려짐) 새 컴포넌트에서만 부분적으로 켜지 않는다 — 폰트를 바꾸려면 `globals.css`의 `body` 규칙부터 명시적으로 바꿔야 한다.
