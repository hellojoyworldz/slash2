import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string) {
    const existing = await this.users.findOneBy({ email });
    if (existing) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }
    const user = this.users.create({
      email,
      passwordHash: await hash(password, 10),
    });
    await this.users.save(user);
    return this.issueToken(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findOneBy({ email });
    if (!user || !(await compare(password, user.passwordHash))) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    return this.issueToken(user);
  }

  private issueToken(user: User) {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return {
      token: this.jwt.sign(payload),
      user: { id: user.id, email: user.email },
    };
  }
}
