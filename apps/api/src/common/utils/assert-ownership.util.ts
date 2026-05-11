import { ForbiddenException } from '@nestjs/common';

/**
 * Throws ForbiddenException if the resource does not belong to the requesting user.
 * Use in service methods after fetching a record that has a `userId` field.
 */
export function assertOwnership(resourceUserId: string, requestingUserId: string): void {
  if (resourceUserId !== requestingUserId) throw new ForbiddenException();
}
