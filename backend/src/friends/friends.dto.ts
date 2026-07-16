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

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

// 분류 탭 수동 정렬: 화면에 보이는 순서 그대로의 분류 id 배열을 보낸다(전부 본인 소유여야 함).
export class ReorderFriendsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}
