import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
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
