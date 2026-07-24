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
import { api, User } from '../api';
import { Button } from '../components/Button';
import { GoogleLogo } from '../components/GoogleLogo';
import { Logo } from '../components/Logo';
import { Text } from '../components/Text';
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
  const [focused, setFocused] = useState<'email' | 'password' | 'code' | null>(
    null,
  );

  const [googleRequest, googleResponse, promptGoogle] =
    Google.useIdTokenAuthRequest({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
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
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text variant="caption" color={colors.textTertiary}>
                {t('common.or')}
              </Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              label={t('login.continueWithGoogle')}
              variant="outline"
              leading={<GoogleLogo size={18} />}
              onPress={() => promptGoogle()}
              loading={googleLoading}
              disabled={!googleRequest || googleLoading}
              style={styles.googleBtn}
            />

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
