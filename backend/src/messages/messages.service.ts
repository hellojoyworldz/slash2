import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Friend } from '../friends/friend.entity';
import { Tag } from '../tags/tag.entity';
import { LinkClassifierService } from './link-classifier.service';
import { LinkPreviewService } from './link-preview.service';
import { Message } from './message.entity';
import type { AutoFilter, MessageLink } from './message.entity';

// 목록/단건 응답에 실리는 직렬화 형태: Message 컬럼 + tagIds(항상 배열). 관계(tags/user/friend)는 노출하지 않는다.
export type MessageResponse = Omit<Message, 'tags' | 'user' | 'friend'> & {
  tagIds: string[];
};

const PAGE_SIZE = 30;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
// 한 메시지에서 언퍼얼할 링크 최대 개수(등장 순서·중복 제거 후).
const MAX_LINKS = 5;

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Friend) private readonly friends: Repository<Friend>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    private readonly linkPreview: LinkPreviewService,
    private readonly linkClassifier: LinkClassifierService,
  ) {}

  /** 주어진 메시지 id들의 tagIds를 조인 한 번으로 로드한다(N+1 방지). 없는 메시지는 빈 배열. */
  private async loadTagIdMap(ids: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    for (const id of ids) map.set(id, []);
    if (ids.length === 0) return map;
    const rows = await this.messages
      .createQueryBuilder('m')
      .leftJoin('m.tags', 't')
      .select('m.id', 'messageId')
      .addSelect('t.id', 'tagId')
      .where('m.id IN (:...ids)', { ids })
      .getRawMany<{ messageId: string; tagId: string | null }>();
    for (const row of rows) {
      if (row.tagId) map.get(row.messageId)?.push(row.tagId);
    }
    return map;
  }

  /** Message[] → 응답 형태(tagIds 포함, 관계 제거). 태그는 조인 한 번으로 채운다. */
  private async withTagIds(messages: Message[]): Promise<MessageResponse[]> {
    const map = await this.loadTagIdMap(messages.map((m) => m.id));
    return messages.map((m) => this.toResponse(m, map.get(m.id) ?? []));
  }

  private toResponse(message: Message, tagIds: string[]): MessageResponse {
    // 관계 프로퍼티는 응답에서 제거하고 컬럼만 남긴다.
    const { tags: _tags, user: _user, friend: _friend, ...rest } = message;
    return { ...rest, tagIds };
  }

  async create(
    userId: string,
    content: string,
    friendId?: string,
  ): Promise<MessageResponse> {
    // 다른 유저의 친구 id로 보내는 것을 막는다.
    if (friendId) {
      const friend = await this.friends.findOneBy({ id: friendId, userId });
      if (!friend) {
        throw new NotFoundException('친구를 찾을 수 없습니다.');
      }
    }

    const trimmed = content.trim();
    // content에 등장한 URL을 순서대로 최대 MAX_LINKS개 추출(동일 URL은 첫 등장만).
    const urls = this.extractUrls(trimmed);

    const message = this.messages.create({
      userId,
      friendId: friendId ?? null,
      content: trimmed,
      kind: urls.length ? 'link' : 'text',
      url: urls[0] ?? null,
    });

    if (urls.length) {
      // 각 링크를 기존 파이프라인으로 병렬 언퍼얼. 개별 실패는 그 링크만 빈 필드로
      // (best-effort) — 아래 unpackLink가 내부에서 방어하므로 reject되지 않지만,
      // 만일에 대비해 allSettled로 감싸 전체 예외를 원천 차단한다.
      const settled = await Promise.allSettled(
        urls.map((u) => this.unpackLink(u)),
      );
      const links: MessageLink[] = settled.map((res, i) =>
        res.status === 'fulfilled' ? res.value : this.emptyLink(urls[i]),
      );

      message.links = links;
      // 레거시 단일 필드 = 첫 링크(links[0]) — 자동구분·보드·rooms lastMessage 호환.
      const [first] = links;
      message.ogTitle = first.ogTitle;
      message.ogDescription = first.ogDescription;
      message.ogImage = first.ogImage;
      message.siteName = first.siteName;
      message.linkType = first.linkType;
      message.linkMeta = first.linkMeta;
    }

    const saved = await this.messages.save(message);
    // 새 메시지는 태그가 없다 → tagIds: [].
    return this.toResponse(saved, []);
  }

  /** content에서 http(s) URL을 등장 순서대로 뽑되, 동일 URL은 첫 등장만 남기고
   *  최대 MAX_LINKS개까지 반환한다. */
  private extractUrls(content: string): string[] {
    const matches = content.match(URL_PATTERN) ?? [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const url of matches) {
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= MAX_LINKS) break;
    }
    return out;
  }

  /** 단일 URL을 fetchPage → classify로 언퍼얼해 MessageLink로 만든다.
   *  파이프라인 두 단계 모두 예외를 던지지 않는(best-effort) 설계라, 실패해도
   *  빈 필드의 링크가 나온다 — 절대 reject되지 않는다. */
  private async unpackLink(url: string): Promise<MessageLink> {
    const { preview, html, finalUrl } = await this.linkPreview.fetchPage(url);
    // 미리보기로 받은 HTML·최종 URL을 그대로 분류기에 넘겨 재요청을 피한다.
    // (finalUrl이 없으면 원본 url로 폴백 — URL 패턴만으로도 구분되는 경우가 있다.)
    const { linkType, linkMeta } = await this.linkClassifier.classify(
      finalUrl ?? url,
      html ?? '',
      preview,
    );
    return {
      url,
      ogTitle: preview.title,
      ogDescription: preview.description,
      ogImage: preview.image,
      siteName: preview.siteName,
      linkType,
      linkMeta,
    };
  }

  private emptyLink(url: string): MessageLink {
    return {
      url,
      ogTitle: null,
      ogDescription: null,
      ogImage: null,
      siteName: null,
      linkType: null,
      linkMeta: null,
    };
  }

  /** 최신순 페이지네이션. before = 이전 페이지 마지막 메시지 id.
   *  tagId가 있으면 auto/friendId를 모두 무시하고 전체 방을 가로질러 그 태그가 붙은 메시지만 반환한다
   *  (남의/존재하지 않는 태그 id는 message_tags 조인에 걸릴 행이 없어 자연히 빈 목록 — 별도 404/400 없음).
   *  그 외엔 auto가 있으면 friendId 필터를 무시하고 전체 방을 가로질러 자동구분 값으로 필터한다. */
  async list(
    userId: string,
    options: {
      q?: string;
      before?: string;
      friendId?: string;
      auto?: AutoFilter;
      tagId?: string;
    },
  ) {
    const query = this.messages
      .createQueryBuilder('m')
      .where('m.userId = :userId', { userId })
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .take(PAGE_SIZE + 1);

    if (options.tagId) {
      query.innerJoin('m.tags', 't', 't.id = :tagId', { tagId: options.tagId });
    } else if (options.auto) {
      // memo: kind='text' / link: 자동구분 안 된 링크 / 나머지: 그 linkType의 링크
      if (options.auto === 'memo') {
        query.andWhere("m.kind = 'text'");
      } else if (options.auto === 'link') {
        query.andWhere("m.kind = 'link'").andWhere('m.linkType IS NULL');
      } else {
        query
          .andWhere("m.kind = 'link'")
          .andWhere('m.linkType = :linkType', { linkType: options.auto });
      }
    } else if (options.friendId) {
      // friendId가 있으면 그 친구 방만, 없으면 "나에게" 방 = 전체 메시지
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
    const items = await this.withTagIds(rows.slice(0, PAGE_SIZE));
    return { items, hasMore };
  }

  /** "자동구분" 탭별 개수(전 방 통합). 여섯 키 항상 전부 포함(0 포함).
   *  kind='link' 그룹은 GROUP BY 한 번으로, memo는 COUNT 한 번으로 처리한다. */
  async autoCounts(userId: string): Promise<Record<AutoFilter, number>> {
    const counts: Record<AutoFilter, number> = {
      place: 0,
      video: 0,
      item: 0,
      article: 0,
      memo: 0,
      link: 0,
    };

    // linkType이 null인 행은 "자동구분 안 된 링크" = 'link' 버킷으로 묶는다.
    const linkRows = await this.messages
      .createQueryBuilder('m')
      .select('m.linkType', 'linkType')
      .addSelect('COUNT(*)', 'count')
      .where('m.userId = :userId', { userId })
      .andWhere("m.kind = 'link'")
      .groupBy('m.linkType')
      .getRawMany<{ linkType: string | null; count: string }>();

    for (const row of linkRows) {
      const key = (row.linkType ?? 'link') as AutoFilter;
      counts[key] = Number(row.count);
    }

    counts.memo = await this.messages.count({
      where: { userId, kind: 'text' },
    });

    return counts;
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

    // 마지막 메시지들(self 포함)의 tagIds를 조인 한 번으로 채운다.
    const previews = [selfLast, ...lastMessages].filter(
      (m): m is Message => m != null,
    );
    const tagMap = await this.loadTagIdMap(previews.map((m) => m.id));
    const withTags = (m: Message | null): MessageResponse | null =>
      m ? this.toResponse(m, tagMap.get(m.id) ?? []) : null;

    // 메신저 정렬: 고정 먼저 → 마지막 메시지 최신순 → (메시지 없으면) 가나다순
    const rooms = friends.map((friend) => ({
      id: friend.id,
      name: friend.name,
      color: friend.color,
      description: friend.description,
      pinned: friend.pinned,
      lastMessage: withTags(byRoom.get(friend.id) ?? null),
    }));
    rooms.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const at = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (at !== bt) return bt - at;
      return a.name.localeCompare(b.name);
    });

    return { self: withTags(selfLast ?? null), friends: rooms };
  }

  /** 메시지 부분 업데이트.
   *  - dto.content가 있는 키(undefined가 아님)일 때만 내용을 갱신한다. 링크 메시지라도
   *    url/og/linkType 재추출은 하지 않는다(v1 — 텍스트 내용만 갱신).
   *  - dto.friendId가 있는 키일 때만 분류를 갱신한다. 명시적 null은 분류 해제,
   *    키 자체가 없으면(undefined) 분류는 그대로 둔다.
   *  ValidationPipe({ whitelist: true, transform: true })가 body에 없는 키를 undefined로 남기고
   *  명시적 null은 그대로 통과시키므로, undefined 여부로 "키 존재"를 판별한다. */
  async update(
    userId: string,
    id: string,
    dto: {
      content?: string;
      friendId?: string | null;
      tagIds?: string[];
      notice?: boolean;
    },
  ): Promise<MessageResponse> {
    // tagIds 전체 교체 diff를 위해 tags 관계를 함께 로드한다.
    const message = await this.messages.findOne({
      where: { id, userId },
      relations: { tags: true },
    });
    if (!message) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    if (dto.content !== undefined) {
      const trimmed = dto.content.trim();
      if (!trimmed) {
        throw new BadRequestException('내용을 입력해주세요.');
      }
      message.content = trimmed;
    }

    if (dto.friendId !== undefined) {
      if (dto.friendId) {
        const friend = await this.friends.findOneBy({
          id: dto.friendId,
          userId,
        });
        if (!friend) {
          throw new NotFoundException('친구를 찾을 수 없습니다.');
        }
      }
      message.friendId = dto.friendId;
    }

    if (dto.tagIds !== undefined) {
      // 전체 교체. 중복 id는 합치고, 내 소유가 아닌/없는 id가 있으면 400.
      const uniqueIds = [...new Set(dto.tagIds)];
      if (uniqueIds.length === 0) {
        message.tags = [];
      } else {
        const tags = await this.tags.findBy({ id: In(uniqueIds), userId });
        if (tags.length !== uniqueIds.length) {
          throw new BadRequestException({
            code: 'invalid_tag',
            message: '유효하지 않은 태그입니다.',
          });
        }
        message.tags = tags;
      }
    }

    if (dto.notice !== undefined) {
      if (dto.notice) {
        // 같은 방(동일 friendId, null 포함)의 기존 공지를 먼저 해제 — 방당 최대 1개.
        await this.messages.update(
          {
            userId,
            friendId: message.friendId === null ? IsNull() : message.friendId,
            isNotice: true,
          },
          { isNotice: false },
        );
        message.isNotice = true;
      } else {
        message.isNotice = false;
      }
    }

    // save가 tags 관계 diff까지 반영(조인행 추가/삭제).
    await this.messages.save(message);
    return (await this.withTagIds([message]))[0];
  }

  /** 방(friendId 생략 = "나에게" null 방)의 공지 메시지. 없으면 null. */
  async getNotice(
    userId: string,
    friendId?: string,
  ): Promise<{ notice: MessageResponse | null }> {
    const message = await this.messages.findOne({
      where: {
        userId,
        isNotice: true,
        friendId: friendId ?? IsNull(),
      },
    });
    if (!message) {
      return { notice: null };
    }
    return { notice: (await this.withTagIds([message]))[0] };
  }

  async remove(userId: string, id: string): Promise<void> {
    const result = await this.messages.delete({ id, userId });
    if (!result.affected) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }
  }
}
