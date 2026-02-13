# Prism 아키텍처

이 문서는 현재 코드베이스 기준으로 Prism의 구조, 주요 객체의 동작, 변경 시 주의사항을 정리합니다.

## 1. 시스템 구성

Prism은 5개 런타임 레이어로 동작합니다.

1. `content/*`  
복사 이벤트 감지, Orb UI, 지능형 추출(버튼 학습/완료 신호 결합), 패널 열기 트리거를 담당합니다.

2. `background.js` (Service Worker)  
탭별 최신 payload 저장, Side Panel 상태 브로드캐스트, 메시지 허브 역할을 담당합니다.

3. `sidepanel/src/*` (React App)  
UI 상태/리듀서/설정/메모 관리, sandbox iframe과 양방향 브리지를 담당합니다.

4. `sidepanel/sandbox/core/runtime.js`  
렌더 타입 분기(html/react/vue/text), iframe(srcdoc) 브리지 포워딩, 캡처 payload 전달을 담당합니다.

5. `sidepanel/sandbox/renderers/html/htmlRenderer.js` + `htmlBridgeAssets.js`  
srcdoc bridge 문자열과 HTML 렌더 주입을 담당하며, DOM 픽킹/하이라이트/네비게이션/캡처 수집이 이 레이어에서 동작합니다.

### 1.1 현재 폴더 설계 원칙

- `content/bridges`: 페이지/메인월드 브리지 스크립트
- `content/extractor`: AI UI 상태 추출/완료 감지
- `content/orb`: Orb UI/자동가져오기/Smart Patch 핵심 로직
- `content/legacy`: 비활성 레거시 파일 보관
- `sidepanel/src/app`: 진입 앱(`PrismApp.jsx`)
- `sidepanel/src/features`: 화면 기능 단위 컴포넌트
- `sidepanel/src/shared`: 공용 hook/util
- `sidepanel/src/core`: 정책/프롬프트/설정 도메인 로직
- `sidepanel/sandbox/core`: 샌드박스 런타임 코어
- `sidepanel/sandbox/renderers`: 프레임워크별 렌더러

## 2. 엔드투엔드 흐름

1. 사용자가 코드 복사  
`content/bridges/clipboard-bridge.js`가 clipboard write를 후킹하고 `prism-clipboard-write` 커스텀 이벤트 발행.

2. 타입 감지 + 렌더 요청  
`content/orb/orb-controller.js`가 코드 종류 감지 후 `PRISM_RENDER_NOW`를 `background.js`로 전송.

3. payload 저장 + 패널 상태 판단  
`background.js`가 `chrome.storage.session.latestByTab`에 저장하고, 패널 열림 상태면 `PRISM_RENDER`를 즉시 브로드캐스트.

4. React App 반영  
`sidepanel/src/app/PrismApp.jsx`가 payload를 수신해 `updateViewer()` 호출, HTML이면 `data-prism-line` 주입 후 sandbox로 전달.

5. sandbox 렌더  
`sidepanel/sandbox/core/runtime.js`가 kind별 렌더러 실행.

6. html 렌더러 내부 브리지 활성화  
`sidepanel/sandbox/renderers/html/htmlRenderer.js`가 `htmlBridgeAssets.js`의 srcdoc script를 주입하고, picker/marker/navigation/capture를 처리.

7. 메모 입력/수정  
picker 선택 시 `PRISM_PICKER_SELECT`가 App으로 올라오고, 하단 `CommandBar`에서 저장하면 `instructions[line] = memo`.

8. Notes 목록 탐색  
`NotesIsland` hover 시 preview line 전달, click 시 `PRISM_INSTRUCTION_NAVIGATE`로 해당 요소 스크롤 + 편집 진입.

## 3. 핵심 상태 객체

### 3.1 App UI 설정 (`uiSettings`)

`sidepanel/src/app/PrismApp.jsx`에서 로컬스토리지(`prism-ui-settings-v3`)에 저장됩니다.

- `themeMode: "detect" | "light" | "dark"`
- `lockInteractionsWhenPaused: boolean`
- `showTooltips: boolean`
- `captureRange: "visible" | "full"`
- `memoResetPolicy: "on_code_change" | "on_copy" | "manual"`
- `keepPickerActiveAfterSelect: boolean`
- `aiResponseMode: "full" | "patch"`
- `adaptiveResponseRouting: boolean`
- `autoImportResponse: boolean`
- `patchFullSyncEvery: 0 | 2 | 3 | 5 | 8`
- `retryFullSyncOnReject: boolean`
- `exportAction: "copy" | "inject" | "send"`
- `pickerAutoPause: boolean`
- `pickerHighlight: { strength: "subtle" | "medium" | "strong", color: string }`

### 3.2 상호작용 상태 (`interactionReducer`)

`sidepanel/src/app/PrismApp.jsx`

- `pickerActive`
- `canvasFrozen`
- `focusLine`, `focusToken`
- `instructions: Record<line, memoText>`
- `activeInstructionLine`
- `activeElementRect`

주요 액션:

- `TOGGLE_PICKER`, `SET_PICKER_ACTIVE`
- `TOGGLE_FROZEN`
- `PICKER_SELECT`
- `SAVE_ACTIVE_INSTRUCTION`, `REMOVE_ACTIVE_INSTRUCTION`
- `REMOVE_INSTRUCTION_BY_LINE`, `CLEAR_INSTRUCTIONS`, `SET_INSTRUCTIONS`
- `CLEAR_SELECTION`

### 3.3 sandbox UI 상태 (`PRISM_UI_STATE`)

`PrismApp -> sidepanel/sandbox/core/runtime.js -> srcdoc`로 전달됩니다.

- `pickerActive`
- `frozen`
- `instructions`
- `previewLine`
- `editingLine`
- `settings`

## 4. 주요 객체별 동작 요약

### `background.js`

- 탭별 최신 렌더 payload를 세션 스토리지에 저장합니다.
- heartbeat 포트(`prism-heartbeat`) 연결 여부를 패널 열림 상태 SSOT로 사용합니다.
- `OPEN_PRISM`, `PRISM_RENDER_NOW`, `PRISM_GET_LATEST`, `PRISM_SET_LATEST`, `PRISM_PROXY_FETCH`를 처리합니다.

### `content/orb/orb-controller.js`

- 코드 타입 감지(`detectKind`) 후 텍스트가 아니면 렌더를 요청합니다.
- Smart Patch 모드에서는 `<prism-patches>` / `<prism-patch start_line end_line>` 응답을 파싱해 기존 코드에 라인 단위로 적용합니다.
- 패치 범위 검증(라인 범위/겹침) 후 적용하며, base code가 없으면 `PRISM_GET_LATEST`로 복원 시도합니다.
- `content/extractor/intelligent-extractor.js` 모듈과 연결되어, copy/send/input 후보를 host별로 학습하고 자동 가져오기 완료 감지를 보강합니다.
- 패널 닫힘 상태에서 Orb 노출, 열림 상태에서는 피드백 애니메이션만 노출합니다.
- 패널 상태(`PRISM_PANEL_STATUS`)를 수신해 Orb 표시 정책을 동기화합니다.

### `sidepanel/src/app/PrismApp.jsx`

- payload 렌더, 상태 리듀서, 설정 관리, toast, 캡처 트리거를 중앙에서 제어합니다.
- 메모 정책(`memoResetPolicy`)을 코드 변경/복사 시점에 적용합니다.
- 프롬프트 생성 시 현재 전체 코드를 매번 `[CURRENT_SOURCE_OF_TRUTH]`로 포함해 컨텍스트 드리프트를 줄입니다.
- Smart Patch 실패/복합 수정/주기 조건에서 Full Code 요청으로 자동 전환하는 하이브리드 동기화를 관리합니다.
- Notes hover/select/delete/clear와 sandbox 메시지 브리지를 관리합니다.

### `sidepanel/src/features/workspace/components/NotesIsland.jsx`

- 하단 상태 바 + 확장 리스트 UI.
- hover 확장/닫힘 타이머, click pin, 전체삭제 confirm, 행별 삭제를 담당합니다.
- hover 중인 line을 App에 전달해 프리뷰 하이라이트를 유도합니다.

### `sidepanel/src/features/workspace/components/CommandBar.jsx`

- 하단 가상 바에서 메모 입력/저장/삭제를 담당합니다.

### `sidepanel/sandbox/core/runtime.js`

- 렌더 kind 분기: html/react/vue/text/unsupported.
- iframe(srcdoc)와 parent(App) 사이 메시지 포워딩 담당.
- `PRISM_UI_STATE`와 `PRISM_INSTRUCTION_NAVIGATE`를 srcdoc에 전달.

### `sidepanel/sandbox/renderers/html/htmlRenderer.js`

- srcdoc bridge를 문자열로 주입합니다.
- picker hover 오버레이, 메모 마커, SVG proxy, editing dash 효과를 렌더합니다.
- `elementsFromPoint` 기반 target 탐색으로 중첩 요소 선택 기회를 유지합니다.
- 스냅샷용 DOM payload(`PRISM_EXPORT_FOR_CAPTURE`)를 생성합니다.

### `sidepanel/src/shared/utils/capture.js`

- sandbox가 전달한 payload를 ShadowRoot에 복제한 뒤 캡처합니다.
- 메모/피커 오버레이, 외부 iframe/script를 제거하여 결과 안정성을 높입니다.
- canvas를 dataURL로 복원하고 `modern-screenshot`으로 PNG 생성/복사/저장합니다.

## 5. 하이라이트 상태 체계

아래 클래스가 실제 시각 상태를 결정합니다.

- 기본 메모 마커: `.prism-has-instruction`
- 피커 hover(비메모 대상 포함): `.prism-picker-hover` (+ `--svg`, `--background`)
- 메모 대상 피커 포커스: `.prism-has-instruction--picker-focus`
- Notes hover 프리뷰: `.prism-has-instruction--notes-preview`
- 편집중: `.prism-has-instruction--editing` 또는 `.prism-editing-target`
- SVG 보정용 프록시: `.prism-svg-instruction-proxy`

중요:

- SVG는 원본 stroke/outline 대신 프록시 박스를 RAF로 동기화해서 표시합니다.
- background-like 요소는 별도 처리(`--background`)로 과도한 레이아웃 교란을 방지합니다.

## 6. 메시지 프로토콜 (핵심)

| 방향 | 타입 | 설명 |
| --- | --- | --- |
| content -> background | `PRISM_RENDER_NOW` | 복사 직후 즉시 렌더 요청 |
| content -> background | `OPEN_PRISM` | Orb 클릭 시 패널 열기 + 렌더 |
| background -> sidepanel | `PRISM_RENDER` | 실제 렌더 payload 전달 |
| sidepanel -> sandbox | `RENDER` | sandbox 렌더 실행 |
| sidepanel -> sandbox | `PRISM_UI_STATE` | picker/freeze/instructions/settings 동기화 |
| sidepanel -> sandbox | `PRISM_INSTRUCTION_NAVIGATE` | 특정 라인 메모 위치로 이동 |
| srcdoc -> sidepanel | `PRISM_PICKER_SELECT` | 타겟 클릭 결과(line, rect) |
| srcdoc -> sidepanel | `PRISM_INSTRUCTION_NAVIGATE_MISS` | 대상 라인 요소 미존재 |
| sandbox/srcdoc -> sidepanel | `PRISM_EXPORT_FOR_CAPTURE` | 캡처용 정제 payload |

## 7. 메모 초기화 정책

`memoResetPolicy`는 App에서 적용됩니다.

- `on_code_change`  
`contentIdentity`가 바뀌면 메모 전체 초기화.

- `on_copy`  
Copy Prompt 성공 시 메모 전체 초기화.

- `manual`  
자동 초기화하지 않음.

공통 안전장치:

- `manual`, `on_copy`에서도 코드 라인 범위 밖 메모는 prune 후 toast로 알림.

## 8. 변경 시 유의사항

1. `htmlRenderer.js` / `htmlBridgeAssets.js`의 srcdoc bridge는 템플릿 문자열 기반입니다. 작은 문법 실수도 iframe 전체를 먹통으로 만들 수 있습니다.  
대표 증상: `Unexpected identifier 'data'`.

2. import map은 동일 specifier 중복 정의를 피해야 합니다.  
중복 시 Chrome이 규칙을 제거하며 콘솔에 conflict 경고를 남깁니다.

3. 메모 마커 클래스명을 변경하면 캡처 정리 로직(`sidepanel/src/shared/utils/capture.js`)도 같이 갱신해야 합니다.

4. HTML 요소 라인 매핑은 `addPrismLineAttributes()`에 의존합니다.  
이 경로가 깨지면 picker line/notes navigation이 모두 부정확해집니다.

5. pause + interaction lock 정책은 pointer-events를 강제 제어합니다.  
새 UI 오버레이를 추가할 때 lock 예외 대상인지 반드시 확인해야 합니다.

6. 메모는 비영구 상태입니다.  
서비스 워커/패널 재시작 시 payload는 복원될 수 있어도 메모는 초기화될 수 있습니다.

## 9. 회귀 테스트 체크리스트

1. 복사 -> Orb/즉시렌더 분기 정상 동작
2. picker on/off, pause on/off 동작
3. 메모 저장/수정/개별삭제/전체삭제
4. Notes hover 하이라이트 + click 이동
5. Copy Prompt + reset policy 동작
6. PNG 저장/클립보드 복사 시 메모 오버레이 미포함
7. window mode 진입/복귀(`Alt + Left`)

