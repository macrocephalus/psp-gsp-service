import { User } from '../user.entity';
import { UserDto } from './user.dto';

describe('UserDto', () => {
  it('exposes exactly id/email/brandId and never passwordHash', () => {
    const entity: User = {
      id: 'u-1',
      brandId: 'brandA',
      email: 'user@example.com',
      passwordHash: '$argon2id$secret',
      createdAt: new Date(),
    };

    const dto = UserDto.from(entity);

    // фиксируем полный набор полей: забытый @Expose молча выбросил бы поле
    expect({ ...dto }).toEqual({
      id: 'u-1',
      email: 'user@example.com',
      brandId: 'brandA',
    });
  });
});
