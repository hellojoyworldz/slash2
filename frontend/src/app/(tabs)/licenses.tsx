import { useEffect } from 'react';
import { Redirect } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useAppStyle } from '../../app-style';
import { useSelectedRoom } from '../../selected-room';
import { LicensesScreen } from '../../screens/LicensesScreen';
import { layout } from '../../theme';

// /licenses — 더보기 > 앱 정보 > 오픈소스 라이선스.
// 데스크톱 3패널(채팅형·≥900)에서는 방 라우트(chat.tsx)와 같은 문법으로, 오른쪽 상세 패널이
// 담당한다: 정보 문서 선택만 넘기고(setInfoScreen) 더보기(목록 패널)로 돌려보낸다.
// 모바일·목록형에서는 하단 탭바가 유지된 전폭 화면으로 렌더된다.
export default function LicensesRoute() {
  const { appStyle } = useAppStyle();
  const { width } = useWindowDimensions();
  const { setInfoScreen } = useSelectedRoom();
  // 오른쪽 상세 패널이 존재하는 건 데스크톱 3패널(채팅형)뿐 — 목록형은 넓어도 전폭 보드다.
  const desktopSplit = width >= layout.desktopBreakpoint && appStyle === 'chat';

  useEffect(() => {
    if (desktopSplit) setInfoScreen('licenses');
    // 모바일 전폭 라우트가 뜨면 우패널 선택을 비운다. 남겨두면 데스크톱→모바일 스왑 가드가
    // 뒤로가기로 떠난 /more를 다시 /licenses로 되돌려 뒤로가기가 무력화된다.
    else setInfoScreen(null);
  }, [desktopSplit, setInfoScreen]);

  // URL로 직접 들어오거나 창을 넓힌 경우: 선택만 넘기고 더보기로(오른쪽 패널이 라이선스를 띄운다).
  if (desktopSplit) return <Redirect href="/more" />;

  return <LicensesScreen />;
}
