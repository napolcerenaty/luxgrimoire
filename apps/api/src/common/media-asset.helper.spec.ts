import { resolveAssetUrl, mapAssetFields } from './media-asset.helper';

describe('resolveAssetUrl', () => {
  it('prefers the asset publicId when both asset and legacy value are set', () => {
    expect(resolveAssetUrl({ publicId: 'lux/asset-1' }, 'lux/legacy-1')).toBe('lux/asset-1');
  });

  it('falls back to the legacy value when there is no asset', () => {
    expect(resolveAssetUrl(null, 'lux/legacy-1')).toBe('lux/legacy-1');
    expect(resolveAssetUrl(undefined, 'lux/legacy-1')).toBe('lux/legacy-1');
  });

  it('returns the asset publicId when the legacy value is missing', () => {
    expect(resolveAssetUrl({ publicId: 'lux/asset-1' }, null)).toBe('lux/asset-1');
  });

  it('returns null when neither asset nor legacy value is set', () => {
    expect(resolveAssetUrl(null, null)).toBeNull();
    expect(resolveAssetUrl(undefined, undefined)).toBeNull();
  });

  it('treats an empty-string legacy value as unset', () => {
    expect(resolveAssetUrl(null, '')).toBeNull();
    expect(resolveAssetUrl({ publicId: 'lux/asset-1' }, '')).toBe('lux/asset-1');
  });
});

describe('mapAssetFields', () => {
  it('replaces each mapped field with its resolved asset/legacy value', () => {
    const company = {
      id: 'company-1',
      logoUrl: 'lux/legacy-logo',
      logoAsset: { publicId: 'lux/asset-logo' },
    };
    expect(mapAssetFields(company, { logoUrl: 'logoAsset' })).toEqual({
      id: 'company-1',
      logoUrl: 'lux/asset-logo',
      logoAsset: { publicId: 'lux/asset-logo' },
    });
  });

  it('handles multiple field pairs at once', () => {
    const subscription = {
      id: 'sub-1',
      coverImage: 'lux/legacy-cover',
      coverImageAsset: null,
      logoUrl: null,
      logoAsset: { publicId: 'lux/asset-logo' },
    };
    expect(mapAssetFields(subscription, { coverImage: 'coverImageAsset', logoUrl: 'logoAsset' })).toEqual({
      id: 'sub-1',
      coverImage: 'lux/legacy-cover',
      coverImageAsset: null,
      logoUrl: 'lux/asset-logo',
      logoAsset: { publicId: 'lux/asset-logo' },
    });
  });

  it('passes through null/undefined entities unchanged', () => {
    expect(mapAssetFields(null, { logoUrl: 'logoAsset' })).toBeNull();
    expect(mapAssetFields(undefined, { logoUrl: 'logoAsset' })).toBeUndefined();
  });
});
