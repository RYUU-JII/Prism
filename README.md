# Prism

**Copy. Prism. Render.**

Prism은 복사한 코드를 Chrome Side Panel에서 즉시 렌더링하고, 요소 단위 메모를 붙여서 프롬프트로 내보내는 Manifest V3 확장입니다.

## 핵심 기능

- 복사 기반 워크플로: 코드 복사 시 자동 감지, 패널 열림 상태면 즉시 갱신
- 샌드박스 렌더러: `sidepanel/sandbox.html` + `sidepanel/sandbox/core/runtime.js` 기반 격리 렌더
- 요소 피커 + 메모: `data-prism-line` 기준으로 라인 매핑, 메모 저장/수정/삭제
- Notes Island: 메모 목록, hover 미리보기, 클릭 이동(자동 스크롤), 전체/개별 삭제
- Copy Prompt: 메모 + 현재 전체 코드를 `[CURRENT_SOURCE_OF_TRUTH]`로 묶어 내보내기
- Smart Patch: `<prism-patches>` 응답을 라인 단위로 적용해 전체 코드 재출력 없이 반영
- Adaptive Routing: 복합 수정은 자동으로 Full Code 요청으로 전환
- Full Sync Cadence/Retry: N턴 주기 또는 패치 거부 시 Full Code 재동기화
- Intelligent Extractor: copy/send/input 후보를 host별 학습하고 다중 신호로 자동가져오기 타이밍 보정
- Snapshot: HTML 저장, PNG 저장, PNG 클립보드 복사
- Open in Window: 별도 탭 윈도우 모드 렌더, `Alt + Left` 복귀

## 지원 입력 타입

- `html`, `react`, `vue`, `text`
- `angular`, `svelte`는 컴파일 산출물 없이 원본 소스만 붙이면 런타임에서 안내 메시지를 표시합니다.

## 설치

1. 저장소를 클론합니다.
2. 의존성을 설치합니다.
3. 빌드합니다.
4. Chrome 확장 페이지에서 로드합니다.

```bash
git clone https://github.com/RYUU-JII/Prism.git
cd Prism
npm --prefix sidepanel install
npm run build
```

Chrome에서:

1. `chrome://extensions` 진입
2. Developer mode 활성화
3. `Load unpacked`로 이 저장소 루트 폴더 선택

## 개발 스크립트

- `npm run build`: sidepanel Vite 빌드 (`sidepanel/dist`)
- `npm run tailwind:build`: sandbox용 `tailwind.css` 재생성
- `npm run build:all`: Tailwind + Vite 순차 빌드

## 사용 흐름

1. AI 페이지에서 코드 블록을 복사
2. 패널이 닫혀 있으면 Orb 버튼으로 열기, 열려 있으면 즉시 렌더
3. 피커로 요소를 선택하고 메모 입력
4. Notes Island에서 메모를 탐색/편집 이동/삭제
5. Copy Prompt로 현재 전체 코드 + 메모를 함께 프롬프트로 내보내기
6. Smart Patch 모드 + Auto-import 활성화 시, AI의 patch 응답을 자동 파싱해 현재 코드에 반영
7. 복합 수정/거부/주기 조건에서는 자동으로 Full Code 동기화 수행

## 권한

- `sidePanel`: 패널 열기/상태 유지
- `storage`: UI 설정 저장
- `activeTab`: 현재 탭 메시지 라우팅
- `downloads`: HTML/PNG 저장
- `host_permissions: <all_urls>`: 다양한 사이트에서 복사 감지 및 리소스 캡처

## 현재 구조

```text
Prism/
├─ manifest.json
├─ background.js
├─ content/
│  ├─ bridges/
│  │  ├─ clipboard-bridge.js
│  │  └─ network-probe-main.js
│  ├─ extractor/
│  │  └─ intelligent-extractor.js
│  ├─ orb/
│  │  ├─ orb-controller.js
│  │  ├─ orb-ui.js
│  │  ├─ chat-injector.js
│  │  ├─ patch-utils.js
│  │  └─ orb.css
│  └─ legacy/
├─ sidepanel/
│  ├─ dist/
│  ├─ src/
│  │  ├─ app/PrismApp.jsx
│  │  ├─ core/
│  │  ├─ features/workspace/components/
│  │  ├─ shared/
│  │  ├─ styles/
│  │  └─ main.jsx
│  ├─ sandbox/
│  │  ├─ core/
│  │  │  ├─ runtime.js
│  │  │  ├─ constants.js
│  │  │  └─ helpers.js
│  │  └─ renderers/
│  │     ├─ reactRenderer.js
│  │     ├─ vueRenderer.js
│  │     └─ html/
│  │        ├─ htmlRenderer.js
│  │        └─ htmlBridgeAssets.js
│  ├─ sandbox.html
│  └─ vendor/
└─ icons/
```

## 구조 원칙

- 실행 경로와 보조 모듈을 분리합니다. (`content/orb`, `content/extractor`, `content/bridges`)
- UI는 `app`/`features`/`shared`/`core`로 분리해 의존 방향을 단순화합니다.
- sandbox는 `core(runtime)`와 `renderers(framework)`를 분리해 렌더 경로를 명확히 합니다.
- 사용하지 않는 과거 파일은 `legacy`로 격리해 현재 실행 코드와 혼동을 줄입니다.

## 문서

- 아키텍처 상세: [`ARCHITECTURE.md`](./ARCHITECTURE.md)
- 기여 가이드: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## 유의사항

- 메모는 세션 메모리 상태이며 영구 저장되지 않습니다.
- Snapshot은 캡처 시 메모 오버레이/피커 오버레이를 제거한 정리된 DOM으로 생성합니다.
- 자동 테스트는 아직 없으며 수동 회귀 확인이 필요합니다.
