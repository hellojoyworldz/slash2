import * as Clipboard from 'expo-clipboard';
import { Platform, Share } from 'react-native';
import type { Message } from './api';

// 복사·공유 대상 텍스트: 링크 메시지는 url, 메모는 본문(content).
export function messagePayload(m: Message): string {
  return m.kind === 'link' && m.url ? m.url : m.content;
}

// 클립보드 복사 — 웹은 navigator.clipboard 우선, 그 외(네이티브·폴백)는 expo-clipboard.
export async function copyToClipboard(text: string): Promise<void> {
  if (
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    navigator.clipboard?.writeText
  ) {
    await navigator.clipboard.writeText(text);
    return;
  }
  await Clipboard.setStringAsync(text);
}

// 공유 — 네이티브는 RN Share.share, 웹은 navigator.share, 없으면 클립보드 복사로 폴백.
// 반환: 'shared'(공유 시트가 떴다) | 'copied'(폴백으로 복사만 했다) — 호출부가 알맞은 확인 문구를 띄운다.
export async function shareContent(text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator) : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text });
      } catch {
        // 사용자가 취소했거나 실패 — 조용히 무시(폴백 복사하지 않아 이중 동작 방지).
      }
      return 'shared';
    }
    await copyToClipboard(text);
    return 'copied';
  }
  await Share.share({ message: text });
  return 'shared';
}
