import { Module } from '@nestjs/common';
import { HomepageFeaturesController } from './homepage-features.controller';
import { HomepageFeaturesService } from './homepage-features.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [HomepageFeaturesController],
  providers: [HomepageFeaturesService],
})
export class HomepageFeaturesModule {}
