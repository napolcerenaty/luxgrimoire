import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  Request,
  Put,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/auth.decorators';
import { SkipPolicyEngine } from './skip-policy.engine';
import { SkipPolicyAdminService } from './skip-policy-admin.service';
import { UpsertSkipPolicyDto } from './skip-policy.dto';

@Controller('skip-policy')
export class SkipPolicyController {
  constructor(
    private readonly engine: SkipPolicyEngine,
    private readonly adminService: SkipPolicyAdminService,
  ) {}

  // ─── User endpoints ────────────────────────────────────────────────

  /** GET /skip-policy/:slug/status — get current skip status for the logged-in user */
  @Get(':slug/status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Param('slug') slug: string, @Request() req: { user: { id: string } }) {
    return this.engine.getStatus(req.user.id, slug);
  }

  /** POST /skip-policy/:slug/skip/:year/:month — record a skip */
  @Post(':slug/skip/:year/:month')
  @UseGuards(JwtAuthGuard)
  recordSkip(
    @Param('slug') slug: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Request() req: { user: { id: string } },
  ) {
    return this.engine.recordSkip(req.user.id, slug, year, month);
  }

  /** DELETE /skip-policy/:slug/skip/:year/:month — undo a skip (TODO: reversal policy) */
  @Delete(':slug/skip/:year/:month')
  @UseGuards(JwtAuthGuard)
  undoSkip(
    @Param('slug') slug: string,
    @Param('year', ParseIntPipe) year: number,
    @Param('month', ParseIntPipe) month: number,
    @Request() req: { user: { id: string } },
  ) {
    return this.engine.undoSkip(req.user.id, slug, year, month);
  }

  @Post(':slug/series/:seriesSlug/skip')
  @ApiOperation({ summary: 'Skip entire series (SERIES_ONLY series)' })
  @ApiBearerAuth()
  recordSeriesSkip(
    @Param('slug') slug: string,
    @Param('seriesSlug') seriesSlug: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.engine.recordSeriesSkip(req.user.id, slug, seriesSlug);
  }

  @Delete(':slug/series/:seriesSlug/skip')
  @ApiOperation({ summary: 'Undo series skip' })
  @ApiBearerAuth()
  undoSeriesSkip(
    @Param('slug') slug: string,
    @Param('seriesSlug') seriesSlug: string,
    @Request() req: { user: { id: string } },
  ) {
    return this.engine.undoSeriesSkip(req.user.id, slug, seriesSlug);
  }



  /** PUT /skip-policy/:slug — upsert skip policy for a subscription */
  @Put(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'COMPANY_MANAGER')
  upsertPolicy(
    @Param('slug') slug: string,
    @Body() dto: UpsertSkipPolicyDto,
    @Request() req: { user: { id: string; role: string } },
  ) {
    return this.adminService.upsertPolicy(slug, dto, req.user);
  }

  /** GET /skip-policy/:slug — get policy for a subscription */
  @Get(':slug')
  getPolicy(@Param('slug') slug: string) {
    return this.adminService.getPolicy(slug);
  }

  /** DELETE /skip-policy/:slug — remove policy (resets to NONE) */
  @Delete(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removePolicy(@Param('slug') slug: string) {
    return this.adminService.removePolicy(slug);
  }
}
