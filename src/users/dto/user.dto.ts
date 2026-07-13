import { Expose, plainToInstance } from 'class-transformer';
import { User } from '../user.entity';

/**
 * Whitelist-сериализация: в ответ попадают только поля с @Expose,
 * поэтому passwordHash не утечёт, даже если entity вернут целиком.
 * Забытый @Expose молча выбрасывает поле — набор полей закреплён тестом.
 */
export class UserDto {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() brandId: string;

  static from(entity: User): UserDto {
    return plainToInstance(UserDto, entity, {
      excludeExtraneousValues: true,
    });
  }
}
