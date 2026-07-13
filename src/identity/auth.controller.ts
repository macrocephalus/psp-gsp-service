import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import type { JwtPayload } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOkResponse({
    description:
      'Returns accessToken (JWT, short-lived, backed by a server-side session)',
  })
  @ApiUnauthorizedResponse({
    description:
      'Unknown user or wrong password (identical response to avoid enumeration)',
  })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOkResponse({
    description:
      'Extends the current session and returns a fresh accessToken. ' +
      'Requires a still-valid token; the session lifetime is capped by SESSION_MAX_LIFETIME.',
  })
  @ApiUnauthorizedResponse({
    description:
      'Token expired/invalid, session revoked, or session max lifetime exceeded',
  })
  refresh(@CurrentUser() user: JwtPayload) {
    return this.authService.refresh(user);
  }
}
