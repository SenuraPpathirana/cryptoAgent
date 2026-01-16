import { createModuleLogger } from '../../config/logger';

const logger = createModuleLogger('UsersRepository');

interface User {
  id: string;
  telegramId: number;
  username?: string;
  createdAt: Date;
}

export class UsersRepository {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  public async create(user: User): Promise<User> {
    this.users.set(user.id, user);
    logger.debug(`User created: ${user.id}`);
    return user;
  }

  public async findById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  public async findByTelegramId(telegramId: number): Promise<User | null> {
    return Array.from(this.users.values()).find(u => u.telegramId === telegramId) || null;
  }
}
