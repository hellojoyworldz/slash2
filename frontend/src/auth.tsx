import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, User } from './api';

const TOKEN_KEY = 'slash.token';
const EMAIL_KEY = 'slash.email';

interface AuthState {
  booting: boolean;
  token: string | null;
  email: string;
  loggedIn: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');

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
    await AsyncStorage.multiSet([
      [TOKEN_KEY, newToken],
      [EMAIL_KEY, user.email],
    ]);
  };

  const logout = async () => {
    setToken(null);
    await AsyncStorage.removeItem(TOKEN_KEY);
  };

  return (
    <AuthContext.Provider value={{ booting, token, email, loggedIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다');
  return value;
}
