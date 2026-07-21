import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsHexColor,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SocialLoginDto {
  // 앱이 provider(구글 등)에서 받은 idToken/access token.
  @IsString()
  token: string;
}

export class LookupDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;
}

export class RegisterDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  password: string;
}

export class LoginDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @IsString()
  password: string;
}

export class VerifyCodeDto {
  @Matches(/^\d{6}$/, { message: '6자리 숫자 코드를 입력해주세요.' })
  code: string;
}

// 코드 방식 비밀번호 재설정 (로그아웃 상태라 이메일도 함께 받는다).
export class ResetPasswordCodeDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @Matches(/^\d{6}$/, { message: '6자리 숫자 코드를 입력해주세요.' })
  code: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  password: string;
}

// 프로필 부분 갱신: 이름·전체 프로필 색 각각 선택. 보낸 필드만 반영한다.
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: '이름을 입력해주세요.' })
  @MaxLength(30, { message: '이름은 30자 이하여야 합니다.' })
  displayName?: string;

  // "전체" 방 프로필 색(hex). 검증된 hex만 허용.
  @IsOptional()
  @IsHexColor()
  selfColor?: string;

  // "전체" 방 설명(상태메시지). 빈 문자열을 보내면 지운다(null 저장) — 부분 갱신 의미론.
  @IsOptional()
  @IsString()
  @MaxLength(80, { message: '설명은 80자 이내로 입력해주세요.' })
  selfDescription?: string;

  // 저장된 커스텀 프로필 색 목록(hex). 각 원소 hex 검증, 최대 16개.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16, { message: '커스텀 색은 16개까지 저장할 수 있습니다.' })
  @IsHexColor({ each: true })
  customColors?: string[];

  // 자동구분 카테고리 순서. AUTO_ORDER_CATEGORIES의 순열인지는 서비스에서 검증
  // (아니면 400 invalid_auto_order).
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  autoOrder?: string[];
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8, { message: '비밀번호는 8자 이상이어야 합니다.' })
  password: string;

  // 재설정 폼이 hidden으로 함께 보내는 결과 페이지 언어.
  @IsOptional()
  @IsString()
  lang?: string;
}
