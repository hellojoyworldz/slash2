import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateMessageDto,
  ListMessagesQuery,
  NoticeQuery,
  UpdateMessageDto,
} from './messages.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateMessageDto) {
    return this.messages.create(user.id, dto.content, dto.friendId, dto.tagIds);
  }

  @Get()
  list(@CurrentUser() user: { id: string }, @Query() query: ListMessagesQuery) {
    return this.messages.list(user.id, query);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: { id: string }) {
    return this.messages.rooms(user.id);
  }

  @Get('auto-counts')
  autoCounts(@CurrentUser() user: { id: string }) {
    return this.messages.autoCounts(user.id);
  }

  // friendId 생략 = "나에게"(friendId null) 방의 공지. { notice: Message | null } 래핑 반환.
  @Get('notice')
  notice(@CurrentUser() user: { id: string }, @Query() query: NoticeQuery) {
    return this.messages.getNotice(user.id, query.friendId);
  }

  // 본인 메시지 단건 조회. 비동기 미리보기(언퍼얼)가 채워졌는지 프론트가 폴링으로 재조회한다.
  // 정적 GET 라우트(rooms·auto-counts·notice) 아래에 둬야 그 경로들이 :id로 잡히지 않는다.
  @Get(':id')
  findOne(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messages.findOneOwned(user.id, id);
  }

  // 메시지의 링크 미리보기(og·자동구분)를 다시 불러온다(본인 것만). 멀티링크면 전부 재시도.
  @Post(':id/refresh-preview')
  refreshPreview(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messages.refreshPreview(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.messages.remove(user.id, id);
  }
}
