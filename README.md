# Prism

**Copy. Prism. Render.**

Prism은 복사한 코드를 Chrome Side Panel에서 즉시 렌더링하고, 요소 단위 메모를 붙여서 프롬프트로 내보내는 Manifest V3 확장입니다.

## 핵심 기능

- 복사 기반 워크플로: 코드 복사 시 자동 감지, 패널 열림 상태면 즉시 갱신
- 샌드박스 렌더러: `sidepanel/sandbox.html` + `sandbox/runtime.js` 기반 격리 렌더
- 요소 피커 + 메모: `data-prism-line` 기준으로 라인 매핑, 메모 저장/수정/삭제
- Notes Island: 메모 목록, hover 미리보기, 클릭 이동(자동 스크롤), 전체/개별 삭제
- Copy Prompt: 메모를 AI 수정 지시문으로 복사 (detail level + reset policy)
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
5. Copy Prompt로 전체 메모를 프롬프트로 내보내기

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
│  ├─ clipboard-bridge.js
│  ├─ prism-orb.js
│  └─ prism-orb.css
├─ sidepanel/
│  ├─ dist/
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ components/
│  │  ├─ hooks/
│  │  ├─ styles/
│  │  └─ utils/capture.js
│  ├─ sandbox/
│  │  ├─ runtime.js
│  │  ├─ constants.js
│  │  ├─ helpers.js
│  │  └─ renderers/
│  ├─ sandbox.html
│  └─ vendor/
└─ icons/
```

## 문서

- 아키텍처 상세: [`아키텍쳐.md`](./아키텍쳐.md)
- 영문 포인터: [`PRISM_ARCHITECTURE.md`](./PRISM_ARCHITECTURE.md)

## 유의사항

- 메모는 세션 메모리 상태이며 영구 저장되지 않습니다.
- Snapshot은 캡처 시 메모 오버레이/피커 오버레이를 제거한 정리된 DOM으로 생성합니다.
- 자동 테스트는 아직 없으며 수동 회귀 확인이 필요합니다.
