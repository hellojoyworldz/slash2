import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// 태그 생성/수정 공용 형태. name은 서비스에서 트림 후 빈이면 400, 중복이면 409(tag_name_taken).
export class CreateTagDto {
  @IsString()
  @IsNotEmpty({ message: '태그 이름을 입력해주세요.' })
  name: string;

  // 태그 프로필 색 (hex). # 타일 배경의 원천. friends 생성과 같은 관례.
  @IsOptional()
  @IsHexColor()
  color?: string;

  // 상태메시지(선택). 빈 문자열/공백은 서비스에서 null로 저장 — friends 생성과 같은 관례.
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: '설명은 80자 이내로 입력해주세요.' })
  description?: string;
}

// 태그 수정: 이름·고정 모두 부분 갱신(키가 있을 때만 반영). friends의 UpdateFriendDto와 같은 관례.
export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '태그 이름을 입력해주세요.' })
  name?: string;

  // 태그 프로필 색. friends 수정과 같은 계약: 키 없음(undefined)=미변경, 명시적 null=무채(색 없음)로 변경,
  // hex=그 색으로 변경. ValidateIf로 null만 통과시키고 값이 있으면 hex로 검증한다.
  @ValidateIf((o) => o.color !== null && o.color !== undefined)
  @IsHexColor()
  color?: string | null;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  // 상태메시지. 빈 문자열을 보내면 지운다(null 저장) — 부분 갱신 의미론.
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: '설명은 80자 이내로 입력해주세요.' })
  description?: string;

  // 즐겨찾기 표시 여부. pinned와 별개 — 정렬에는 영향 없음.
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}

// 태그 목록 수동 정렬: 화면에 보이는 순서 그대로의 태그 id 배열을 보낸다(전부 본인 소유여야 함).
// friends의 ReorderFriendsDto와 완전히 같은 관례.
export class ReorderTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}

// 즐겨찾기 목록 수동 정렬: 화면에 보이는 순서 그대로의 즐겨찾기 태그 id 배열을 보낸다
// (전부 본인 소유 + favorite=true여야 함). friends의 ReorderFavoriteFriendsDto와 완전히 같은 관례.
export class ReorderFavoriteTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}
