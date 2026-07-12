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
  UpdateMessageDto,
} from './messages.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateMessageDto,
  ) {
    return this.messages.create(user.id, dto.content, dto.friendId);
  }

  @Get()
  list(
    @CurrentUser() user: { id: string },
    @Query() query: ListMessagesQuery,
  ) {
    return this.messages.list(user.id, query);
  }

  @Get('rooms')
  rooms(@CurrentUser() user: { id: string }) {
    return this.messages.rooms(user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMessageDto,
  ) {
    return this.messages.updateFriend(user.id, id, dto.friendId ?? null);
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
