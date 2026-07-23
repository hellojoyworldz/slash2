import { LegalScreen } from '../screens/LegalScreen';

// /privacy — 개인정보처리방침. (tabs) 그룹 밖 최상위 단독 페이지라 레일·탭바 크롬 없이
// 전폭 문서 페이지로 렌더된다(모든 폼팩터 동일). 웹 배포 시 스토어 제출용 공개 URL이 된다.
// 루트 _layout.tsx의 headerless Stack이 파일 규칙으로 자동 등록한다.
export default function PrivacyRoute() {
  return <LegalScreen doc="privacy" />;
}
