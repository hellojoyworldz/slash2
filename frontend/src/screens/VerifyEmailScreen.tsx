import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { Button } from '../components/Button';
import { Text } from '../components/Text';
import { notify } from '../notify';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

interface Props {
  email: string;
  // 6자리 코드로 인증. 인증되면 true.
  onVerifyCode: (code: string) => Promise<boolean>;
  onResend: () => Promise<void>;
  onLogout: () => void;
  // 링크로 인증한 뒤 서버 상태를 다시 확인. 인증됐으면 true.
  onRefresh: () => Promise<boolean>;
}

const RESEND_COOLDOWN = 60; // 초

export function VerifyEmailScreen({
  email,
  onVerifyCode,
  onResend,
  onLogout,
  onRefresh,
}: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // 재발송 쿨다운 카운트다운
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // 코드 입력 인증 (멀티플랫폼 기본 경로)
  const verify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      // 성공하면 상위 라우트가 앱으로 이동시킨다.
      const ok = await onVerifyCode(code);
      if (!ok) notify(t('common.notice'), t('verify.codeInvalid'));
    } catch {
      notify(t('common.notice'), t('verify.codeInvalid'));
    } finally {
      setVerifying(false);
    }
  };

  // 링크로 인증했을 때 서버 상태 재확인
  const check = async () => {
    setChecking(true);
    try {
      const verified = await onRefresh();
      if (!verified) {
        notify(t('verify.notYetTitle'), t('verify.notYetBody'));
      }
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      await onResend();
      setCooldown(RESEND_COOLDOWN);
      setCode('');
      notify(t('verify.resentTitle'), t('verify.resentBody'));
    } catch {
      notify(t('common.notice'), t('verify.resendFailed'));
    } finally {
      setResending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.icon}>✉️</Text>
        <Text variant="title" color={colors.ink} style={styles.title}>
          {t('verify.title')}
        </Text>
        <Text variant="bodyStrong" style={styles.email}>
          {email}
        </Text>
        <Text variant="body" color={colors.textSecondary} style={styles.desc}>
          {t('verify.description')}
        </Text>

        <TextInput
          style={styles.codeInput}
          placeholder={t('verify.codePlaceholder')}
          placeholderTextColor={colors.textTertiary}
          keyboardType="number-pad"
          maxLength={6}
          value={code}
          onChangeText={(text) => setCode(text.replace(/\D/g, ''))}
          onSubmitEditing={verify}
          textAlign="center"
        />

        <Button
          label={t('verify.verify')}
          onPress={verify}
          loading={verifying}
          disabled={code.length !== 6}
        />

        <Button
          label={
            cooldown > 0
              ? t('verify.resendCooldown', { sec: cooldown })
              : t('verify.resend')
          }
          variant="outline"
          onPress={resend}
          disabled={resending || cooldown > 0}
          style={styles.resendBtn}
        />

        {/* 링크로 인증한 경우 */}
        <TouchableOpacity
          onPress={check}
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.linkWrap}
          disabled={checking}
          accessibilityRole="button"
        >
          <Text
            variant="label"
            color={colors.textSecondary}
            style={styles.linkText}
          >
            {checking ? '…' : t('verify.linkDone')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onLogout}
          hitSlop={{ top: 8, bottom: 8 }}
          style={styles.logoutWrap}
          accessibilityRole="button"
        >
          <Text
            variant="label"
            color={colors.textTertiary}
            style={styles.underline}
          >
            {t('verify.logout')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    // 데스크톱 전폭에서도 폼이 퍼지지 않게
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  icon: {
    fontSize: 44,
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    textAlign: 'center',
  },
  email: {
    textAlign: 'center',
    marginTop: 12,
  },
  desc: {
    lineHeight: 22,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    paddingHorizontal: 12,
    height: 56,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 8,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    marginBottom: 16,
  },
  resendBtn: {
    marginTop: 12,
  },
  linkWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    textDecorationLine: 'underline',
  },
  logoutWrap: {
    marginTop: 16,
    alignItems: 'center',
  },
  underline: {
    textDecorationLine: 'underline',
  },
});
