import {
  IsEmail,
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

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: '이름을 입력해주세요.' })
  @MaxLength(30, { message: '이름은 30자 이하여야 합니다.' })
  displayName: string;
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
