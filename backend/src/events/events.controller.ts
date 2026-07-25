import {
  Controller,
  MessageEvent,
  Query,
  Sse,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Observable, interval, map, merge } from 'rxjs';
import { JwtPayload } from '../auth/auth.service';
import { AppEvent, EventsService } from './events.service';

// 프록시/로드밸런서의 유휴 타임아웃(보통 30~60초)에 걸려 끊기지 않도록 주기적 keepalive를 보낸다.
const KEEPALIVE_MS = 25_000;

@Controller('events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * GET /api/events?token=<jwt> — 유저별 실시간 이벤트 SSE 스트림.
   *
   * 브라우저 EventSource는 커스텀 헤더(Authorization)를 실을 수 없어, 인증을 쿼리 토큰으로 받는다.
   * (URL에 토큰이 노출되는 위험은 있으나, 앱 JWT는 이미 클라에 저장돼 있고 HTTPS 하에선 경로만 남는다.)
   *
   * 흐름:
   *  - 토큰 검증 실패/누락 → 401.
   *  - 검증되면 그 유저의 Subject를 하나 열어 이벤트를 default message로 흘려보낸다.
   *  - 25초마다 ping 이벤트로 연결을 살려둔다(프론트는 type==='ping'을 무시).
   *  - 클라 disconnect 시 Nest가 Observable 구독을 해제 → teardown에서 Subject를 정리한다(누수 방지).
   */
  @Sse()
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    if (!token) {
      throw new UnauthorizedException('로그인이 필요합니다.');
    }
    let userId: string;
    try {
      // 동기 verify — @Sse 핸들러는 Observable을 즉시 반환해야 하므로 async를 피한다.
      const payload = this.jwt.verify<JwtPayload>(token);
      userId = payload.sub;
    } catch {
      throw new UnauthorizedException(
        '세션이 만료되었습니다. 다시 로그인해주세요.',
      );
    }

    const subject = this.events.subscribe(userId);

    const events$ = subject.pipe(
      map((event: AppEvent): MessageEvent => ({ data: event })),
    );
    const keepalive$ = interval(KEEPALIVE_MS).pipe(
      map((): MessageEvent => ({ data: { type: 'ping' } })),
    );

    // 두 스트림을 합쳐 내보내되, 구독 해제(=클라 종료) 시 이 유저의 Subject를 반드시 정리한다.
    return new Observable<MessageEvent>((observer) => {
      const sub = merge(events$, keepalive$).subscribe(observer);
      return () => {
        sub.unsubscribe();
        this.events.unsubscribe(userId, subject);
      };
    });
  }
}
