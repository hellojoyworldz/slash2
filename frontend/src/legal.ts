// 법적 문서 화면의 앱 내부 라우트 — 단 한 곳(여기)에서만 정의한다.
// 더보기 > 앱 정보 섹션이 이 경로로 router.push 한다.
//
// 예전엔 외부 호스팅 URL(플레이스홀더)을 Linking.openURL로 열었으나,
// 이제 앱 내부 화면(/privacy, /terms — LegalScreen)으로 대체했다.
// 문서 본문은 src/legal-content.ts, 화면은 src/screens/LegalScreen.tsx.
export const PRIVACY_ROUTE = '/privacy' as const;
export const TERMS_ROUTE = '/terms' as const;
