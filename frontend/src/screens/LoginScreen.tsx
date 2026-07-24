import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { api, ApiError, BASE_URL, User } from '../api';
import { isElectron } from '../auth-routes';
import { AppleLogo } from '../components/AppleLogo';
import { Button } from '../components/Button';
import { GoogleLogo } from '../components/GoogleLogo';
import { KakaoLogo } from '../components/KakaoLogo';
import { Logo } from '../components/Logo';
import { NaverLogo } from '../components/NaverLogo';
import { Text } from '../components/Text';
import { getDesktopBridge } from '../desktop-bridge';
import { errorText } from '../i18n/errors';
import { notify } from '../notify';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

// 브라우저에서 인증을 마치고 앱으로 돌아왔을 때 세션을 닫아준다 (웹 필수)
WebBrowser.maybeCompleteAuthSession();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Props {
  onLoggedIn: (token: string, user: User) => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // 구조 분기는 기기/OS 판정이 아니라 사이즈 클래스(폭/높이)로만 한다.
  // 넓고 충분히 높은 창에서만 세로 중앙 정렬 — 그 외(모바일·낮은 창)는 상단 앵커.
  // 상단 앵커면 소프트 키보드가 올라와도 입력칸이 애초에 키보드 위 영역에 있어 점프/가림이 없다.
  const { width, height } = useWindowDimensions();
  const centered = width >= 900 && height >= 640;
  // reset = 비번 재설정 모드 (메일로 받은 코드 + 새 비번을 앱 안에서 입력)
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  // 카카오·네이버(코드 플로우)는 한 번에 하나만 진행되므로 provider 하나로 로딩을 공유한다.
  const [codeFlowLoading, setCodeFlowLoading] = useState<
    'kakao' | 'naver' | null
  >(null);
  const [focused, setFocused] = useState<'email' | 'password' | 'code' | null>(
    null,
  );

  // Electron 데스크톱 셸이면 웹 구글 플로우(팝업/리다이렉트) 대신 메인 프로세스의
  // 데스크톱형 OAuth(시스템 브라우저 + 루프백 + PKCE)를 쓴다. 브리지가 있을 때만.
  const desktopBridge = useMemo(() => getDesktopBridge(), []);
  const [desktopGoogleReady, setDesktopGoogleReady] = useState(false);
  useEffect(() => {
    if (!desktopBridge) return;
    let alive = true;
    desktopBridge
      .isGoogleConfigured()
      .then((ok) => alive && setDesktopGoogleReady(ok))
      .catch(() => alive && setDesktopGoogleReady(false));
    return () => {
      alive = false;
    };
  }, [desktopBridge]);

  // 구글 버튼 노출 조건:
  // - 데스크톱 셸: 브리지가 있고 메인이 크리덴셜을 로드할 수 있을 때만.
  // - 데스크톱인데 브리지가 없으면(구버전 셸) 숨김 — 웹 구글 플로우는 Electron에서 안 맞다.
  // - 웹: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID가 있을 때만(비면 훅이 크래시해 흰 화면 나므로 숨김).
  // - 네이티브: 항상 노출.
  const googleConfigured = desktopBridge
    ? desktopGoogleReady
    : isElectron
      ? false
      : Platform.OS !== 'web' || !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  // 웹에서 webClientId가 비면 useIdTokenAuthRequest가 마운트 즉시 throw해
  // 화면 전체가 죽는다(흰 화면). 더미 값으로 훅 크래시를 막고 버튼은 위 조건으로 숨긴다.
  const [googleRequest, googleResponse, promptGoogle] =
    Google.useIdTokenAuthRequest({
      webClientId:
        process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
        'missing.apps.googleusercontent.com',
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    });

  useEffect(() => {
    if (!googleResponse) return;
    if (googleResponse.type === 'error') {
      notify(t('common.notice'), t('login.googleFailed'));
      return;
    }
    if (googleResponse.type !== 'success') return; // cancel, dismiss 등

    const idToken = googleResponse.params.id_token;
    if (!idToken) {
      notify(t('common.notice'), t('login.googleNoToken'));
      return;
    }
    setGoogleLoading(true);
    api
      .socialLogin('google', idToken)
      .then((result) => onLoggedIn(result.token, result.user))
      .catch((error) => {
        notify(t('common.notice'), errorText(error));
      })
      .finally(() => setGoogleLoading(false));
  }, [googleResponse]);

  // 구글 버튼 탭: 데스크톱 셸이면 브리지 플로우, 그 외는 기존 웹/네이티브 promptGoogle.
  const onGooglePress = () => {
    if (desktopBridge) {
      setGoogleLoading(true);
      desktopBridge
        .googleLogin()
        .then((idToken) => api.socialLogin('google', idToken))
        .then((result) => onLoggedIn(result.token, result.user))
        .catch((error) => {
          // 사용자가 브라우저에서 취소한 경우는 조용히 무시.
          if (error instanceof Error && error.message === 'cancelled') return;
          notify(
            t('common.notice'),
            error instanceof ApiError ? errorText(error) : t('login.googleFailed'),
          );
        })
        .finally(() => setGoogleLoading(false));
      return;
    }
    void promptGoogle();
  };

  // 애플 버튼 노출 조건: iOS 네이티브에서만(웹 애플 로그인은 HTTPS 등록 도메인이
  // 필요해 배포 후 추가 예정 — 안드로이드/데스크톱 웹/Electron은 항상 숨김).
  // 시뮬레이터·미지원 기기 대비로 isAvailableAsync도 함께 확인한다.
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let alive = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => alive && setAppleAvailable(ok))
      .catch(() => alive && setAppleAvailable(false));
    return () => {
      alive = false;
    };
  }, []);

  const onApplePress = async () => {
    setAppleLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const idToken = credential.identityToken;
      if (!idToken) {
        notify(t('common.notice'), t('login.appleNoToken'));
        return;
      }
      // 애플은 실명을 최초 1회만 준다(이후 로그인엔 null) — 있을 때만 전달.
      const name = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const result = await api.socialLogin('apple', idToken, name || undefined);
      onLoggedIn(result.token, result.user);
    } catch (error) {
      // 사용자가 취소한 경우는 조용히 무시.
      if (error instanceof Error && (error as { code?: string }).code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      notify(
        t('common.notice'),
        error instanceof ApiError ? errorText(error) : t('login.appleFailed'),
      );
    } finally {
      setAppleLoading(false);
    }
  };

  // ── 카카오·네이버 (백엔드 코드 플로우) ──
  // 둘 다 프론트가 토큰을 직접 못 받아 백엔드 콜백 플로우를 쓴다. 로직은 provider-무관이라
  // 하나의 헬퍼(startCodeFlow)로 공유하고, 노출 여부만 각자의 EXPO_PUBLIC_SOCIAL_* 플래그로 갈린다.
  type CodeFlowProviderName = 'kakao' | 'naver';
  const codeFlowFailedKey: Record<CodeFlowProviderName, string> = {
    kakao: 'login.kakaoFailed',
    naver: 'login.naverFailed',
  };
  // 버튼 노출: 각 EXPO_PUBLIC_SOCIAL_* 플래그 + 웹/네이티브(데스크톱 Electron은 딥링크 미구현이라 숨김).
  const kakaoConfigured = !isElectron && !!process.env.EXPO_PUBLIC_SOCIAL_KAKAO;
  const naverConfigured = !isElectron && !!process.env.EXPO_PUBLIC_SOCIAL_NAVER;

  // 백엔드가 발급한 앱 토큰으로 프로필을 받아 로그인 완료 처리.
  const finishSocialLogin = async (
    token: string,
    provider: CodeFlowProviderName,
  ) => {
    setCodeFlowLoading(provider);
    try {
      const user = await api.me(token);
      onLoggedIn(token, user);
    } catch {
      notify(t('common.notice'), t(codeFlowFailedKey[provider]));
    } finally {
      setCodeFlowLoading(null);
    }
  };

  // 복귀 URL(웹 프래그먼트/네이티브 쿼리)에서 결과를 읽어 처리. 취소는 조용히 무시.
  const handleSocialParams = (
    params: URLSearchParams,
    provider: CodeFlowProviderName,
  ) => {
    const token = params.get('social_token');
    const err = params.get('social_error');
    if (token) {
      void finishSocialLogin(token, provider);
    } else if (err && err !== 'social_cancelled') {
      notify(t('common.notice'), t(codeFlowFailedKey[provider]));
    }
  };

  // 웹: provider에서 프래그먼트(#social_token/#social_error)로 되돌아온 걸 마운트 시 처리.
  // 토큰이 히스토리에 남지 않도록 즉시 해시를 제거한다.
  // 풀 페이지 이동으로 복귀하므로(JS 상태가 소실) 어떤 provider였는지는 세션스토리지로 복원.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const hash = window.location.hash ?? '';
    if (!hash.includes('social_token') && !hash.includes('social_error')) return;
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
    const provider =
      (window.sessionStorage.getItem(
        'slash.socialCodeFlowProvider',
      ) as CodeFlowProviderName | null) ?? 'kakao';
    window.sessionStorage.removeItem('slash.socialCodeFlowProvider');
    handleSocialParams(params, provider);
  }, []);

  // 카카오/네이버 버튼 공용 탭 핸들러.
  const startCodeFlow = (provider: CodeFlowProviderName) => {
    if (Platform.OS === 'web') {
      // 현재 로그인 페이지로 복귀(기존 해시는 떼고). 백엔드가 여기 origin을 화이트리스트 검증한다.
      const returnUrl = window.location.href.split('#')[0];
      window.sessionStorage.setItem('slash.socialCodeFlowProvider', provider);
      window.location.href = `${BASE_URL}/auth/social/${provider}/start?platform=web&return=${encodeURIComponent(
        returnUrl,
      )}`;
      return;
    }
    // 네이티브: 시스템 인증 세션 → slash://auth?social_token|social_error 로 복귀.
    setCodeFlowLoading(provider);
    WebBrowser.openAuthSessionAsync(
      `${BASE_URL}/auth/social/${provider}/start?platform=native`,
      'slash://auth',
    )
      .then((result) => {
        if (result.type !== 'success') return; // cancel, dismiss 등은 조용히 무시
        const query = result.url.split('?')[1] ?? '';
        handleSocialParams(new URLSearchParams(query), provider);
      })
      .catch(() => notify(t('common.notice'), t(codeFlowFailedKey[provider])))
      .finally(() => setCodeFlowLoading(null));
  };

  const submit = async () => {
    const trimmed = email.trim();
    if (!trimmed || !password) {
      notify(t('common.notice'), t('login.enterEmailPassword'));
      return;
    }
    // 백엔드 검증 메시지에 의존하지 않도록 형식 검증은 프론트에서 (언어 맞춤).
    if (!EMAIL_RE.test(trimmed)) {
      notify(t('common.notice'), t('login.emailInvalid'));
      return;
    }
    if (mode === 'register' && password.length < 8) {
      notify(t('common.notice'), t('login.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      // 가입/로그인 후 인증 여부에 따라 상위 라우트가 인증 안내(/verify)나
      // 앱(/friends)으로 자동 이동시킨다.
      const result =
        mode === 'login'
          ? await api.login(trimmed, password)
          : await api.register(trimmed, password);
      onLoggedIn(result.token, result.user);
    } catch (error) {
      notify(t('common.notice'), errorText(error));
    } finally {
      setLoading(false);
    }
  };

  // 재설정 메일(코드+링크) 요청 → 코드 입력 모드로 전환
  const forgotPassword = async () => {
    if (!email.trim()) {
      notify(t('common.notice'), t('login.enterEmailForReset'));
      return;
    }
    try {
      await api.forgotPassword(email.trim());
      setPassword('');
      setResetCode('');
      setMode('reset');
      notify(t('login.resetSentTitle'), t('login.resetSentBody'));
    } catch (error) {
      notify(t('common.notice'), errorText(error));
    }
  };

  // 코드 + 새 비번으로 재설정 (앱 안에서 완결)
  const submitReset = async () => {
    if (resetCode.length !== 6) {
      notify(t('common.notice'), t('login.resetInvalid'));
      return;
    }
    if (password.length < 8) {
      notify(t('common.notice'), t('login.passwordTooShort'));
      return;
    }
    setLoading(true);
    try {
      const { reset } = await api.resetPasswordWithCode(
        email.trim(),
        resetCode,
        password,
      );
      if (reset) {
        setMode('login');
        setPassword('');
        setResetCode('');
        notify(t('login.resetSentTitle'), t('login.resetDone'));
      } else {
        notify(t('common.notice'), t('login.resetInvalid'));
      }
    } catch (error) {
      notify(t('common.notice'), errorText(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* 폼이 길어(회원가입) 키보드에 닿거나 창이 낮으면 스크롤로 자연 접근.
          keyboardShouldPersistTaps='handled'로 키보드가 떠 있어도 버튼 탭이 씹히지 않는다. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          centered ? styles.scrollCentered : styles.scrollTop,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          {centered ? (
            // 데스크톱/큰 창: 기존 세로 스택(마스코트 → 워드마크 → 태그라인, 중앙 정렬).
            <>
              <Image
                source={require('../../assets/symbol.png')}
                style={styles.symbol}
                resizeMode="contain"
                accessibilityRole="image"
              />
              <Text variant="display" color={colors.ink} style={styles.logo}>
                slash
              </Text>
              <Text
                variant="body"
                color={colors.textSecondary}
                style={styles.tagline}
              >
                {t('login.tagline')}
              </Text>
            </>
          ) : (
            // 모바일/낮은 창: 가로 브랜드 락업 한 줄 + 작은 태그라인.
            // 데스크톱과 같은 중앙 계층을 유지하되 세로 스택(~170px)을 ~100px로 압축해
            // 이메일 input을 위로 끌어올린다.
            <>
              <View style={styles.lockup}>
                {/* 아이콘은 장식(워드마크 텍스트가 의미를 담음) — Logo가 다크모드 심볼 스왑 처리 */}
                <Logo size={44} />
                <Text variant="title" color={colors.ink} style={styles.wordmark}>
                  slash
                </Text>
              </View>
              <Text
                variant="caption"
                color={colors.textSecondary}
                style={styles.taglineCompact}
              >
                {t('login.tagline')}
              </Text>
            </>
          )}

        <TextInput
          style={[styles.input, focused === 'email' && styles.inputFocused]}
          placeholder={t('login.email')}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused(null)}
        />
        {mode === 'reset' && (
          <TextInput
            style={[styles.input, focused === 'code' && styles.inputFocused]}
            placeholder={t('login.resetCodePlaceholder')}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            maxLength={6}
            value={resetCode}
            onChangeText={(text) => setResetCode(text.replace(/\D/g, ''))}
            onFocus={() => setFocused('code')}
            onBlur={() => setFocused(null)}
          />
        )}

        <TextInput
          style={[styles.input, focused === 'password' && styles.inputFocused]}
          placeholder={
            mode === 'register'
              ? t('login.passwordHint')
              : mode === 'reset'
                ? t('login.newPasswordPlaceholder')
                : t('login.password')
          }
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocused('password')}
          onBlur={() => setFocused(null)}
          onSubmitEditing={mode === 'reset' ? submitReset : submit}
        />

        <Button
          label={
            mode === 'login'
              ? t('login.login')
              : mode === 'register'
                ? t('login.signup')
                : t('login.resetSubmit')
          }
          onPress={mode === 'reset' ? submitReset : submit}
          loading={loading}
          style={styles.primaryBtn}
        />

        {mode !== 'reset' && (
          <>
            {(googleConfigured ||
              (Platform.OS === 'ios' && appleAvailable) ||
              kakaoConfigured ||
              naverConfigured) && (
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text variant="caption" color={colors.textTertiary}>
                  {t('common.or')}
                </Text>
                <View style={styles.dividerLine} />
              </View>
            )}

            {googleConfigured && (
              <Button
                label={t('login.continueWithGoogle')}
                variant="outline"
                leading={<GoogleLogo size={18} />}
                onPress={onGooglePress}
                loading={googleLoading}
                disabled={googleLoading || (!desktopBridge && !googleRequest)}
                style={styles.googleBtn}
              />
            )}

            {Platform.OS === 'ios' && appleAvailable && (
              <Button
                label={t('login.continueWithApple')}
                variant="outline"
                leading={<AppleLogo size={18} color={colors.ink} />}
                onPress={onApplePress}
                loading={appleLoading}
                disabled={appleLoading}
                style={styles.googleBtn}
              />
            )}

            {kakaoConfigured && (
              <Button
                label={t('login.continueWithKakao')}
                variant="outline"
                leading={<KakaoLogo size={18} color={colors.ink} />}
                onPress={() => startCodeFlow('kakao')}
                loading={codeFlowLoading === 'kakao'}
                disabled={codeFlowLoading === 'kakao'}
                style={styles.googleBtn}
              />
            )}

            {naverConfigured && (
              <Button
                label={t('login.continueWithNaver')}
                variant="outline"
                leading={<NaverLogo size={18} color={colors.ink} />}
                onPress={() => startCodeFlow('naver')}
                loading={codeFlowLoading === 'naver'}
                disabled={codeFlowLoading === 'naver'}
                style={styles.googleBtn}
              />
            )}

            <TouchableOpacity
              onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
              hitSlop={{ top: 8, bottom: 8 }}
              accessibilityRole="button"
            >
              <Text
                variant="body"
                color={colors.textSecondary}
                style={styles.switchText}
              >
                {mode === 'login' ? (
                  <>
                    {t('login.firstTimePrefix')}
                    <Text
                      variant="bodyStrong"
                      color={colors.ink}
                      style={styles.underline}
                    >
                      {t('login.signupLink')}
                    </Text>
                  </>
                ) : (
                  <>
                    {t('login.haveAccountPrefix')}
                    <Text
                      variant="bodyStrong"
                      color={colors.ink}
                      style={styles.underline}
                    >
                      {t('login.loginLink')}
                    </Text>
                  </>
                )}
              </Text>
            </TouchableOpacity>
          </>
        )}

        {mode === 'login' && (
          <TouchableOpacity
            onPress={forgotPassword}
            hitSlop={{ top: 8, bottom: 8 }}
            style={styles.forgotWrap}
            accessibilityRole="button"
          >
            <Text
              variant="body"
              color={colors.textSecondary}
              style={styles.underline}
            >
              {t('login.forgotPassword')}
            </Text>
          </TouchableOpacity>
        )}

        {mode === 'reset' && (
          <TouchableOpacity
            onPress={() => {
              setMode('login');
              setPassword('');
              setResetCode('');
            }}
            hitSlop={{ top: 8, bottom: 8 }}
            style={styles.forgotWrap}
            accessibilityRole="button"
          >
            <Text
              variant="body"
              color={colors.textSecondary}
              style={styles.underline}
            >
              {t('login.backToLogin')}
            </Text>
          </TouchableOpacity>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  // flexGrow:1 이라 내용이 짧으면 정렬 규칙(중앙/상단)을 따르고,
  // 길면(회원가입·낮은 창) 그대로 스크롤된다 — 폼이 잘리지 않는다.
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  scrollCentered: {
    justifyContent: 'center',
  },
  scrollTop: {
    justifyContent: 'flex-start',
    // 상단 안전영역(상태바·노치) + 여백. 이메일 입력칸이 뷰포트 상단부에 오도록.
    paddingTop: 48,
  },
  inner: {
    paddingHorizontal: 28,
    // 데스크톱 전폭에서도 폼이 퍼지지 않게
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  symbol: {
    width: 72,
    height: 72,
    alignSelf: 'center',
    marginBottom: 16,
  },
  logo: {
    textAlign: 'center',
  },
  tagline: {
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 56,
  },
  // 모바일/낮은 창: 가로 브랜드 락업(아이콘 + 워드마크 한 줄, 중앙 정렬 — 데스크톱과 같은 계층).
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'center',
  },
  wordmark: {
    // title 변형 기반 + 30px — 44px 아이콘과 시각적으로 균형.
    fontSize: 30,
    includeFontPadding: false,
  },
  taglineCompact: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    paddingHorizontal: 12,
    paddingVertical: 16,
    // 웹 모바일 자동 줌 방지: iOS Safari는 16px 미만 input에서 포커스 시 줌인해 점프가 커진다.
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginTop: 12,
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  primaryBtn: {
    marginTop: 36,
  },
  forgotWrap: {
    alignSelf: 'center',
    marginTop: 18,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 28,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.hairline,
  },
  googleBtn: {
    marginTop: 28,
  },
  switchText: {
    textAlign: 'center',
    marginTop: 24,
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
