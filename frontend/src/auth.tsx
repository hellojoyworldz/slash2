import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, User } from './api';

const TOKEN_KEY = 'slash.token';
const EMAIL_KEY = 'slash.email';

interface AuthState {
  booting: boolean;
  token: string | null;
  email: string;
  // 화면에 보이는 이름 (없으면 이메일 앞부분으로 폴백해서 표시)
  displayName: string | null;
  // 이메일 인증 여부. 소셜 로그인은 보통 true, 이메일 가입 직후엔 false.
  emailVerified: boolean;
  loggedIn: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  // 서버에서 최신 인증 상태를 다시 불러온다 (인증 완료 후 새로고침용).
  refresh: () => Promise<boolean>;
  // 이름 변경 후 컨텍스트 갱신용.
  setDisplayName: (name: string | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  // 앱 시작 시 저장된 토큰으로 자동 로그인
  useEffect(() => {
    (async () => {
      try {
        const savedToken = await AsyncStorage.getItem(TOKEN_KEY);
        const savedEmail = await AsyncStorage.getItem(EMAIL_KEY);
        if (savedToken) {
          const user = await api.me(savedToken);
          setToken(savedToken);
          setEmail(user.email);
          setDisplayName(user.displayName ?? null);
          setEmailVerified(!!user.emailVerified);
        } else if (savedEmail) {
          setEmail(savedEmail);
        }
      } catch {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loggedIn = async (newToken: string, user: User) => {
    setToken(newToken);
    setEmail(user.email);
    setDisplayName(user.displayName ?? null);
    setEmailVerified(!!user.emailVerified);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, newToken],
      [EMAIL_KEY, user.email],
    ]);
  };

  const logout = async () => {
    setToken(null);
    setDisplayName(null);
    setEmailVerified(false);
    await AsyncStorage.removeItem(TOKEN_KEY);
  };

  const refresh = async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const user = await api.me(token);
      setDisplayName(user.displayName ?? null);
      setEmailVerified(!!user.emailVerified);
      return !!user.emailVerified;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        booting,
        token,
        email,
        displayName,
        emailVerified,
        loggedIn,
        logout,
        refresh,
        setDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다');
  return value;
}
