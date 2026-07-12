import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty({ message: '내용을 입력해주세요.' })
  content: string;

  @IsOptional()
  @IsUUID()
  friendId?: string;
}

export class UpdateMessageDto {
  // null이면 분류 해제("나에게"만 남음), 값이 있으면 해당 친구로 분류
  @IsOptional()
  @IsUUID()
  friendId?: string | null;
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
}
