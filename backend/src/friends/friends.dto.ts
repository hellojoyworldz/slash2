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
} from 'class-validator';

export class CreateFriendDto {
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해주세요.' })
  @MaxLength(30, { message: '이름은 30자 이내로 입력해주세요.' })
  name: string;

  // 분류 배경색 (hex). 아바타·말풍선 색의 원천.
  @IsOptional()
  @IsHexColor()
  color?: string;

  // 상태메시지 (카톡 프로필 상태메시지처럼). 선택 입력.
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: '설명은 80자 이내로 입력해주세요.' })
  description?: string;
}

// 분류 수정: 이름·프로필(색)·고정 모두 부분 갱신. 이름은 create와 동일 규칙.
export class UpdateFriendDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해주세요.' })
  @MaxLength(30, { message: '이름은 30자 이내로 입력해주세요.' })
  name?: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  // 상태메시지. 빈 문자열을 보내면 지운다(null 저장) — 부분 갱신 의미론.
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: '설명은 80자 이내로 입력해주세요.' })
  description?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  // 즐겨찾기 표시 여부. pinned와 별개 — 정렬에는 영향 없음.
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}

// 분류 탭 수동 정렬: 화면에 보이는 순서 그대로의 분류 id 배열을 보낸다(전부 본인 소유여야 함).
export class ReorderFriendsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}

// 즐겨찾기 목록 수동 정렬: 화면에 보이는 순서 그대로의 즐겨찾기 분류 id 배열을 보낸다
// (전부 본인 소유 + favorite=true여야 함).
export class ReorderFavoriteFriendsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}
