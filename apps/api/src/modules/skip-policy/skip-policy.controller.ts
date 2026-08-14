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
import { UpsertSkipPolicyDto, PreviewRecomputeDto } from './skip-policy.dto';

@Controller('skip-policy')
export class SkipPolicyController {
  constructor(
    private readonly engine: SkipPolicyEngine,
    private readonly adminService: SkipPolicyAdminService,
  ) {}

  // ─── User endpoints ────────────────────────────────────────────────

  /** GET /skip-policy/my-skipped — all skipped months with book details for the logged-in user */
  @Get('my-skipped')
  @UseGuards(JwtAuthGuard)
  getAllSkipped(@Request() req: { user: { id: string } }) {
    return this.engine.getAllSkippedMonths(req.user.id);
  }

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



  /** PUT /skip-policy/:slug — upsert skip policy (backward compat, billingType=ALL) */
  @Put(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  upsertPolicy(
    @Param('slug') slug: string,
    @Body() dto: UpsertSkipPolicyDto,
    @Request() req: { user: { id: string; role: string } },
  ) {
    return this.adminService.upsertPolicy(slug, dto, req.user);
  }

  /** GET /skip-policy/:slug — get policy for a subscription (backward compat) */
  @Get(':slug')
  @Public()
  getPolicy(@Param('slug') slug: string) {
    return this.adminService.getPolicy(slug);
  }

  /** DELETE /skip-policy/:slug — remove all policies (resets to NONE) */
  @Delete(':slug')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  removePolicy(@Param('slug') slug: string) {
    return this.adminService.removePolicies(slug);
  }

  // ─── Multi-policy endpoints ────────────────────────────────────────

  /** GET /skip-policy/:slug/policies — get all policies (one per billing type) */
  @Get(':slug/policies')
  @Public()
  getPolicies(@Param('slug') slug: string) {
    return this.adminService.getPolicies(slug);
  }

  /** PUT /skip-policy/:slug/policies/:billingType — upsert policy for a billing type */
  @Put(':slug/policies/:billingType')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  upsertPolicyForBillingType(
    @Param('slug') slug: string,
    @Param('billingType') billingType: string,
    @Body() dto: UpsertSkipPolicyDto,
    @Request() req: { user: { id: string; role: string } },
  ) {
    return this.adminService.upsertPolicy(slug, dto, req.user, billingType);
  }

  /** DELETE /skip-policy/:slug/policies/:billingType — remove policy for a billing type */
  @Delete(':slug/policies/:billingType')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  removePolicyForBillingType(
    @Param('slug') slug: string,
    @Param('billingType') billingType: string,
  ) {
    return this.adminService.removePolicy(slug, billingType);
  }

  /**
   * POST /skip-policy/:slug/policies/:billingType/recompute-preview — estimate how many active
   * users' skip windows would change under a PROPOSED (not-yet-saved) type/windowMonths.
   */
  @Post(':slug/policies/:billingType/recompute-preview')
  @ApiOperation({ summary: 'Preview impact of a skip-policy config change before saving it' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  previewRecompute(
    @Param('slug') slug: string,
    @Param('billingType') billingType: string,
    @Body() dto: PreviewRecomputeDto,
    @Request() req: { user: { id: string; role: string } },
  ) {
    return this.adminService.previewRecompute(slug, billingType, dto.type, dto.windowMonths, req.user);
  }

  /**
   * POST /skip-policy/:slug/policies/:billingType/recompute — recompute skip windows for all
   * active users under the CURRENTLY SAVED policy. Manual, admin-triggered only.
   */
  @Post(':slug/policies/:billingType/recompute')
  @ApiOperation({ summary: 'Recompute skip windows for all active users under the saved policy' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MODERATOR', 'COMPANY_MANAGER')
  applyRecompute(
    @Param('slug') slug: string,
    @Param('billingType') billingType: string,
    @Request() req: { user: { id: string; role: string } },
  ) {
    return this.adminService.applyRecompute(slug, billingType, req.user);
  }
}
