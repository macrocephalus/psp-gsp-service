import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantScopedRepositoryFactory } from '../persistence/tenant-scoped.repository';
import { User } from './user.entity';

/**
 * Единственный владелец таблицы users: все инварианты (нормализация email,
 * уникальность brandId+email) живут здесь. Остальные модули не инжектят
 * Repository<User> — только этот сервис.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly repoFactory: TenantScopedRepositoryFactory,
  ) {}

  async createUser(input: {
    brandId: string;
    email: string;
    passwordHash: string;
  }): Promise<User> {
    try {
      return await this.users.save(
        this.users.create({
          brandId: input.brandId,
          email: input.email.toLowerCase(),
          passwordHash: input.passwordHash,
        }),
      );
    } catch (e: unknown) {
      if (this.isUniqueViolation(e)) {
        throw new ConflictException(
          'User with this email already exists for this brand',
        );
      }
      throw e;
    }
  }

  findByBrandAndEmail(brandId: string, email: string): Promise<User | null> {
    return this.users.findOne({
      where: { brandId, email: email.toLowerCase() },
    });
  }

  /**
   * Чтение в рамках текущего тенанта (brandId берётся из ALS-контекста
   * запроса, а не из аргументов) — для авторизованных эндпоинтов.
   */
  findByIdScoped(id: string): Promise<User | null> {
    return this.repoFactory.for(User).findOneScoped({ id });
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code: string }).code === '23505'
    );
  }
}
