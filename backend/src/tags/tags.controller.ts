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
  CreateTagDto,
  ReorderFavoriteTagsDto,
  ReorderTagsDto,
  UpdateTagDto,
} from './tags.dto';
import { TagsService } from './tags.service';

@Controller('tags')
@UseGuards(JwtAuthGuard)
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(@CurrentUser() user: { id: string }) {
    return this.tags.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateTagDto) {
    return this.tags.create(
      user.id,
      dto.name,
      dto.color,
      dto.description,
      dto.keywords,
    );
  }

  // 주의: '/tags/order'가 @Patch(':id')(ParseUUIDPipe)에 먹히지 않도록 반드시 위에 선언한다.
  @Patch('order')
  @HttpCode(204)
  async reorder(
    @CurrentUser() user: { id: string },
    @Body() dto: ReorderTagsDto,
  ) {
    await this.tags.reorder(user.id, dto.ids);
  }

  // 주의: '/tags/favorite-order'도 마찬가지로 @Patch(':id')보다 위에 선언한다.
  @Patch('favorite-order')
  @HttpCode(204)
  async reorderFavorites(
    @CurrentUser() user: { id: string },
    @Body() dto: ReorderFavoriteTagsDto,
  ) {
    await this.tags.reorderFavorites(user.id, dto.ids);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return this.tags.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tags.remove(user.id, id);
  }
}
