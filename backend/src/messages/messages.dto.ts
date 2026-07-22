import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { AUTO_QUERY_FILTERS, ROOM_ALL } from './message.entity';
import type { AutoQueryFilter } from './message.entity';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty({ message: '내용을 입력해주세요.' })
  content: string;

  @IsOptional()
  @IsUUID()
  friendId?: string;

  // tagIds: 키가 있으면 생성 시 이 태그들을 부착(중복 id는 합침, 빈 배열이면 미부착).
  // 내 소유가 아닌/없는 태그 id가 섞이면 서비스에서 400. (UpdateMessageDto.tagIds와 동일 검증 관례)
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];
}

export class UpdateMessageDto {
  // 부분 업데이트: 키 자체가 body에 없으면(undefined) 해당 필드는 그대로 둔다.
  // content: 값이 있으면 내용 갱신(trim 후 빈 문자열이면 서비스에서 400). CreateMessageDto의 content 검증 관례와 동일.
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '내용을 입력해주세요.' })
  content?: string;

  // friendId: null이면 분류 해제("나에게"만 남음), 값이 있으면 해당 친구로 분류, 키가 없으면 미변경.
  @IsOptional()
  @IsUUID()
  friendId?: string | null;

  // tagIds: 키가 있으면 전체 교체(빈 배열이면 모두 해제), 키가 없으면 미변경.
  // 내 소유가 아닌/없는 태그 id가 섞이면 서비스에서 400.
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];

  // notice: true면 공지 등록(같은 방의 기존 공지 자동 해제), false면 해제, 키가 없으면 미변경.
  @IsOptional()
  @IsBoolean()
  notice?: boolean;
}

// GET /messages/notice 쿼리. friendId 생략 = "나에게"(friendId null) 방.
export class NoticeQuery {
  @IsOptional()
  @IsUUID()
  friendId?: string;
}

export class ListMessagesQuery {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @IsUUID()
  friendId?: string;

  // 있으면 friendId 필터는 무시하고 전체 방을 가로질러 이 값 기준으로 필터한다.
  // 특수값 'all' = 자동구분(링크)이 하나라도 잡힌 전체 방.
  @IsOptional()
  @IsIn(AUTO_QUERY_FILTERS)
  auto?: AutoQueryFilter;

  // 있으면 auto/friendId 필터를 모두 무시하고 전체 방을 가로질러 이 태그가 붙은 메시지만 반환한다.
  // (tagId가 auto보다 우선 — 서비스에서 처리). 특수값 'all' = 태그가 하나 이상 달린 전체 방
  // (uuid가 아니므로 그때만 IsUUID 검증을 건너뛴다).
  @IsOptional()
  @ValidateIf((o) => o.tagId !== ROOM_ALL)
  @IsUUID()
  tagId?: string;
}
