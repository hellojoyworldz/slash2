# frontend — Expo (React Native)

루트 `AGENTS.md`(모노레포 실행·env·에러코드 계약)를 먼저 따를 것.

## Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## UI 규약

- UI 개선 작업에는 설치된 design skills(`impeccable`, `high-end-visual-design`)의 미감과 품질 기준을 적용한다.
- 단, 구현은 항상 Expo React Native 기준으로 번역한다.
- 웹/Tailwind/CSS 전용 지시(`div`, CSS class, pseudo-element, DOM, hover-only interaction, `backdrop-blur` 등)를 그대로 사용하지 않는다.
- React Native의 `View`, `Text`, `Pressable`, `StyleSheet`, `Animated`/`Reanimated`, `expo-linear-gradient` 등 프로젝트에서 사용 중인 패턴으로 구현한다.
- 모바일 앱 UX를 우선한다: 터치 타깃, safe area, 작은 화면, iOS/Android 차이, 접근성, 다국어 길이 변화를 고려한다.
- 디자인 토큰은 `src/theme.ts`(`colors`·`layout`). 색·여백은 여기서만 가져다 쓴다.
- 버튼은 공용 `src/components/Button.tsx` 사용(variant: `primary`·`outline`·`ghost`).
  화면마다 버튼 스타일을 인라인 `StyleSheet`로 복붙하지 말 것.
- **alert 금지**: `Alert.alert`·`window.alert`·`window.confirm`을 쓰지 않는다(웹에서 안 뜨고 못생김). 대신:
  - `notify(title, message)` — 알림(버튼 1개)
  - `confirmDialog({ title, message, confirmLabel, cancelLabel, destructive })` → `Promise<boolean>` — 확인/취소
  - `src/notify.ts`가 제공하고, 루트에 마운트된 `<NotifyHost/>`가 `components/Dialog.tsx`로 렌더한다.

## 다국어 (i18n)

- 모든 사용자 문구는 `useTranslation()`의 `t('ns.key')`. 하드코딩 금지.
- 로케일: `src/i18n/locales/{ko,en,ja}.ts`, **ko가 원본**. 새 문구는 ko에 먼저 넣고 나머지에 반영.
- 백엔드 에러는 `errorText(err)`가 `errors.<code>`로 번역. 코드 추가 시 3개 로케일의 `errors`에 추가.
- 기기 언어 자동 감지 + 더보기 화면 수동 스위처(선택은 AsyncStorage `slash.lang`에 저장).
