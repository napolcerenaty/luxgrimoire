import {
  Controller, Get, Post, Delete, Body, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('push')
@ApiBearerAuth()
@Controller('push')
export class PushController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { key: process.env.VAPID_PUBLIC_KEY ?? '' };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  async subscribe(
    @CurrentUser() user: { id: string },
    @Body() body: { endpoint: string; p256dh: string; auth: string },
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      create: { userId: user.id, endpoint: body.endpoint, p256dh: body.p256dh, auth: body.auth },
      update: { userId: user.id, p256dh: body.p256dh, auth: body.auth, lastError: null, failedAt: null },
    });
    return { ok: true };
  }

  @Delete('subscribe')
  @HttpCode(HttpStatus.OK)
  async unsubscribe(
    @CurrentUser() user: { id: string },
    @Body() body: { endpoint: string },
  ) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId: user.id, endpoint: body.endpoint },
    });
    return { ok: true };
  }
}
