import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme-context';

export interface EmbedFrameProps {
  /** 임베드 주소(`src/link-embed.ts`의 embedUrl). */
  uri: string;
  /** 스크린리더/`<iframe title>`에 쓸 이름. */
  accessibilityLabel?: string;
  /** 임베드 콘텐츠의 실제 높이(px)를 알려준다 — 부모가 프레임을 콘텐츠에 딱 맞춰
      내부 스크롤 없이 전부 보이게 할 때 쓴다(인스타). 없으면 측정하지 않는다. */
  onContentHeight?: (height: number) => void;
  /** (웹 전용) 항상 떠 있는 임베드의 스크롤 가드. 켜면 기본 상태에서 휠이 임베드를
      통과해 채팅 스크롤로 정상 처리되고(뒤집힌 리스트의 방향 보정을 탄다), 임베드
      상호작용은 카드 클릭 한 번으로 활성화된다. 네이티브에선 무시. */
  scrollGuard?: boolean;
}

// 네이티브 WebView는 임베드 페이지를 최상위 문서로 열므로(iframe이 아님) 문서 높이를
// 직접 재서 RN 쪽으로 쏜다. ResizeObserver + 폴백 인터벌(이미지 지연 로드 대응).
const MEASURE_JS = `(function () {
  var last = 0;
  function post() {
    var d = document.documentElement, b = document.body;
    var h = Math.max(d ? d.scrollHeight : 0, b ? b.scrollHeight : 0);
    if (h && Math.abs(h - last) > 4) { last = h; window.ReactNativeWebView.postMessage('H' + h); }
  }
  if (typeof ResizeObserver === 'function' && document.documentElement) {
    new ResizeObserver(post).observe(document.documentElement);
  }
  setInterval(post, 800);
  post();
})(); true;`;

// 카드 안 임베드 뷰포트(네이티브). 웹은 같은 props의 `EmbedFrame.web.tsx`(iframe)가 대신한다.
// 여기서 열리는 건 프로바이더 공식 임베드 페이지뿐이고, 외부 이동은 카드의 "바로가기"가 담당한다.
// 크기는 이 컴포넌트가 잡지 않는다 — 항상 부모(LinkCard의 embedWrap, mediaFrame()이 계산한
// 박스)를 꽉 채운다. 그래야 썸네일과 임베드가 같은 프레임 결정 로직 한 곳을 공유한다.
export function EmbedFrame({ uri, accessibilityLabel, onContentHeight }: EmbedFrameProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [loading, setLoading] = useState(true);

  return (
    <View
      style={styles.frame}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <WebView
        source={{ uri }}
        style={styles.web}
        // 카드 안에서 재생 — iOS가 전체화면으로 튀지 않게 인라인 + 사용자 제스처 요구 해제
        // (탭 자체가 이미 재생 의사표시다). 전체화면은 플레이어 버튼으로 따로 갈 수 있다.
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        domStorageEnabled
        // 인스타 캡션·긴 트윗은 임베드 내부 스크롤로 본다. 바깥 리스트와 겹쳐 보이지 않게 인디케이터만 숨김.
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        // 임베드 안 링크가 새 창(별도 WebView)을 여는 걸 막는다 — 외부 이동은 "바로가기" 전용.
        setSupportMultipleWindows={false}
        onLoadEnd={() => setLoading(false)}
        injectedJavaScript={onContentHeight ? MEASURE_JS : undefined}
        onMessage={(e: WebViewMessageEvent) => {
          if (!onContentHeight) return;
          const d = e.nativeEvent.data;
          if (typeof d === 'string' && d.startsWith('H')) {
            const h = Number(d.slice(1));
            if (Number.isFinite(h) && h > 0) onContentHeight(h);
          }
        }}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.textTertiary} />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    // 부모(embedWrap)를 꽉 채우는 박스. 라운드는 카드(linkInner overflow:hidden)가 잘라 준다.
    frame: {
      width: '100%',
      height: '100%',
      backgroundColor: colors.surface,
      overflow: 'hidden',
    },
    web: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    loading: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
