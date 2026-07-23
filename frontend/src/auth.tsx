import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, AutoKind, HideableTab, TabKey, User } from './api';
import type { CapsuleTab, HideableCapsule } from './tab-menu';

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
  // "전체"(자기 자신) 방 프로필 색(hex). null이면 기본 검정으로 그린다.
  selfColor: string | null;
  // "전체"(자기 자신) 방 설명(상태메시지). 없으면 null.
  selfDescription: string | null;
  // "태그 전체" 방 프로필 색(hex). null이면 기본 무채 # 타일로 그린다.
  tagAllColor: string | null;
  // "태그 전체" 방 설명(상태메시지). 없으면 null.
  tagAllDescription: string | null;
  // 저장된 커스텀 프로필 색 목록(hex). 편집기 스와치 그리드에 프리셋 다음에 나열.
  customColors: string[];
  // 자동구분 표시 순서(5종 순열). null이면 기본 순서로 그린다.
  autoOrder: AutoKind[] | null;
  // 자동구분 즐겨찾기(5종 부분집합, 배열 순서=즐겨찾기 순서). null/빈=없음.
  autoFavorites: AutoKind[] | null;
  // 탭(메뉴) 표시 순서(5키 순열). null이면 기본 순서. 탭바/레일이 이 값으로 배열된다.
  tabOrder: TabKey[] | null;
  // 숨긴 탭 목록(HIDEABLE_TABS 부분집합). null/빈=전부 노출. 숨겨도 라우트는 유효.
  hiddenTabs: HideableTab[] | null;
  // 그룹 탭 캡슐 세그먼트(분류|태그|자동구분) 순서(3키 순열). null이면 기본 순서.
  // tabOrder(메뉴/레일)와 완전히 별개 — 캡슐만의 순서다.
  capsuleOrder: CapsuleTab[] | null;
  // 숨긴 캡슐 목록(HIDEABLE_CAPSULES 부분집합). null/빈=전부 노출. hiddenTabs와 완전히 별개.
  hiddenCapsules: HideableCapsule[] | null;
  // 접힌 섹션 키 목록. 항상 배열로 정규화(null→[]) — isCollapsed 조회가 단순해진다.
  // 본탭 즐겨찾기/목록 섹션·픽커 목록·목록형 보드 섹션의 접기 상태를 서버에 저장(useCollapsedSections).
  collapsedSections: string[];
  // 연결된 소셜 provider 목록 (예: ['google']). 더보기 화면 배지 등에 사용.
  providers: string[];
  loggedIn: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  // 서버에서 최신 인증 상태를 다시 불러온다 (인증 완료 후 새로고침용).
  refresh: () => Promise<boolean>;
  // 이름 변경 후 컨텍스트 갱신용.
  setDisplayName: (name: string | null) => void;
  // "전체" 프로필 색 변경 후 컨텍스트 갱신용.
  setSelfColor: (color: string | null) => void;
  // "전체" 프로필 설명 변경 후 컨텍스트 갱신용.
  setSelfDescription: (description: string | null) => void;
  // "태그 전체" 프로필 색 변경 후 컨텍스트 갱신용.
  setTagAllColor: (color: string | null) => void;
  // "태그 전체" 프로필 설명 변경 후 컨텍스트 갱신용.
  setTagAllDescription: (description: string | null) => void;
  // 커스텀 프로필 목록 추가/삭제 후 컨텍스트 갱신용.
  setCustomColors: (colors: string[]) => void;
  // 자동구분 순서 변경 후 컨텍스트 갱신용(낙관적).
  setAutoOrder: (order: AutoKind[] | null) => void;
  // 자동구분 즐겨찾기 변경 후 컨텍스트 갱신용(낙관적).
  setAutoFavorites: (favorites: AutoKind[] | null) => void;
  // 탭 순서 변경 후 컨텍스트 갱신용(낙관적).
  setTabOrder: (order: TabKey[] | null) => void;
  // 탭 노출/숨김 변경 후 컨텍스트 갱신용(낙관적).
  setHiddenTabs: (tabs: HideableTab[] | null) => void;
  // 캡슐 순서 변경 후 컨텍스트 갱신용(낙관적).
  setCapsuleOrder: (order: CapsuleTab[] | null) => void;
  // 캡슐 노출/숨김 변경 후 컨텍스트 갱신용(낙관적).
  setHiddenCapsules: (capsules: HideableCapsule[] | null) => void;
  // 섹션 접기 상태 변경 후 컨텍스트 갱신용(낙관적, useCollapsedSections가 저장·복원을 감싼다).
  setCollapsedSections: (keys: string[]) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [booting, setBooting] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);
  const [selfColor, setSelfColor] = useState<string | null>(null);
  const [selfDescription, setSelfDescription] = useState<string | null>(null);
  const [tagAllColor, setTagAllColor] = useState<string | null>(null);
  const [tagAllDescription, setTagAllDescription] = useState<string | null>(null);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [autoOrder, setAutoOrder] = useState<AutoKind[] | null>(null);
  const [autoFavorites, setAutoFavorites] = useState<AutoKind[] | null>(null);
  const [tabOrder, setTabOrder] = useState<TabKey[] | null>(null);
  const [hiddenTabs, setHiddenTabs] = useState<HideableTab[] | null>(null);
  const [capsuleOrder, setCapsuleOrder] = useState<CapsuleTab[] | null>(null);
  const [hiddenCapsules, setHiddenCapsules] = useState<HideableCapsule[] | null>(
    null,
  );
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);

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
          setSelfColor(user.selfColor ?? null);
          setSelfDescription(user.selfDescription ?? null);
          setTagAllColor(user.tagAllColor ?? null);
          setTagAllDescription(user.tagAllDescription ?? null);
          setCustomColors(user.customColors ?? []);
          setAutoOrder(user.autoOrder ?? null);
          setAutoFavorites(user.autoFavorites ?? null);
          setTabOrder(user.tabOrder ?? null);
          setHiddenTabs(user.hiddenTabs ?? null);
          setCapsuleOrder(user.capsuleOrder ?? null);
          setHiddenCapsules(user.hiddenCapsules ?? null);
          setCollapsedSections(user.collapsedSections ?? []);
          setProviders(user.providers ?? []);
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
    setSelfColor(user.selfColor ?? null);
    setSelfDescription(user.selfDescription ?? null);
    setTagAllColor(user.tagAllColor ?? null);
    setTagAllDescription(user.tagAllDescription ?? null);
    setCustomColors(user.customColors ?? []);
    setAutoOrder(user.autoOrder ?? null);
    setAutoFavorites(user.autoFavorites ?? null);
    setTabOrder(user.tabOrder ?? null);
    setHiddenTabs(user.hiddenTabs ?? null);
    setCapsuleOrder(user.capsuleOrder ?? null);
    setHiddenCapsules(user.hiddenCapsules ?? null);
    setCollapsedSections(user.collapsedSections ?? []);
    setProviders(user.providers ?? []);
    await AsyncStorage.multiSet([
      [TOKEN_KEY, newToken],
      [EMAIL_KEY, user.email],
    ]);
  };

  const logout = async () => {
    setToken(null);
    setDisplayName(null);
    setEmailVerified(false);
    setSelfColor(null);
    setSelfDescription(null);
    setTagAllColor(null);
    setTagAllDescription(null);
    setCustomColors([]);
    setAutoOrder(null);
    setAutoFavorites(null);
    setTabOrder(null);
    setHiddenTabs(null);
    setCapsuleOrder(null);
    setHiddenCapsules(null);
    setCollapsedSections([]);
    setProviders([]);
    await AsyncStorage.removeItem(TOKEN_KEY);
  };

  const refresh = async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const user = await api.me(token);
      setDisplayName(user.displayName ?? null);
      setEmailVerified(!!user.emailVerified);
      setSelfColor(user.selfColor ?? null);
      setSelfDescription(user.selfDescription ?? null);
      setTagAllColor(user.tagAllColor ?? null);
      setTagAllDescription(user.tagAllDescription ?? null);
      setCustomColors(user.customColors ?? []);
      setAutoOrder(user.autoOrder ?? null);
      setAutoFavorites(user.autoFavorites ?? null);
      setTabOrder(user.tabOrder ?? null);
      setHiddenTabs(user.hiddenTabs ?? null);
      setCapsuleOrder(user.capsuleOrder ?? null);
      setHiddenCapsules(user.hiddenCapsules ?? null);
      setCollapsedSections(user.collapsedSections ?? []);
      setProviders(user.providers ?? []);
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
        selfColor,
        selfDescription,
        tagAllColor,
        tagAllDescription,
        customColors,
        autoOrder,
        autoFavorites,
        tabOrder,
        hiddenTabs,
        capsuleOrder,
        hiddenCapsules,
        collapsedSections,
        providers,
        loggedIn,
        logout,
        refresh,
        setDisplayName,
        setSelfColor,
        setSelfDescription,
        setTagAllColor,
        setTagAllDescription,
        setCustomColors,
        setAutoOrder,
        setAutoFavorites,
        setTabOrder,
        setHiddenTabs,
        setCapsuleOrder,
        setHiddenCapsules,
        setCollapsedSections,
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
