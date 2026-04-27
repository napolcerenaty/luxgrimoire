import { Module } from '@nestjs/common';
import { ImportSourcesController } from './import-sources.controller';
import { ImportSourcesService } from './import-sources.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ImportSourcesController],
  providers: [ImportSourcesService],
  exports: [ImportSourcesService],
})
export class ImportSourcesModule {}
