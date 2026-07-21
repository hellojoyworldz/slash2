import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Tag } from './tag.entity';

// GET /tags 응답 형태: Tag 컬럼 + messageCount(그 유저 메시지 중 이 태그가 붙은 개수).
export type TagResponse = Tag & { messageCount: number };

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
  ) {}

  // 태그 목록 (고정 → 수동 순서 → 이름순) + messageCount.
  // message_tags를 한 번만 조인해 GROUP BY로 집계 — N+1 없음.
  // 조인 시 messages.userId 조건까지 걸어 "그 유저 것만" 센다(태그 자체가 유저 소유라 사실상 항상 같지만 명시).
  async list(userId: string): Promise<TagResponse[]> {
    const rows = await this.tags
      .createQueryBuilder('t')
      .leftJoin('message_tags', 'mt', 'mt.tagId = t.id')
      .leftJoin(
        'messages',
        'm',
        'm.id = mt.messageId AND m.userId = :userId',
        { userId },
      )
      .select('t.id', 'id')
      .addSelect('t.userId', 'userId')
      .addSelect('t.name', 'name')
      .addSelect('t.color', 'color')
      .addSelect('t.pinned', 'pinned')
      .addSelect('t.description', 'description')
      .addSelect('t.favorite', 'favorite')
      .addSelect('t.position', 'position')
      .addSelect('t.favoritePosition', 'favoritePosition')
      .addSelect('t.createdAt', 'createdAt')
      .addSelect('COUNT(DISTINCT m.id)', 'messageCount')
      .where('t.userId = :userId', { userId })
      .groupBy('t.id')
      .orderBy('t.pinned', 'DESC')
      .addOrderBy('t.position', 'ASC')
      .addOrderBy('t.name', 'ASC')
      .getRawMany<{
        id: string;
        userId: string;
        name: string;
        color: string | null;
        pinned: boolean;
        description: string | null;
        favorite: boolean;
        position: number;
        favoritePosition: number | null;
        createdAt: Date;
        messageCount: string;
      }>();

    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      color: r.color,
      pinned: r.pinned,
      description: r.description,
      favorite: r.favorite,
      position: r.position,
      favoritePosition: r.favoritePosition,
      createdAt: r.createdAt,
      messageCount: Number(r.messageCount),
    })) as TagResponse[];
  }

  async create(
    userId: string,
    name: string,
    color?: string,
    description?: string,
  ): Promise<Tag> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new BadRequestException({
        code: 'tag_name_required',
        message: '태그 이름을 입력해주세요.',
      });
    }
    const existing = await this.tags.findOne({
      where: { userId, name: trimmed },
    });
    if (existing) {
      throw new ConflictException({
        code: 'tag_name_taken',
        message: '이미 있는 태그입니다.',
      });
    }
    // 새 태그는 목록 맨 아래로 — 현재 최대 position 다음 값(없으면 0).
    const raw = await this.tags
      .createQueryBuilder('t')
      .select('COALESCE(MAX(t.position), -1)', 'max')
      .where('t.userId = :userId', { userId })
      .getRawOne<{ max: string }>();
    const position = Number(raw?.max ?? -1) + 1;
    // 설명은 트림 후 빈이면 null(수정 관례와 동일).
    const desc = description?.trim();
    const tag = this.tags.create({
      userId,
      name: trimmed,
      color: color ?? null,
      position,
      description: desc ? desc : null,
    });
    return this.tags.save(tag);
  }

  // 부분 갱신: name·pinned 각각 changes에 키가 있을 때만 반영. friends.update와 같은 관례.
  async update(
    userId: string,
    id: string,
    changes: {
      name?: string;
      // 색 계약: 키 없음(undefined)=미변경, null=무채(컬럼 null), hex=그 색.
      color?: string | null;
      pinned?: boolean;
      description?: string;
      favorite?: boolean;
    },
  ): Promise<Tag> {
    const tag = await this.tags.findOne({ where: { id, userId } });
    if (!tag) {
      throw new NotFoundException('태그를 찾을 수 없습니다.');
    }
    // 키가 있을 때만 반영 — null이면 무채(컬럼 null)로, hex면 그 색으로.
    if (changes.color !== undefined) {
      tag.color = changes.color;
    }
    if (changes.name !== undefined) {
      const trimmed = changes.name.trim();
      if (!trimmed) {
        throw new BadRequestException({
          code: 'tag_name_required',
          message: '태그 이름을 입력해주세요.',
        });
      }
      // 이름 중복 검사 — 자기 자신은 제외.
      const existing = await this.tags.findOne({
        where: { userId, name: trimmed },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException({
          code: 'tag_name_taken',
          message: '이미 있는 태그입니다.',
        });
      }
      tag.name = trimmed;
    }
    if (changes.pinned !== undefined) {
      tag.pinned = changes.pinned;
    }
    if (changes.description !== undefined) {
      const trimmed = changes.description.trim();
      tag.description = trimmed.length > 0 ? trimmed : null;
    }
    if (changes.favorite !== undefined) {
      // 이미 같은 상태면 위치 유지(중복 true에 위치 재부여 금지).
      if (changes.favorite && !tag.favorite) {
        // 맨 밑에 추가 — 현재 이 유저의 즐겨찾기 중 최대 favoritePosition 다음 값(없으면 0).
        // 단, favoritePosition 필드가 생기기 전에 즐겨찾기된 레거시 행은 position=null이라
        // MAX가 이들을 무시해버려 새 항목이 맨 밑이 아니라 위로 가는 버그가 있었다.
        // → 새 위치를 부여하기 전에 null-position 즐겨찾기들을 분류(position) 순서로
        //   먼저 정규화(트랜잭션)한 뒤, 그 다음 값을 새 항목에 부여해 진짜 맨 밑을 보장한다.
        await this.tags.manager.transaction(async (mgr) => {
          const nullPositioned = await mgr.find(Tag, {
            where: { userId, favorite: true, favoritePosition: IsNull() },
            order: { position: 'ASC', name: 'ASC' },
          });
          if (nullPositioned.length > 0) {
            const raw = await mgr
              .createQueryBuilder(Tag, 'f')
              .select('COALESCE(MAX(f.favoritePosition), -1)', 'max')
              .where('f.userId = :userId', { userId })
              .andWhere('f.favorite = true')
              .getRawOne<{ max: string }>();
            let next = Number(raw?.max ?? -1) + 1;
            for (const legacy of nullPositioned) {
              await mgr.update(
                Tag,
                { id: legacy.id },
                { favoritePosition: next },
              );
              next++;
            }
          }
          const raw2 = await mgr
            .createQueryBuilder(Tag, 'f')
            .select('COALESCE(MAX(f.favoritePosition), -1)', 'max')
            .where('f.userId = :userId', { userId })
            .andWhere('f.favorite = true')
            .getRawOne<{ max: string }>();
          tag.favoritePosition = Number(raw2?.max ?? -1) + 1;
        });
      } else if (!changes.favorite) {
        tag.favoritePosition = null;
      }
      tag.favorite = changes.favorite;
    }
    return this.tags.save(tag);
  }

  async remove(userId: string, id: string): Promise<void> {
    const tag = await this.tags.findOne({ where: { id, userId } });
    if (!tag) {
      throw new NotFoundException('태그를 찾을 수 없습니다.');
    }
    // message_tags 조인행은 DB의 ON DELETE CASCADE로 함께 지워진다.
    await this.tags.remove(tag);
  }

  // 태그 목록 수동 정렬 저장. ids = 화면에 보이는 순서. 전부 이 유저 소유여야 한다.
  // friends.reorder와 완전히 같은 관례.
  async reorder(userId: string, ids: string[]): Promise<void> {
    // 보낸 id가 전부 이 유저의 태그인지 검증(중복·타인 소유·존재하지 않는 id는 걸러진다:
    // In()은 중복을 합치므로 found 수가 모자라면 거부된다).
    const found = await this.tags.findBy({ id: In(ids), userId });
    if (found.length !== ids.length) {
      throw new BadRequestException({
        code: 'invalid_order',
        message: '순서 목록이 올바르지 않습니다.',
      });
    }
    // index를 position으로 일괄 저장(트랜잭션). 순차 실행 — 단일 커넥션 트랜잭션이라 병렬 금지.
    await this.tags.manager.transaction(async (mgr) => {
      for (let i = 0; i < ids.length; i++) {
        await mgr.update(Tag, { id: ids[i], userId }, { position: i });
      }
    });
  }

  // 즐겨찾기 목록 수동 정렬 저장. ids = 즐겨찾기된 태그들의 새 순서 전체.
  // 전부 이 유저 소유 + favorite=true여야 한다(아니면 400).
  async reorderFavorites(userId: string, ids: string[]): Promise<void> {
    const found = await this.tags.findBy({ id: In(ids), userId });
    if (found.length !== ids.length || found.some((f) => !f.favorite)) {
      throw new BadRequestException({
        code: 'invalid_order',
        message: '순서 목록이 올바르지 않습니다.',
      });
    }
    // index를 favoritePosition으로 일괄 저장(트랜잭션). 순차 실행 — 단일 커넥션 트랜잭션이라 병렬 금지.
    await this.tags.manager.transaction(async (mgr) => {
      for (let i = 0; i < ids.length; i++) {
        await mgr.update(Tag, { id: ids[i], userId }, { favoritePosition: i });
      }
    });
  }
}
