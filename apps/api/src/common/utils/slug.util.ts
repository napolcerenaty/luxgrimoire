import slugify from 'slugify';
import { randomBytes } from 'crypto';

export function generateSlug(name: string): string {
  const base = slugify(name, { lower: true, strict: true, trim: true });
  const suffix = randomBytes(4).toString('hex'); // 8 chars
  return `${base}-${suffix}`;
}

export function generateSlugFromParts(...parts: (string | null | undefined)[]): string {
  const filtered = parts.filter(Boolean).join(' ');
  return generateSlug(filtered);
}
