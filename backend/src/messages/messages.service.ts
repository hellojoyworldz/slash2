import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Friend } from '../friends/friend.entity';
import { Tag } from '../tags/tag.entity';
import { matchKeywordTags } from '../tags/keyword-match';
import { LinkClassifierService } from './link-classifier.service';
import { LinkPreviewService } from './link-preview.service';
import { Message, ROOM_ALL } from './message.entity';
import type { AutoFilter, AutoQueryFilter, MessageLink } from './message.entity';

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
  private readonly logger = new Logger(MessagesService.name);

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

  /** tagIds(중복 허용)를 내 소유 Tag[]로 변환한다. 생략/빈 배열이면 []. 남의/없는 id가
   *  섞이면 400(code: invalid_tag). create·update가 공유하는 태그 소유 검증 경로. */
  private async resolveTags(userId: string, tagIds?: string[]): Promise<Tag[]> {
    const uniqueIds = [...new Set(tagIds ?? [])];
    if (uniqueIds.length === 0) return [];
    const tags = await this.tags.findBy({ id: In(uniqueIds), userId });
    if (tags.length !== uniqueIds.length) {
      throw new BadRequestException({
        code: 'invalid_tag',
        message: '유효하지 않은 태그입니다.',
      });
    }
    return tags;
  }

  async create(
    userId: string,
    content: string,
    friendId?: string,
    tagIds?: string[],
  ): Promise<MessageResponse> {
    // 다른 유저의 친구 id로 보내는 것을 막는다.
    if (friendId) {
      const friend = await this.friends.findOneBy({ id: friendId, userId });
      if (!friend) {
        throw new NotFoundException('친구를 찾을 수 없습니다.');
      }
    }

    // 태그가 있으면 소유 검증 후 부착한다(전송 전 실패하게 먼저 검증).
    const tags = await this.resolveTags(userId, tagIds);

    const trimmed = content.trim();
    // content에 등장한 URL을 순서대로 최대 MAX_LINKS개 추출(동일 URL은 첫 등장만).
    const urls = this.extractUrls(trimmed);
    const isLink = urls.length > 0;

    const message = this.messages.create({
      userId,
      friendId: friendId ?? null,
      content: trimmed,
      kind: isLink ? 'link' : 'text',
      url: urls[0] ?? null,
      // ManyToMany 조인행(message_tags)은 save 시 관계 배열로 동기화된다(update 경로와 동일).
      tags,
    });

    if (isLink) {
      // 카톡식 비동기 미리보기: 언퍼얼을 기다리지 않고 url만 담은 빈 링크 원소로 즉시 저장한다
      // (og·linkType 비움). 실제 언퍼얼과 og 기준 키워드 매칭은 저장 직후 백그라운드에서 수행한다.
      message.links = urls.map((url) => this.emptyLink(url));
    } else {
      // 텍스트 메모는 언퍼얼이 없으니 본문 기준 키워드 매칭을 저장 시 즉시 수행한다(제거는 안 함).
      message.tags = await this.mergeKeywordTags(userId, message, tags);
    }

    const saved = await this.messages.save(message);

    if (isLink) {
      // fire-and-forget: 응답을 막지 않고 백그라운드로 언퍼얼 → og·linkType·키워드 태그를 갱신한다.
      // 예외는 내부에서 전부 catch(프로세스 크래시 금지). await하지 않는다.
      void this.unpackInBackground(saved.id, userId, urls);
    }

    return this.toResponse(
      saved,
      message.tags.map((tag) => tag.id),
    );
  }

  /** 저장 직후 백그라운드(fire-and-forget) 언퍼얼. 링크를 실제로 언퍼얼해 og·linkType·linkMeta를
   *  채워 넣고, og가 채워진 뒤의 키워드 태그 매칭까지 수행해 그 메시지 row를 갱신 저장한다.
   *  - 예외는 전부 catch+로그(프로세스 크래시 금지).
   *  - 그 사이 메시지가 삭제됐으면 조용히 스킵(재조회 결과 없음 허용).
   *  - 수정과의 레이스는 마지막 저장 승리 수준으로 충분: 최신 row를 다시 읽어 그 위에 반영한다. */
  private async unpackInBackground(
    id: string,
    userId: string,
    urls: string[],
  ): Promise<void> {
    try {
      const links = await this.unpackAll(urls);
      // 언퍼얼 도중 삭제/수정됐을 수 있으니 최신 row를 다시 읽는다(태그 관계 포함 — save가 조인행을 지우지 않게).
      const message = await this.messages.findOne({
        where: { id, userId },
        relations: { tags: true },
      });
      if (!message) return; // 삭제됨 — 갱신 대상 없음(조용히 스킵).

      this.applyLinks(message, links);
      // og가 채워진 뒤 키워드 매칭: 현재 붙어 있는 태그(수동 + 그 사이 수정분)를 base로 삼아
      // 키워드 매칭분을 합친다(제거는 안 함 — 사용자가 그 사이 뗀 태그는 건드리지 않는다).
      message.tags = await this.mergeKeywordTags(userId, message, message.tags ?? []);
      await this.messages.save(message);
    } catch (err) {
      this.logger.error(
        `백그라운드 언퍼얼 실패 (message=${id}): ${(err as Error)?.message ?? err}`,
      );
    }
  }

  /** 수동 태그 + (이 메시지의 키워드 매칭 태그)를 id 기준 중복 제거해 합친다.
   *  키워드 태그가 하나도 없으면 수동 태그를 그대로 반환한다. */
  private async mergeKeywordTags(
    userId: string,
    message: Message,
    manualTags: Tag[],
  ): Promise<Tag[]> {
    const keyworded = (await this.tags.find({ where: { userId } })).filter(
      (t) => Array.isArray(t.keywords) && t.keywords.length > 0,
    );
    if (keyworded.length === 0) return manualTags;
    const matched = matchKeywordTags(message, keyworded);
    const byId = new Map<string, Tag>();
    for (const t of [...manualTags, ...matched]) byId.set(t.id, t);
    return [...byId.values()];
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

  /** URL 배열을 기존 파이프라인으로 병렬 언퍼얼. 개별 실패는 그 링크만 빈 필드로
   *  (best-effort) — unpackLink가 내부에서 방어하므로 reject되지 않지만, 만일에 대비해
   *  allSettled로 감싸 전체 예외를 원천 차단한다. create·refreshPreview 공용. */
  private async unpackAll(urls: string[]): Promise<MessageLink[]> {
    const settled = await Promise.allSettled(
      urls.map((u) => this.unpackLink(u)),
    );
    return settled.map((res, i) =>
      res.status === 'fulfilled' ? res.value : this.emptyLink(urls[i]),
    );
  }

  /** 언퍼얼된 링크 배열을 메시지에 반영한다. links 배열 + 레거시 단일 필드(links[0])를
   *  함께 갱신해 자동구분·보드·rooms lastMessage 호환을 유지한다. create·refreshPreview 공용. */
  private applyLinks(message: Message, links: MessageLink[]): void {
    message.links = links;
    const [first] = links;
    message.ogTitle = first.ogTitle;
    message.ogDescription = first.ogDescription;
    message.ogImage = first.ogImage;
    message.siteName = first.siteName;
    message.linkType = first.linkType;
    message.linkMeta = first.linkMeta;
  }

  /** 메시지의 링크를 다시 언퍼얼해 미리보기(og·자동구분)를 갱신한다(본인 것만).
   *  간헐적 봇 차단으로 미리보기가 비었을 때 수동 재시도용. 멀티링크면 전부 재시도한다.
   *  내용(content)·태그·분류는 건드리지 않는다 — 링크 미리보기 필드만 새로 채운다. */
  async refreshPreview(userId: string, id: string): Promise<MessageResponse> {
    // 태그 관계를 함께 로드해 save가 조인행을 지우지 않게 한다(update 경로와 동일).
    const message = await this.messages.findOne({
      where: { id, userId },
      relations: { tags: true },
    });
    if (!message) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }

    const urls = this.extractUrls(message.content);
    if (urls.length) {
      const links = await this.unpackAll(urls);
      this.applyLinks(message, links);
      message.url = urls[0];
      message.kind = 'link';
    }

    await this.messages.save(message);
    return (await this.withTagIds([message]))[0];
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
      auto?: AutoQueryFilter;
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
      if (options.tagId === ROOM_ALL) {
        // 태그 전체 방: 태그가 하나 이상 달린 모든 메시지. innerJoin은 태그 수만큼 행이
        // 중복되므로 EXISTS로 존재만 확인한다(조인테이블 message_tags).
        query.andWhere(
          `EXISTS (SELECT 1 FROM message_tags mt WHERE mt."messageId" = m.id)`,
        );
      } else {
        query.innerJoin('m.tags', 't', 't.id = :tagId', { tagId: options.tagId });
      }
    } else if (options.auto) {
      // 멀티링크 메시지는 links 배열의 각 원소 linkType으로 매칭 — 여러 종류가 섞여 있으면
      // 매칭되는 모든 방에 나타난다. links가 비었거나 null인 레거시 행은 단일 필드(m.linkType)로 폴백.
      // memo: kind='text' / link: 자동구분 안 된 링크(linkType null) / 나머지: 그 linkType의 링크
      if (options.auto === ROOM_ALL) {
        // 자동구분 전체 방: 모든 메시지(메모 포함). 별도 필터 없음 — userId 조건만으로 전체를 반환한다.
      } else if (options.auto === 'memo') {
        query.andWhere("m.kind = 'text'");
      } else if (options.auto === 'link') {
        query.andWhere(
          `(
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(coalesce(m."links", '[]'::jsonb)) e
              WHERE e->>'linkType' IS NULL
            )
            OR (
              (m."links" IS NULL OR jsonb_array_length(m."links") = 0)
              AND m.kind = 'link' AND m."linkType" IS NULL
            )
          )`,
        );
      } else {
        query.andWhere(
          `(
            EXISTS (
              SELECT 1 FROM jsonb_array_elements(coalesce(m."links", '[]'::jsonb)) e
              WHERE e->>'linkType' = :autoType
            )
            OR (
              (m."links" IS NULL OR jsonb_array_length(m."links") = 0)
              AND m.kind = 'link' AND m."linkType" = :autoType
            )
          )`,
          { autoType: options.auto },
        );
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

  /** "자동구분" 탭별 개수(전 방 통합). 고정 5키(place·video·item·memo·link) 항상 포함(0 포함).
   *  멀티링크 메시지는 담고 있는 종류마다 각각 1로 잡힌다(종류별 DISTINCT 메시지 수) —
   *  상품+장소 링크가 든 메시지는 item·place 양쪽에서 +1. 한 메시지 안에 같은 종류가
   *  여러 번 있어도 그 종류에선 1(COUNT DISTINCT m.id). memo(kind='text')는 별도 COUNT. */
  async autoCounts(userId: string): Promise<Record<AutoFilter, number>> {
    const counts: Record<AutoFilter, number> = {
      place: 0,
      video: 0,
      item: 0,
      memo: 0,
      link: 0,
    };

    // links 배열이 있으면 각 원소를 펼쳐(linkType null→'link') 종류별 DISTINCT 메시지 수를 센다.
    // links가 비었거나 null인 레거시 링크 행은 단일 필드(m."linkType")로 폴백(두 갈래는 상호배타).
    const rows = await this.messages.query<{ key: string; count: string }[]>(
      `SELECT key, COUNT(DISTINCT id) AS count
       FROM (
         SELECT m.id, coalesce(e->>'linkType', 'link') AS key
         FROM messages m
         CROSS JOIN LATERAL jsonb_array_elements(m."links") e
         WHERE m."userId" = $1
           AND m."links" IS NOT NULL
           AND jsonb_array_length(m."links") > 0
         UNION ALL
         SELECT m.id, coalesce(m."linkType", 'link') AS key
         FROM messages m
         WHERE m."userId" = $1
           AND m.kind = 'link'
           AND (m."links" IS NULL OR jsonb_array_length(m."links") = 0)
       ) sub
       GROUP BY key`,
      [userId],
    );

    for (const row of rows) {
      // 레거시 'article' 등 고정 5키에 없는 값은 무시(article은 데이터 정리로 이미 null→'link').
      const key = row.key as AutoFilter;
      if (key in counts) counts[key] = Number(row.count);
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
      // 전체 교체. 중복 id는 합치고, 내 소유가 아닌/없는 id가 있으면 400(create와 동일 경로).
      message.tags = await this.resolveTags(userId, dto.tagIds);
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

  /** 본인 메시지 단건 조회(목록 응답과 동일한 직렬화 — tagIds 포함). 프론트가 비동기 미리보기가
   *  채워졌는지 폴링으로 재조회할 때 쓴다. 없거나 남의 것이면 404. */
  async findOneOwned(userId: string, id: string): Promise<MessageResponse> {
    const message = await this.messages.findOne({ where: { id, userId } });
    if (!message) {
      throw new NotFoundException('메시지를 찾을 수 없습니다.');
    }
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
