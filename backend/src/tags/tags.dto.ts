import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// 태그 생성/수정 공용 형태. name은 서비스에서 트림 후 빈이면 400, 중복이면 409(tag_name_taken).
export class CreateTagDto {
  @IsString()
  @IsNotEmpty({ message: '태그 이름을 입력해주세요.' })
  name: string;
}

// 태그 수정: 이름·고정 모두 부분 갱신(키가 있을 때만 반영). friends의 UpdateFriendDto와 같은 관례.
export class UpdateTagDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: '태그 이름을 입력해주세요.' })
  name?: string;

  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

// 태그 목록 수동 정렬: 화면에 보이는 순서 그대로의 태그 id 배열을 보낸다(전부 본인 소유여야 함).
// friends의 ReorderFriendsDto와 완전히 같은 관례.
export class ReorderTagsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  ids: string[];
}
