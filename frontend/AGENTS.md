# frontend — Expo (React Native)

루트 `AGENTS.md`(모노레포 실행·env·에러코드 계약)를 먼저 따를 것.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## 제공 디바이스

- 하나의 Expo 코드베이스로 **iOS 앱, Android 앱, 모바일 웹, 데스크톱 웹**을 제공한다.
- 별도 요청이 없는 한 `desktop`은 네이티브 데스크톱 앱이 아니라 **Expo Web으로 실행되는 넓은 브라우저 화면**을 뜻한다.
- 모든 화면은 작은 모바일 화면부터 태블릿, 넓은 데스크톱 브라우저까지 반응형으로 동작해야 한다. 특정 기기 크기나 고정 너비만 가정하지 않는다.
- 레이아웃 분기는 `useWindowDimensions()`와 프로젝트의 레이아웃 토큰을 우선 사용한다. 넓은 화면에서는 콘텐츠 최대 너비, 여백, 다단 배치를 고려하고 단순히 모바일 UI를 가로로 늘리지 않는다.
- 터치뿐 아니라 마우스, 트랙패드, 키보드 입력도 고려한다. 클릭/탭 영역, hover·focus 상태, 키보드 탐색을 지원하며 hover에만 의존하는 기능을 만들지 않는다.
- 공통 컴포넌트와 비즈니스 로직을 기본으로 공유하고, 플랫폼 차이가 실제로 필요한 경우에만 `Platform.OS` 또는 `.web`/`.native` 파일을 사용한다.
- 네이티브에서는 safe area, 소프트 키보드, 상태바, Android 뒤로가기를 고려하고, 웹에서는 URL/새로고침, 브라우저 뒤로가기, 스크롤 동작을 고려한다.
- 프론트엔드 변경은 범위에 맞게 모바일 크기와 데스크톱 웹 크기를 확인하고, 플랫폼 전용 기능을 수정했다면 iOS/Android 차이도 함께 확인한다.

## UI 규약

- UI 개선 작업에는 설치된 design skills(`impeccable`, `high-end-visual-design`)의 미감과 품질 기준을 적용한다.
- 단, 구현은 항상 Expo React Native 기준으로 번역한다.
- 웹/Tailwind/CSS 전용 지시(`div`, CSS class, pseudo-element, DOM, hover-only interaction, `backdrop-blur` 등)를 그대로 사용하지 않는다.
- React Native의 `View`, `Text`, `Pressable`, `StyleSheet`, `Animated`/`Reanimated`, `expo-linear-gradient` 등 프로젝트에서 사용 중인 패턴으로 구현한다.
- mobile-first로 설계하되 mobile-only로 만들지 않는다: 터치 타깃, safe area, 작은 화면, iOS/Android 차이, 데스크톱 웹, 접근성, 다국어 길이 변화를 함께 고려한다.
- **테마(다크모드)**: 색은 정적 import가 아니라 **`useTheme()`**(`src/theme-context.tsx`)에서 가져온다.
  - 패턴: `const { colors } = useTheme();` + `const styles = useMemo(() => makeStyles(colors), [colors]);`
    파일 하단에 `const makeStyles = (colors: ThemeColors) => StyleSheet.create({...})`.
  - `src/theme.ts`에는 정적 `colors` export가 **없다** (팔레트 함수 `makeColors`·`makePuffy`·`layout`·`typography`만).
  - 라이트/다크: **앱 크롬은 순수 흑백 고정**(`colors.accent` = ink, `colors.onAccent` = inverse). 사용자 색 취향은 없다.
  - **색은 분류의 것**: 크롬(primary 버튼·전송·활성 탭·활성 선택 pill)은 전부 ink. 원색은 분류에서만 —
    분류 아바타 배경(`components/CategoryAvatar`)과 그 분류 말풍선. 본문·구분선 등 중립 요소엔 색 금지.
  - **말풍선 색**: `makePuffy(scheme, 분류색)`으로 파생(`MessageBubble`의 `bubbleColor` prop). 색 없으면 회색 파스텔.
  - 취향 저장: AsyncStorage `slash.themeMode`(light|dark|system).
- 텍스트 대비: 라이트·다크 모두 WCAG 4.5:1 이상 유지 (라이트: secondary 7.0 / tertiary 4.7, 다크: 9.3 / 5.8).
  회색을 옅게 바꾸거나 새 회색을 추가할 때 두 모드 대비를 먼저 확인할 것.
- 웹 포커스 링: 루트 `_layout.tsx`가 `:focus-visible` 스타일(currentColor 링)을 주입한다. `outline: none`으로 없애지 말 것.
- 접근성: 인터랙티브 요소에 `accessibilityRole`(+필요시 `accessibilityState`·`accessibilityLabel`) 필수.
  아이콘 전용 버튼은 반드시 `t('a11y.*')` 라벨을 단다. 터치 타깃 44pt 미만이면 hitSlop 보강.
- **시각 언어는 루트 `DESIGN.md`(네오 브루탈리즘 × 웹코어)를 따른다**: 라운드 0, 2px ink 보더,
  하드 오프셋 섀도. 보더+섀도+눌림 재질은 `src/components/Brutal.tsx`의 `BrutalFrame`으로만 구현
  (직접 그리지 말 것). 광택·그라디언트·소프트 섀도 금지.
- 버튼은 공용 `src/components/Button.tsx` 사용(variant: `primary`·`outline`·`ghost`).
  화면마다 버튼 스타일을 인라인 `StyleSheet`로 복붙하지 말 것.
- **alert 금지**: `Alert.alert`·`window.alert`·`window.confirm`을 쓰지 않는다(웹에서 안 뜨고 못생김). 대신:
  - `notify(title, message)` — 알림(버튼 1개)
  - `confirmDialog({ title, message, confirmLabel, cancelLabel, destructive })` → `Promise<boolean>` — 확인/취소
  - `src/notify.ts`가 제공하고, 루트에 마운트된 `<NotifyHost/>`가 `components/Dialog.tsx`로 렌더한다.
- **900px 트리 스왑 생존**: 반응형 브레이크포인트(`layout.desktopBreakpoint`, 900) 교차 시 데스크톱 3패널과 모바일 탭은 서로 다른 트리라 화면이 통째로 리마운트된다. 사용자 입력·진행 상태(검색어·입력 draft·오버레이 열림 등)는 이 교차에서 반드시 살아남아야 하므로, 휘발성 UI 상태는 화면 로컬 `useState`가 아니라 루트 프로바이더에 둔다(`NameEditProvider`·`SelectedRoomProvider`의 draft 패턴 참조). 방별로 구분돼야 하는 상태는 roomKey로 태깅해 자기 방일 때만 복원한다.

## 목록·모달 상호작용 문법

같은 폼/행 문법은 그것이 뜨는 **모든 진입점**(탭 화면·픽커 모달·데스크톱 패널)에 동일 적용한다.
한쪽만 고치면 반드시 지적받는다 — 수정 전에 진입점을 전부 나열하고 같은 렌더 한 벌로 처리할 것.

- **행 탭**: 탭 화면 = 방 진입, 픽커 선택 모드 = 선택 토글.
- **행 스와이프**: 액션 버튼 노출. 분류·태그는 `[★ 즐겨찾기][삭제][수정]` 순서(본탭·픽커 동일),
  자동구분은 ★ 즐겨찾기, 메모(채팅) 목록은 고정(pin) 계열.
- **행 더블탭(웹 더블클릭)**: 상세 수정 모달 — 스와이프 `[수정]`과 같은 세션. 단일 탭 동작은 지연 없이 유지.
- **드래그**: 순서 변경(`use-reorder.tsx`의 `useReorder`/`useVarReorder`). 즐겨찾기 섹션은 전용 순서.
- **수정/추가 모달**: `category-edit.tsx`·`tag-create.tsx`의 루트 상주 Provider/Host 세션
  (`open()`=추가, `open(항목)`=수정). 새 모달도 이 문법으로.
- **추가 폼(픽커 공용)**: 이름 → 설명 → (태그만) 키워드 스테퍼 → **전체폭 ink primary 추가 버튼** 세로 스택.
  manage/선택 모드가 `PickerModal` 안 같은 렌더 한 벌을 공유한다 — 모드별 분기 금지.
- **키워드 스테퍼**(`components/KeywordStepper.tsx`): 행 `[입력][−]`, 마지막 행만 `[입력][+]`,
  바닥 상태는 빈 입력 1행. 태그 생성·수정 공용.
- **설명 문구**: 탭 타이틀 아래 상시 서브타이틀(`TabHeader`의 `subtitle`). 모달 안 힌트는
  ⓘ + `components/InfoPopover.tsx`(floating-ui, 루트 오버레이 포털) — 팝오버를 새로 직접 그리지 말 것.
- **영속**: 순서(position·autoOrder)·즐겨찾기·섹션 접기(`users.collapsedSections`,
  `src/collapsed-sections.ts`의 `useCollapsedSections`)는 전부 서버 저장. 낙관 반영 후
  **실패 시 이전 값으로 revert** — `.catch(() => {})`로 조용히 삼키지 말 것.
- **명칭**: 사용자 문구에서 항목은 "메시지"가 아니라 **"메모"**(en `note`, ja `メモ`).
- 주석 처리로 비활성해 둔 것(삭제 아님, 요청 시 복구): 태그 색 선택 UI, 픽커의 "전체" 행.

## 다국어 (i18n)

- 모든 사용자 문구는 `useTranslation()`의 `t('ns.key')`. 하드코딩 금지.
- 로케일: `src/i18n/locales/{ko,en,ja}.ts`, **ko가 원본**. 새 문구는 ko에 먼저 넣고 나머지에 반영.
- 백엔드 에러는 `errorText(err)`가 `errors.<code>`로 번역. 코드 추가 시 3개 로케일의 `errors`에 추가.
- 기기 언어 자동 감지 + 더보기 화면 수동 스위처(선택은 AsyncStorage `slash.lang`에 저장).
