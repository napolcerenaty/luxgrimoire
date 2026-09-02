import { IsOptional, IsString, IsIn, IsInt, Min, IsBoolean, ValidateIf, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class AuditLogQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() @IsIn(['createdAt', 'action', 'entityType', 'username']) sortBy?: string = 'createdAt';
  @IsOptional() @IsString() @IsIn(['asc', 'desc']) order?: string = 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number = 30;
}

export class RecentEditionsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() @IsIn(['createdAt', 'updatedAt', 'title']) sortBy?: string = 'updatedAt';
  @IsOptional() @IsString() @IsIn(['asc', 'desc']) order?: string = 'desc';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number = 30;
}

export class AssignRoleDto {
  @IsString()
  role!: string;

  @IsOptional()
  @IsString()
  managedCompanyId?: string;
}

export class UserQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number = 20;
}

export class SetMaintenanceDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  message?: string;
}

export class UpdateCompanyDataCheckDto {
  /** When true, stamp checkedAt = now and record the actor as checkedByName. */
  @IsOptional()
  @IsBoolean()
  touch?: boolean;

  /** Overwrites the single note field. Empty string / null both clear it. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
