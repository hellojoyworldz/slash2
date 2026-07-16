import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friend } from '../friends/friend.entity';
import { LinkPreviewService } from './link-preview.service';
import { Message } from './message.entity';

const PAGE_SIZE = 30;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Friend) private readonly friends: Repository<Friend>,
    private readonly linkPreview: LinkPreviewService,
  ) {}

  async create(
    userId: string,
    content: string,
    friendId?: string,
  ): Promise<Message> {
    // 다른 유저의 친구 id로 보내는 것을 막는다.
    if (friendId) {
      const friend = await this.friends.findOneBy({ id: friendId, userId });
      if (!friend) {
        throw new NotFoundException('친구를 찾을 수 없습니다.');
      }
    }

    const trimmed = content.trim();
    const url = trimmed.match(URL_PATTERN)?.[0] ?? null;

    const message = this.messages.create({
      userId,
      friendId: friendId ?? null,
      content: trimmed,
      kind: url ? 'link' : 'text',
      url,
    });

    if (url) {
      const preview = await this.linkPreview.fetch(url);
      message.ogTitle = preview.title;
      message.ogDescription = preview.description;
      message.ogImage = preview.image;
      message.siteName = preview.siteName;
    }

    return this.messages.save(message);
  }

  /** 최신순 페이지네이션. before = 이전 페이지 마지막 메시지 id. */
  async list(
    userId: string,
    options: { q?: string; before?: string; friendId?: string },
  ) {
    const query = this.messages
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(PAGE_SIZE + 1);

    // friendId가 있으면 그 친구 방만, 없으면 "나에게" 방 = 전체 메시지
    if (options.friendId) {
      query.andWhere('m.friendId = :friendId', { friendId: options.friendId });
    }

    if (options.q) {
      query.andWhere(
        '(m.content ILIKE :q OR m.ogTitle ILIKE :q OR m.ogDescription ILIKE :q OR m.siteName ILIKE :q)',
        { q: `%${options.q}%` },
      );
    }

    if (options.before) {
      const anchor = await this.messages.findOneBy({
        id: options.before,
        userId,
      });
      if (anchor) {
        query.andWhere(
          '(m.createdAt < :anchorCreatedAt OR (m.createdAt = :anchorCreatedAt AND m.id < :anchorId))',
          { anchorCreatedAt: anchor.createdAt, anchorId: anchor.id },
        );
      }
    }

    const rows = await query.getMany();
    const hasMore = rows.length > PAGE_SIZE;
    return { items: rows.slice(0, PAGE_SIZE), hasMore };
  }

  /** 채팅 탭용: "전체" 방 + 분류 방들의 마지막 메시지 요약 */
  async rooms(userId: string) {
    const friends = await this.friends.find({ where: { userId } });

    // "나에게" 방은 전체 메시지의 마지막 것
    const selfLast = await this.messages.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    // 친구 방별 마지막 메시지를 한 번에 가져온다.
    const lastMessages = await this.messages
      .createQueryBuilder('m')
      .distinctOn(['m.friendId'])
      .where('m.userId = :userId', { userId })
      .andWhere('m.friendId IS NOT NULL')
      .orderBy('m.friendId')
      .addOrderBy('m.createdAt', 'DESC')
      .getMany();

    const byRoom = new Map(lastMessages.map((m) => [m.friendId, m]));

    // 메신저 정렬: 고정 먼저 → 마지막 메시지 최신순 → (메시지 없으면) 가나다순
    const rooms = friends.map((friend) => ({
      id: friend.id,
      name: friend.name,
      color: friend.color,
      pinned: friend.pinned,
      lastMessage: byRoom.get(friend.id) ?? null,
    }));
    rooms.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    });

    return { self: selfLast ?? null, friends: rooms };
  }

  /** 메시지의 친구(카테고리) 분류를 바꾼다. friendId가 null이면 분류 해제. */
  async updateFriend(
    userId: string,
    id: string,
    friendId: string | null,
  ): Promise<Message> {
    const message = await this.messages.findOneBy({ id, userId });
    if (!message) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }
    if (friendId) {
      const friend = await this.friends.findOneBy({ id: friendId, userId });
      if (!friend) {
        throw new NotFoundException('친구를 찾을 수 없습니다.');
      }
    }
    message.friendId = friendId;
    return this.messages.save(message);
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.messages.delete({ id, userId });
    if (!result.affected) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }
  }
}
