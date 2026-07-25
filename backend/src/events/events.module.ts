import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

/**
 * 실시간 동기화 이벤트 버스. EventsService는 다른 모듈(messages 등)이 변이 시 이벤트를
 * 발행할 수 있게 export한다. JwtService는 전역 AuthModule이 제공하므로 별도 import 불필요.
 */
@Module({
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
