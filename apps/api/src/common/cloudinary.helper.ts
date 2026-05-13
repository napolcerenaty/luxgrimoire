import { UploadService } from '../modules/upload/upload.service';

/**
 * Delete Cloudinary images by their public IDs.
 * HTTP URLs (external images) are silently ignored.
 */
export async function deleteCloudinaryImages(
  ids: (string | null | undefined)[],
  uploadService: UploadService,
): Promise<void> {
  const valid = ids.filter((id): id is string => !!id && !id.startsWith('http'));
  if (!valid.length) return;
  await Promise.allSettled(valid.map((id) => uploadService.deleteImage(id)));
}
