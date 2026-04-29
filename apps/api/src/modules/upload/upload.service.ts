import { Injectable, BadRequestException } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const SSRF_BLOCKED_RE = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.0\.0\.0|::1)/i;

function validateUploadUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new BadRequestException('URL must use http or https');
  }
  if (SSRF_BLOCKED_RE.test(parsed.hostname)) {
    throw new BadRequestException('URL points to a disallowed host');
  }
}

const EAGER_TRANSFORMS = [
  { width: 400,  height: 600,  crop: 'fill' as const, quality: 'auto', fetch_format: 'auto' },
  { width: 1200, height: 1800, crop: 'fill' as const, quality: 'auto', fetch_format: 'auto' },
];

@Injectable()
export class UploadService {
  constructor() {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadImage(file: Buffer, folder: string, publicId?: string): Promise<{ publicId: string; url: string }> {
    if (file.byteLength > MAX_BYTES) {
      throw new BadRequestException('Image exceeds 5 MB limit');
    }
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: publicId,
          resource_type: 'image',
          eager: EAGER_TRANSFORMS,
          transformation: { quality: 'auto', fetch_format: 'auto' },
        },
        (error, result) => {
          if (error || !result) return reject(error);
          resolve({ publicId: result.public_id, url: result.secure_url });
        },
      );
      uploadStream.end(file);
    });
  }

  async uploadImageBase64(dataUri: string, folder: string): Promise<{ publicId: string; url: string }> {
    // Check raw base64 payload size (~75% of base64 length = actual bytes)
    const base64Part = dataUri.split(',')[1] ?? dataUri;
    const approxBytes = Math.ceil((base64Part.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      throw new BadRequestException('Image exceeds 5 MB limit');
    }

    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: 'image',
      eager: EAGER_TRANSFORMS,
      transformation: { quality: 'auto', fetch_format: 'auto' },
    });
    return { publicId: result.public_id, url: result.secure_url };
  }

  async uploadFromUrl(imageUrl: string, folder: string): Promise<{ publicId: string; url: string }> {
    validateUploadUrl(imageUrl);
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder,
      resource_type: 'image',
      eager: EAGER_TRANSFORMS,
      transformation: { quality: 'auto', fetch_format: 'auto' },
    });
    return { publicId: result.public_id, url: result.secure_url };
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }
}
