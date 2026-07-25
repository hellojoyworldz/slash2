import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

/** 기기 간 실시간 동기화용 서버→클라 이벤트.
 *  type만 언어중립 신호이고, 프론트는 이 신호를 받으면 관련 목록/열린 방을 조용히 재조회한다.
 *  roomId는 변경이 일어난 방(분류 friendId; "나에게" 방은 null). 프론트가 최적화에 쓸 수 있는 힌트일 뿐,
 *  없거나 무시해도 무방하다(프론트는 신호를 받으면 목록·열린 방을 재조회하므로). */
export interface AppEvent {
  type: 'rooms_changed';
  roomId?: string | null;
}

/**
 * 유저별 인메모리 이벤트 버스. 한 유저가 여러 기기(웹·데스크톱·모바일)에서 접속하므로
 * userId 하나에 여러 SSE 스트림(Subject)이 매달린다. 연결이 끊기면 그 Subject만 정리한다.
 *
 * NOTE: 단일 서버 인스턴스 전제다. 다중 인스턴스로 수평 확장하면 이 인메모리 맵은
 *       인스턴스마다 따로 놀아 다른 인스턴스에 붙은 기기로 이벤트가 전파되지 않는다.
 *       그때는 Redis pub/sub(또는 Postgres LISTEN/NOTIFY)로 교체한다:
 *       publish()가 채널에 실어 보내고, 각 인스턴스가 구독해 자기 로컬 Subject들로 흘려보낸다.
 */
@Injectable()
export class EventsService {
  // userId → 그 유저의 열린 스트림들. 스트림이 0개가 되면 키를 지워 맵이 무한히 커지지 않게 한다.
  private readonly streams = new Map<string, Set<Subject<AppEvent>>>();

  /** 이 유저의 새 스트림을 만들어 등록한다. 컨트롤러가 SSE 연결마다 1개 호출. */
  subscribe(userId: string): Subject<AppEvent> {
    const subject = new Subject<AppEvent>();
    let set = this.streams.get(userId);
    if (!set) {
      set = new Set();
      this.streams.set(userId, set);
    }
    set.add(subject);
    return subject;
  }

  /** 스트림을 등록 해제하고 완료 처리한다(연결 종료 시). 메모리 누수 방지. */
  unsubscribe(userId: string, subject: Subject<AppEvent>): void {
    const set = this.streams.get(userId);
    if (set) {
      set.delete(subject);
      if (set.size === 0) this.streams.delete(userId);
    }
    subject.complete();
  }

  /** 이 유저의 모든 기기에 이벤트를 흘려보낸다. 구독자가 없으면 조용히 무시. */
  publish(userId: string, event: AppEvent): void {
    const set = this.streams.get(userId);
    if (!set) return;
    for (const subject of set) subject.next(event);
  }
}
