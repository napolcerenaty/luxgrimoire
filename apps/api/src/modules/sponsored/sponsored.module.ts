import { Module } from '@nestjs/common';
import { SponsoredController } from './sponsored.controller';
import { SponsoredService } from './sponsored.service';

@Module({
  controllers: [SponsoredController],
  providers: [SponsoredService],
})
export class SponsoredModule {}
