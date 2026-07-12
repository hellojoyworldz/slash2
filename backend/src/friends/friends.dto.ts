import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateFriendDto {
  @IsString()
  @IsNotEmpty({ message: '이름을 입력해주세요.' })
  @MaxLength(30, { message: '이름은 30자 이내로 입력해주세요.' })
  name: string;
}

export class UpdateFriendDto {
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
