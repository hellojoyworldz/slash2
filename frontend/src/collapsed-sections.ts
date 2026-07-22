import { useCallback, useRef } from 'react';
import { api } from './api';
import { useAuth } from './auth';

// 섹션 접기 상태를 서버(users.collapsedSections)에 저장하는 공용 훅.
// 키 체계는 프론트 소유(전부 소문자·점 구분):
//   - 본탭:        friends.favorites, friends.list, tags.favorites, tags.list, auto.favorites, auto.list
//   - 픽커 모달:   picker.categories, picker.tags (목록 섹션),
//                  picker.categories.add, picker.tags.add (추가 폼 섹션)
//   - 목록형 보드: board.<board>.<sectionKey>  (예: board.auto.place, board.category.<friendId>, board.tags.tag:<tagId>)
//
// 상태는 루트 auth 컨텍스트에 있으므로 900px 트리 스왑(데스크톱 3패널 ↔ 모바일 탭 리마운트)에서도
// 자연히 살아남는다 — 화면 로컬 useState였다면 리마운트마다 초기화되던 자리다.
//
// toggle: 낙관 반영(컨텍스트 즉시 갱신) 후 api.updateProfile 저장, 실패 시 이전 값으로 되돌린다
//   (AutoScreen의 순서/즐겨찾기 revert 패턴과 동일 — 조용히 삼키지 않는다).
//   연타 대비 최신 값을 ref로 읽어 계산하므로 레이스에서 마지막 저장이 승리한다(충분).
export function useCollapsedSections() {
  const { token, collapsedSections, setCollapsedSections } = useAuth();

  // 항상 최신 컨텍스트 값을 가리키는 ref — 연타 시 stale 클로저 대신 이걸로 next를 계산한다.
  const latestRef = useRef(collapsedSections);
  latestRef.current = collapsedSections;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const isCollapsed = useCallback(
    (key: string) => collapsedSections.includes(key),
    [collapsedSections],
  );

  const toggle = useCallback(
    (key: string) => {
      const prev = latestRef.current;
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key];
      // 낙관 반영 — ref도 즉시 갱신해 같은 틱의 연타가 이 결과 위에서 계산되게 한다.
      latestRef.current = next;
      setCollapsedSections(next);
      const tk = tokenRef.current;
      if (tk) {
        api.updateProfile(tk, { collapsedSections: next }).catch(() => {
          // 저장 실패 → 이 토글 이전 값으로 복원(마지막 저장 승리).
          latestRef.current = prev;
          setCollapsedSections(prev);
        });
      }
    },
    [setCollapsedSections],
  );

  return { collapsedSections, isCollapsed, toggle };
}
