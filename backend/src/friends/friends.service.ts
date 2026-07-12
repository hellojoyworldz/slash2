import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Friend } from './friend.entity';

@Injectable()
export class FriendsService {
  constructor(
    @InjectRepository(Friend)
    private readonly friends: Repository<Friend>,
  ) {}

  list(userId: string): Promise<Friend[]> {
    return this.friends.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async create(userId: string, name: string): Promise<Friend> {
    const trimmed = name.trim();
    const existing = await this.friends.findOne({
      where: { userId, name: trimmed },
    });
    if (existing) {
      throw new ConflictException('이미 같은 이름의 친구가 있어요.');
    }
    const friend = this.friends.create({ userId, name: trimmed });
    return this.friends.save(friend);
  }

  async update(
    userId: string,
    id: string,
    changes: { pinned?: boolean },
  ): Promise<Friend> {
    const friend = await this.friends.findOne({ where: { id, userId } });
    if (!friend) {
      throw new NotFoundException('친구를 찾을 수 없습니다.');
    }
    if (changes.pinned !== undefined) {
      friend.pinned = changes.pinned;
    }
    return this.friends.save(friend);
  }

  async remove(userId: string, id: string): Promise<void> {
    const friend = await this.friends.findOne({ where: { id, userId } });
    if (!friend) {
      throw new NotFoundException('친구를 찾을 수 없습니다.');
    }
    await this.friends.remove(friend);
  }
}
