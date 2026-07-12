import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface User {
  id: string;
  email: string;
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
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    let message = `요청 실패 (${response.status})`;
    try {
      const data = await response.json();
      message = Array.isArray(data.message) ? data.message[0] : data.message;
    } catch {
      // 응답 본문이 JSON이 아니면 기본 메시지 사용
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
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

  me: (token: string) => request<User>('/auth/me', { token }),

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
