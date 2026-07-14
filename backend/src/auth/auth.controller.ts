import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { resolveLocale } from '../i18n/messages';
import { CurrentUser } from './current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  LookupDto,
  RegisterDto,
  ResetPasswordCodeDto,
  ResetPasswordDto,
  SocialLoginDto,
  UpdateProfileDto,
  VerifyCodeDto,
} from './auth.dto';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { page, resetForm } from './auth.pages';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── 이메일/비밀번호 ──
  @Post('register')
  register(@Body() dto: RegisterDto, @Headers('x-app-lang') lang?: string) {
    return this.auth.register(dto.email, dto.password, resolveLocale(lang));
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  // 이메일만 받아 다음 단계(new/password/social)를 알려준다 (identifier-first).
  @Post('lookup')
  @HttpCode(200)
  lookup(@Body() dto: LookupDto) {
    return this.auth.lookupEmail(dto.email);
  }

  // ── 소셜 ──
  // SNS 로그인/회원가입. provider = google | kakao | naver ...
  @Post('social/:provider')
  socialLogin(
    @Param('provider') provider: string,
    @Body() dto: SocialLoginDto,
  ) {
    return this.auth.socialLogin(provider, dto.token);
  }

  // 인증 메일 다시 보내기 (로그인 필요).
  @Post('resend-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  resendVerification(
    @CurrentUser() user: { id: string },
    @Headers('x-app-lang') lang?: string,
  ) {
    return this.auth.resendVerification(user.id, resolveLocale(lang));
  }

  // 코드 방식 인증(멀티플랫폼): 로그인 상태에서 6자리 코드 입력.
  @Post('verify-email-code')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async verifyEmailCode(
    @CurrentUser() user: { id: string },
    @Body() dto: VerifyCodeDto,
  ) {
    const verified = await this.auth.verifyEmailByCode(user.id, dto.code);
    return { verified };
  }

  // ── 이메일 인증 (메일 속 링크로 열리는 페이지) ──
  @Get('verify-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async verifyEmail(@Query('token') token: string, @Query('lang') lang?: string) {
    const locale = resolveLocale(lang);
    const ok = await this.auth.verifyEmail(token);
    return ok
      ? page(locale, 'page.verifyOkTitle', 'page.verifyOkMsg')
      : page(locale, 'page.verifyFailTitle', 'page.verifyFailMsg');
  }

  // ── 비밀번호 재설정 ──
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Headers('x-app-lang') lang?: string,
  ) {
    await this.auth.requestPasswordReset(dto.email, resolveLocale(lang));
    // 계정 존재 여부를 노출하지 않도록 항상 같은 응답.
    return { ok: true };
  }

  // 코드 방식 재설정(멀티플랫폼): 앱 안에서 이메일+코드+새 비번.
  @Post('reset-password-code')
  @HttpCode(200)
  async resetPasswordCode(@Body() dto: ResetPasswordCodeDto) {
    const reset = await this.auth.resetPasswordByCode(
      dto.email,
      dto.code,
      dto.password,
    );
    return { reset };
  }

  // 메일 속 링크로 열리는 비밀번호 입력 폼.
  @Get('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  resetPasswordForm(@Query('token') token: string, @Query('lang') lang?: string) {
    return resetForm(token ?? '', resolveLocale(lang));
  }

  // 위 폼 제출 처리 (HTML 응답).
  @Post('reset-password')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const locale = resolveLocale(dto.lang);
    const ok = await this.auth.resetPassword(dto.token, dto.password);
    return ok
      ? page(locale, 'page.resetOkTitle', 'page.resetOkMsg')
      : page(locale, 'page.resetFailTitle', 'page.resetFailMsg');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: string }) {
    return this.auth.getProfile(user.id);
  }

  // 표시 이름 변경.
  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user.id, dto.displayName);
  }
}
