import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

// 팝오버(말풍선) 루트 오버레이 — InfoPopover가 조상(모달 ScrollView·데스크톱 패널)의 overflow
// 클리핑에 잘리지 않도록, 말풍선을 여기(화면 전체 절대배치)로 포탈해서 렌더한다.
// floating-ui는 이 오버레이를 offsetParent로 삼아 화면 좌표로 위치를 계산한다.
// 오버레이는 pointerEvents="box-none"이라 말풍선 외 영역의 터치는 그대로 아래로 통과한다.

interface PopoverHostState {
  /** floating 위치 계산의 기준(offsetParent) — 루트 오버레이 View 노드. */
  offsetParent: unknown | null;
  /** id로 말풍선 노드를 루트 오버레이에 올린다(교체). */
  mount: (id: string, node: ReactNode) => void;
  /** id의 말풍선을 내린다. */
  unmount: (id: string) => void;
}

const PopoverHostContext = createContext<PopoverHostState | null>(null);

export function PopoverHostProvider({ children }: { children: ReactNode }) {
  const [portals, setPortals] = useState<ReadonlyMap<string, ReactNode>>(
    () => new Map(),
  );
  const [offsetParent, setOffsetParent] = useState<unknown | null>(null);

  const mount = useCallback((id: string, node: ReactNode) => {
    setPortals((prev) => {
      const next = new Map(prev);
      next.set(id, node);
      return next;
    });
  }, []);
  const unmount = useCallback((id: string) => {
    setPortals((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ offsetParent, mount, unmount }),
    [offsetParent, mount, unmount],
  );

  return (
    <PopoverHostContext.Provider value={value}>
      {children}
      {/* 루트 오버레이(offsetParent). children 뒤에 렌더되어 모달·목록 위에 뜬다. box-none으로 터치 통과. */}
      <View
        ref={setOffsetParent}
        style={StyleSheet.absoluteFill}
        pointerEvents="box-none"
        collapsable={false}
      >
        {Array.from(portals.entries()).map(([id, node]) => (
          <View key={id} style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {node}
          </View>
        ))}
      </View>
    </PopoverHostContext.Provider>
  );
}

export function usePopoverHost(): PopoverHostState {
  const value = useContext(PopoverHostContext);
  if (!value) {
    throw new Error('usePopoverHost는 PopoverHostProvider 안에서만 쓸 수 있습니다');
  }
  return value;
}
