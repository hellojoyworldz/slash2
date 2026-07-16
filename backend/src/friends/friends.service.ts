import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Message } from '../messages/message.entity';
import { Friend } from './friend.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friend)
    private readonly friends: Repository<Friend>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
  ) {}

  // 분류 목록 + 분류별 메시지 개수
  async list(userId: string): Promise<(Friend & { messageCount: number })[]> {
    const friends = await this.friends.find({
      where: { userId },
      // 분류 탭 수동 순서. 기존 행은 position=0이라 이름순으로 유지된다.
      order: { position: 'ASC', name: 'ASC' },
    });
    const counts = await this.messages
      .createQueryBuilder('m')
      .select('m.friendId', 'friendId')
      .addSelect('COUNT(*)', 'count')
      .where('m.userId = :userId', { userId })
      .andWhere('m.friendId IS NOT NULL')
      .groupBy('m.friendId')
      .getRawMany<{ friendId: string; count: string }>();
    const byId = new Map(counts.map((c) => [c.friendId, Number(c.count)]));
    return friends.map((f) => ({ ...f, messageCount: byId.get(f.id) ?? 0 }));
  }

  // 표시 시 항상 /를 붙이므로, 사용자가 친 앞쪽 슬래시는 저장 전에 걷어낸다
  private normalizeName(name: string): string {
    return name.trim().replace(/^\/+/, '').trim();
  }

  async create(
    userId: string,
    name: string,
    color?: string,
  ): Promise<Friend> {
    const trimmed = this.normalizeName(name);
    const existing = await this.friends.findOne({
      where: { userId, name: trimmed },
    });
    if (existing) {
      throw new ConflictException('이미 같은 이름의 친구가 있어요.');
    }
    // 새 분류는 목록 맨 아래로 — 현재 최대 position 다음 값(없으면 0).
    const raw = await this.friends
      .createQueryBuilder('f')
      .select('COALESCE(MAX(f.position), -1)', 'max')
      .where('f.userId = :userId', { userId })
      .getRawOne<{ max: string }>();
    const position = Number(raw?.max ?? -1) + 1;
    const friend = this.friends.create({
      userId,
      name: trimmed,
      color: color ?? null,
      position,
    });
    return this.friends.save(friend);
  }

  async update(
    userId: string,
    id: string,
    changes: { pinned?: boolean; name?: string; color?: string },
  ): Promise<Friend> {
    const friend = await this.friends.findOne({ where: { id, userId } });
    if (!friend) {
      throw new NotFoundException('친구를 찾을 수 없습니다.');
    }
    if (changes.name !== undefined) {
      const trimmed = this.normalizeName(changes.name);
      // 이름 중복 검사 — 자기 자신은 제외
      const existing = await this.friends.findOne({
        where: { userId, name: trimmed },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('이미 같은 이름의 친구가 있어요.');
      }
      friend.name = trimmed;
    }
    if (changes.color !== undefined) {
      friend.color = changes.color;
    }
    if (changes.pinned !== undefined) {
      friend.pinned = changes.pinned;
    }
    return this.friends.save(friend);
  }

  async remove(userId: string, id: string): Promise<void> {
    const friend = await this.friends.findOne({ where: { id, userId } });
    if (!friend) {
      throw new NotFoundException('친구를 찾을 수 없습니다.');
    }
    await this.friends.remove(friend);
  }

  // 분류 탭 수동 정렬 저장. ids = 화면에 보이는 순서. 전부 이 유저 소유여야 한다.
  async reorder(userId: string, ids: string[]): Promise<void> {
    // 보낸 id가 전부 이 유저의 분류인지 검증(중복·타인 소유·존재하지 않는 id는 걸러진다:
    // In()은 중복을 합치므로 found 수가 모자라면 거부된다).
    const found = await this.friends.findBy({ id: In(ids), userId });
    if (found.length !== ids.length) {
      throw new BadRequestException({
        code: 'invalid_order',
        message: '순서 목록이 올바르지 않습니다.',
      });
    }
    // index를 position으로 일괄 저장(트랜잭션). 순차 실행 — 단일 커넥션 트랜잭션이라 병렬 금지.
    await this.friends.manager.transaction(async (mgr) => {
      for (let i = 0; i < ids.length; i++) {
        await mgr.update(Friend, { id: ids[i], userId }, { position: i });
      }
    });
  }
}
