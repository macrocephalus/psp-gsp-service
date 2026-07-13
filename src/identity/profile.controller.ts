import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './auth.service';
import { UsersService } from '../users/users.service';

@ApiTags('profile')
@ApiBearerAuth()
@Controller('profile')
export class ProfileController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: JwtPayload) {
    // Сознательно читаем через scoped-путь (внутри UsersService): это прогоняет
    // всю цепочку JWT → middleware-store → interceptor → ALS сквозь хендлер.
    const dbUser = await this.usersService.findByIdScoped(user.sub);
    if (!dbUser) {
      throw new NotFoundException('User not found');
    }
    return { userId: dbUser.id, brandId: dbUser.brandId, email: dbUser.email };
  }
}
