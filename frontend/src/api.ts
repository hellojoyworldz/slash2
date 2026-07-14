import Constants from 'expo-constants';
import { Platform } from 'react-native';
import i18n from './i18n';

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  emailVerified?: boolean;
}

export interface Message {
  id: string;
  friendId: string | null;
  kind: 'text' | 'link';
  content: string;
  url: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  siteName: string | null;
  createdAt: string;
}

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
}

// "친구" = 링크를 분류하는 카테고리 (UI에서는 친구처럼 보여준다)
export interface Friend {
  id: string;
  name: string;
  pinned: boolean;
  createdAt: string;
}

// 채팅 탭에 보여줄 방 목록 요약
export interface RoomsSummary {
  self: Message | null;
  friends: {
    id: string;
    name: string;
    pinned: boolean;
    lastMessage: Message | null;
  }[];
}

// 개발 중에는 Expo 개발 서버를 띄운 컴퓨터의 IP를 자동으로 사용한다.
// (폰과 컴퓨터가 같은 와이파이에 있으면 그대로 동작)
// 서버를 실제 배포하면 이 값을 배포 주소로 바꾸면 된다.
function resolveBaseUrl(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:4000/api`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:4000/api';
  return 'http://localhost:4000/api';
}

export const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // 백엔드가 준 언어중립 에러 코드. 프론트가 언어별 문구로 매핑한다.
    public code?: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      // 백엔드가 메일·페이지를 이 언어로 발신하도록 현재 앱 언어를 알린다.
      'X-App-Lang': i18n.language,
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    let code: string | undefined;
    try {
      const data = await response.json();
      code = typeof data.code === 'string' ? data.code : undefined;
      message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch {
      // 응답 본문이 JSON이 아니면 기본 메시지 사용
    }
    throw new ApiError(response.status, message, code);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface LookupResult {
  status: 'new' | 'password' | 'social';
  providers?: string[];
}

export const api = {
  // 이메일만 보내 다음 단계를 확인 (identifier-first 로그인)
  lookup: (email: string) =>
    request<LookupResult>('/auth/lookup', { method: 'POST', body: { email } }),

  register: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', {
      method: 'POST',
      body: { email, password },
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    }),

  // 비밀번호 재설정 메일 요청. 가입 여부와 무관하게 항상 성공 응답.
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    }),

  // 메일로 받은 6자리 코드로 앱 안에서 비밀번호 재설정.
  resetPasswordWithCode: (email: string, code: string, password: string) =>
    request<{ reset: boolean }>('/auth/reset-password-code', {
      method: 'POST',
      body: { email, code, password },
    }),

  // SNS 로그인/회원가입. token = provider(구글 등)에서 받은 idToken
  socialLogin: (provider: 'google', token: string) =>
    request<{ token: string; user: User }>(`/auth/social/${provider}`, {
      method: 'POST',
      body: { token },
    }),

  me: (token: string) => request<User>('/auth/me', { token }),

  // 표시 이름 변경
  updateProfile: (token: string, displayName: string) =>
    request<User>('/auth/me', {
      method: 'PATCH',
      body: { displayName },
      token,
    }),

  // 6자리 코드로 이메일 인증 (로그인 상태, 멀티플랫폼)
  verifyEmailCode: (token: string, code: string) =>
    request<{ verified: boolean }>('/auth/verify-email-code', {
      method: 'POST',
      body: { code },
      token,
    }),

  // 인증 메일 다시 보내기 (로그인 상태)
  resendVerification: (token: string) =>
    request<{ ok: true }>('/auth/resend-verification', {
      method: 'POST',
      token,
    }),

  listMessages: (
    token: string,
    params: { q?: string; before?: string; friendId?: string } = {},
  ) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.before) query.set('before', params.before);
    if (params.friendId) query.set('friendId', params.friendId);
    const suffix = query.size ? `?${query.toString()}` : '';
    return request<MessagePage>(`/messages${suffix}`, { token });
  },

  createMessage: (token: string, content: string, friendId?: string) =>
    request<Message>('/messages', {
      method: 'POST',
      body: friendId ? { content, friendId } : { content },
      token,
    }),

  listRooms: (token: string) => request<RoomsSummary>('/messages/rooms', { token }),

  deleteMessage: (token: string, id: string) =>
    request<void>(`/messages/${id}`, { method: 'DELETE', token }),

  // 메시지를 친구(카테고리)로 분류하거나 해제(null)한다.
  updateMessageFriend: (token: string, id: string, friendId: string | null) =>
    request<Message>(`/messages/${id}`, {
      method: 'PATCH',
      body: { friendId },
      token,
    }),

  listFriends: (token: string) => request<Friend[]>('/friends', { token }),

  createFriend: (token: string, name: string) =>
    request<Friend>('/friends', { method: 'POST', body: { name }, token }),

  deleteFriend: (token: string, id: string) =>
    request<void>(`/friends/${id}`, { method: 'DELETE', token }),

  // 채팅 목록 상단 고정 토글
  updateFriendPinned: (token: string, id: string, pinned: boolean) =>
    request<Friend>(`/friends/${id}`, { method: 'PATCH', body: { pinned }, token }),
};
