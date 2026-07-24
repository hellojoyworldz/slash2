import { useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useAppStyle } from '../../app-style';
import { useAuth } from '../../auth';
import { unauthHref } from '../../auth-routes';
import { MoreScreen } from '../../screens/MoreScreen';
import { useTheme } from '../../theme-context';

// /more — 두 스타일이 같은 URL을 공유한다.
//  · 채팅형: 하단 탭바가 있으므로 헤더에 뒤로가기 없음.
//  · 목록형: 탭바가 없으므로 헤더 왼쪽에 뒤로가기(보드로 복귀) 슬롯을 준다.
export default function MoreRoute() {
  const { email, displayName, providers, logout } = useAuth();
  const { appStyle } = useAppStyle();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();

  const leading =
    appStyle === 'list' ? (
      <TouchableOpacity
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace('/friends');
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.back')}
      >
        <ChevronLeft size={26} strokeWidth={2} color={colors.ink} />
      </TouchableOpacity>
    ) : undefined;

  return (
    <MoreScreen
      email={email}
      displayName={displayName}
      providers={providers}
      leading={leading}
      onLogout={async () => {
        await logout();
        router.replace(unauthHref());
      }}
    />
  );
}
