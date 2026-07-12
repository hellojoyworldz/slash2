import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Friend } from '../friends/friend.entity';
import { LinkPreviewService } from './link-preview.service';
import { Message } from './message.entity';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Friend])],
  controllers: [MessagesController],
  providers: [MessagesService, LinkPreviewService],
})
export class MessagesModule {}
