// 웹에서는 WebView 대신 진짜 <iframe>을 쓴다. react-native-web의 View로는
// iframe 속성(allow·allowFullScreen)을 실을 수 없어, RemoteImage.web.tsx와 같은 기법으로
// unstable_createElement가 RN 스타일이 그대로 먹는 DOM 노드를 만들게 한다.
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { unstable_createElement } from 'react-native-web';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';
import type { EmbedFrameProps } from './EmbedFrame';

export function EmbedFrame({
  uri,
  accessibilityLabel,
  onContentHeight,
  scrollGuard,
}: EmbedFrameProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 스크롤 가드(마우스 환경 전용) — 커서가 임베드 위에 있으면 휠이 iframe 안으로 들어가
  // 뒤집힌 리스트의 방향 보정(JS 휠 핸들러)을 건너뛰고 브라우저가 날것으로 스크롤해
  // 방향이 반대로 간다. 기본은 iframe이 포인터를 무시(pointerEvents none)해서 휠이
  // 부모로 통과 = 채팅 스크롤 정상. 임베드를 만지려면 카드 클릭 한 번으로 활성화,
  // 커서가 벗어나면 다시 비활성. 터치 기기는 hover가 없어 가드를 끈다.
  const guard = useMemo(
    () =>
      !!scrollGuard &&
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(hover: hover)').matches,
    [scrollGuard],
  );
  const [interactive, setInteractive] = useState(!guard);
  // 활성 상태에서 혹시 임베드 안으로 들어간 휠이 밖으로 체이닝돼 역방향으로 튀지 않게,
  // iframe을 감싼 스크롤 컨테이너에서 체이닝을 끊는다(overscroll-behavior는 RNW 스타일
  // 화이트리스트 밖이라 DOM에 직접 지정).
  const guardRef = (node: HTMLDivElement | null) => {
    if (node && guard) {
      node.style.overflowY = 'auto';
      node.style.overscrollBehavior = 'none';
    }
  };

  // 인스타 공식 임베드는 자기 실제 높이를 부모 창에 postMessage(type: MEASURE)로 알려준다.
  // 그 값을 부모(LinkCard)에 넘겨 프레임을 콘텐츠에 딱 맞춘다 — 내부 스크롤 제거.
  useEffect(() => {
    if (!onContentHeight) return undefined;
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/(www\.)?instagram\.com$/.test(e.origin)) return;
      if (iframeRef.current && e.source !== iframeRef.current.contentWindow) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        const h = data?.type === 'MEASURE' ? Number(data.details?.height) : NaN;
        if (Number.isFinite(h) && h > 0) onContentHeight(h);
      } catch {
        // 임베드가 보내는 다른 포맷의 메시지는 조용히 무시.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onContentHeight]);

  return (
    <View style={styles.frame}>
      {unstable_createElement('div', {
        ref: guardRef,
        style: { width: '100%', height: '100%' },
        onClick: guard && !interactive ? () => setInteractive(true) : undefined,
        onMouseLeave: guard && interactive ? () => setInteractive(false) : undefined,
        children: unstable_createElement('iframe', {
          ref: iframeRef,
          src: uri,
          title: accessibilityLabel,
          // 유튜브 자동재생·DRM 재생·PIP, 트윗 임베드의 복사 버튼까지 카드 안에서 동작하게.
          allow:
            'autoplay; encrypted-media; picture-in-picture; clipboard-write; fullscreen',
          allowFullScreen: true,
          // iframe 기본 inset 보더 제거(RN 스타일 키라 RNW 컴파일러를 그대로 통과).
          style: [
            styles.web,
            { borderWidth: 0, display: 'block' },
            guard && !interactive ? { pointerEvents: 'none' } : null,
          ],
        }),
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    frame: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    web: {
      width: '100%',
      height: '100%',
    },
  });
