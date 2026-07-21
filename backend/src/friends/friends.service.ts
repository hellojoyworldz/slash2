import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
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

  // 빈 문자열/공백뿐인 설명은 null로 통일 저장
  private normalizeDescription(description: string): string | null {
    const trimmed = description.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  async create(
    userId: string,
    name: string,
    color?: string,
    description?: string,
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
      description:
        description !== undefined ? this.normalizeDescription(description) : null,
      position,
    });
    return this.friends.save(friend);
  }

  async update(
    userId: string,
    id: string,
    changes: {
      pinned?: boolean;
      favorite?: boolean;
      name?: string;
      // 색 계약: 키 없음(undefined)=미변경, null=무채(컬럼 null), hex=그 색.
      color?: string | null;
      description?: string;
    },
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
    // 키가 있을 때만 반영 — null이면 무채(컬럼 null)로, hex면 그 색으로.
    if (changes.color !== undefined) {
      friend.color = changes.color;
    }
    if (changes.description !== undefined) {
      friend.description = this.normalizeDescription(changes.description);
    }
    if (changes.pinned !== undefined) {
      friend.pinned = changes.pinned;
    }
    if (changes.favorite !== undefined) {
      // 이미 같은 상태면 위치 유지(중복 true에 위치 재부여 금지).
      if (changes.favorite && !friend.favorite) {
        // 맨 밑에 추가 — 현재 이 유저의 즐겨찾기 중 최대 favoritePosition 다음 값(없으면 0).
        // 단, favoritePosition 필드가 생기기 전에 즐겨찾기된 레거시 행은 position=null이라
        // MAX가 이들을 무시해버려 새 항목이 맨 밑이 아니라 위로 가는 버그가 있었다.
        // → 새 위치를 부여하기 전에 null-position 즐겨찾기들을 분류(position) 순서로
        //   먼저 정규화(트랜잭션)한 뒤, 그 다음 값을 새 항목에 부여해 진짜 맨 밑을 보장한다.
        await this.friends.manager.transaction(async (mgr) => {
          const nullPositioned = await mgr.find(Friend, {
            where: { userId, favorite: true, favoritePosition: IsNull() },
            order: { position: 'ASC', name: 'ASC' },
          });
          if (nullPositioned.length > 0) {
            const raw = await mgr
              .createQueryBuilder(Friend, 'f')
              .select('COALESCE(MAX(f.favoritePosition), -1)', 'max')
              .where('f.userId = :userId', { userId })
              .andWhere('f.favorite = true')
              .getRawOne<{ max: string }>();
            let next = Number(raw?.max ?? -1) + 1;
            for (const legacy of nullPositioned) {
              await mgr.update(
                Friend,
                { id: legacy.id },
                { favoritePosition: next },
              );
              next++;
            }
          }
          const raw2 = await mgr
            .createQueryBuilder(Friend, 'f')
            .select('COALESCE(MAX(f.favoritePosition), -1)', 'max')
            .where('f.userId = :userId', { userId })
            .andWhere('f.favorite = true')
            .getRawOne<{ max: string }>();
          friend.favoritePosition = Number(raw2?.max ?? -1) + 1;
        });
      } else if (!changes.favorite) {
        friend.favoritePosition = null;
      }
      friend.favorite = changes.favorite;
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

  // 즐겨찾기 목록 수동 정렬 저장. ids = 즐겨찾기된 분류들의 새 순서 전체.
  // 전부 이 유저 소유 + favorite=true여야 한다(아니면 400).
  async reorderFavorites(userId: string, ids: string[]): Promise<void> {
    const found = await this.friends.findBy({ id: In(ids), userId });
    if (
      found.length !== ids.length ||
      found.some((f) => !f.favorite)
    ) {
      throw new BadRequestException({
        code: 'invalid_order',
        message: '순서 목록이 올바르지 않습니다.',
      });
    }
    // index를 favoritePosition으로 일괄 저장(트랜잭션). 순차 실행 — 단일 커넥션 트랜잭션이라 병렬 금지.
    await this.friends.manager.transaction(async (mgr) => {
      for (let i = 0; i < ids.length; i++) {
        await mgr.update(
          Friend,
          { id: ids[i], userId },
          { favoritePosition: i },
        );
      }
    });
  }
}
