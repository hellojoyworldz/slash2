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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateFriendDto,
  ReorderFriendsDto,
  UpdateFriendDto,
} from './friends.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.friends.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateFriendDto) {
    return this.friends.create(user.id, dto.name, dto.color);
  }

  // 주의: '/friends/order'가 @Patch(':id')(ParseUUIDPipe)에 먹히지 않도록 반드시 위에 선언한다.
  @Patch('order')
  @HttpCode(204)
  async reorder(
    @CurrentUser() user: { id: string },
    @Body() dto: ReorderFriendsDto,
  ) {
    await this.friends.reorder(user.id, dto.ids);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFriendDto,
  ) {
    return this.friends.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.friends.remove(user.id, id);
  }
}
