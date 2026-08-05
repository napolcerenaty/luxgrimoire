/**
 * Resolve the display value for an image field that has both a MediaAsset relation
 * and a legacy string column, preferring the asset. Empty-string legacy values are
 * treated as unset (some historical rows have "" instead of null).
 */
export function resolveAssetUrl(
  asset: { publicId: string } | null | undefined,
  legacyValue: string | null | undefined,
): string | null {
  return asset?.publicId ?? (legacyValue || null);
}

/**
 * Merge one or more asset-backed fields onto an entity, replacing each legacy
 * field's value with resolveAssetUrl(entity[assetField], entity[legacyField]).
 * fieldMap: { legacyField: assetRelationField }
 * Usage: mapAssetFields(company, { logoUrl: 'logoAsset' })
 */
export function mapAssetFields<T extends Record<string, any>>(
  entity: T | null | undefined,
  fieldMap: Record<string, string>,
): T | null | undefined {
  if (!entity) return entity;
  const patch: Record<string, any> = {};
  for (const [legacyField, assetField] of Object.entries(fieldMap)) {
    patch[legacyField] = resolveAssetUrl(entity[assetField], entity[legacyField]);
  }
  return { ...entity, ...patch };
}
