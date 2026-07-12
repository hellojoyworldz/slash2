import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { api, User } from '../api';
import { colors } from '../theme';

interface Props {
  onLoggedIn: (token: string, user: User) => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<'email' | 'password' | null>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      Alert.alert('알림', '이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setLoading(true);
    try {
      const result =
        mode === 'login'
          ? await api.login(email.trim(), password)
          : await api.register(email.trim(), password);
      onLoggedIn(result.token, result.user);
    } catch (error) {
      Alert.alert(
        '알림',
        error instanceof Error ? error.message : '요청에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>slash</Text>
        <Text style={styles.tagline}>나에게 보내는 링크, 여기에 정리하세요</Text>

        <TextInput
          style={[styles.input, focused === 'email' && styles.inputFocused]}
          placeholder="이메일"
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocused('email')}
          onBlur={() => setFocused(null)}
        />
        <TextInput
          style={[styles.input, focused === 'password' && styles.inputFocused]}
          placeholder={mode === 'register' ? '비밀번호 (8자 이상)' : '비밀번호'}
          placeholderTextColor={colors.textTertiary}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onFocus={() => setFocused('password')}
          onBlur={() => setFocused(null)}
          onSubmitEditing={submit}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color={colors.inverse} />
          ) : (
            <Text style={styles.buttonText}>
              {mode === 'login' ? '로그인' : '가입하기'}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
          hitSlop={{ top: 8, bottom: 8 }}
        >
          <Text style={styles.switchText}>
            {mode === 'login' ? (
              <>
                처음이신가요? <Text style={styles.switchStrong}>회원가입</Text>
              </>
            ) : (
              <>
                이미 계정이 있어요. <Text style={styles.switchStrong}>로그인</Text>
              </>
            )}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logo: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -2,
    color: colors.ink,
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 56,
  },
  input: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    paddingHorizontal: 2,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.textPrimary,
  },
  inputFocused: {
    borderBottomColor: colors.ink,
  },
  button: {
    backgroundColor: colors.ink,
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 36,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.inverse,
    fontSize: 16,
    fontWeight: '700',
  },
  switchText: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
    color: colors.textSecondary,
  },
  switchStrong: {
    color: colors.ink,
    fontWeight: '700',
  },
});
