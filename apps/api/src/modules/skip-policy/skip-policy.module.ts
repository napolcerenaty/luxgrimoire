import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SkipPolicyEngine } from './skip-policy.engine';
import { SkipPolicyAdminService } from './skip-policy-admin.service';
import { SkipPolicyController } from './skip-policy.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SkipPolicyController],
  providers: [SkipPolicyEngine, SkipPolicyAdminService],
  exports: [SkipPolicyEngine],
})
export class SkipPolicyModule {}
