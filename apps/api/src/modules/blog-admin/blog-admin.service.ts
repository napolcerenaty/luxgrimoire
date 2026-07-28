import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

interface GhostAdminPost {
  id: string;
  title: string;
  slug: string;
  feature_image: string | null;
  updated_at: string;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Ghost's Admin API (unlike the read-only Content API this app also uses) requires a
// short-lived JWT signed with the integration's own secret — see
// https://ghost.org/docs/admin-api/#token-authentication
@Injectable()
export class BlogAdminService {
  private get ghostUrl(): string {
    return (process.env.GHOST_API_URL ?? 'http://localhost:2368').replace(/\/$/, '');
  }

  private get adminKey(): string {
    const key = process.env.GHOST_ADMIN_API_KEY;
    if (!key) throw new InternalServerErrorException('GHOST_ADMIN_API_KEY is not configured');
    return key;
  }

  private makeAdminToken(): string {
    const [id, secret] = this.adminKey.split(':');
    const header = { alg: 'HS256', typ: 'JWT', kid: id };
    const now = Math.floor(Date.now() / 1000);
    const payload = { iat: now, exp: now + 5 * 60, aud: '/admin/' };
    const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
    const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(unsigned)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    return `${unsigned}.${signature}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Ghost ${this.makeAdminToken()}` };
  }

  async listPosts(): Promise<{ id: string; title: string; slug: string; featureImage: string | null }[]> {
    const res = await fetch(
      `${this.ghostUrl}/ghost/api/admin/posts/?limit=100&fields=id,title,slug,feature_image&order=published_at%20DESC`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) throw new InternalServerErrorException(`Ghost admin API error: ${res.status} ${await res.text()}`);
    const { posts } = (await res.json()) as { posts: GhostAdminPost[] };
    return posts.map((p) => ({ id: p.id, title: p.title, slug: p.slug, featureImage: p.feature_image }));
  }

  private async getPostBySlug(slug: string): Promise<GhostAdminPost> {
    const res = await fetch(`${this.ghostUrl}/ghost/api/admin/posts/slug/${slug}/`, { headers: this.authHeaders() });
    if (res.status === 404) throw new NotFoundException(`Post "${slug}" not found`);
    if (!res.ok) throw new InternalServerErrorException(`Ghost admin API error: ${res.status} ${await res.text()}`);
    const { posts } = (await res.json()) as { posts: GhostAdminPost[] };
    return posts[0];
  }

  private async updateFeatureImage(
    slug: string,
    featureImage: string | null,
  ): Promise<{ slug: string; featureImage: string | null }> {
    const post = await this.getPostBySlug(slug);
    const res = await fetch(`${this.ghostUrl}/ghost/api/admin/posts/${post.id}/`, {
      method: 'PUT',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts: [{ feature_image: featureImage, updated_at: post.updated_at }] }),
    });
    if (!res.ok) throw new InternalServerErrorException(`Ghost admin API error: ${res.status} ${await res.text()}`);
    const { posts } = (await res.json()) as { posts: GhostAdminPost[] };
    return { slug: posts[0].slug, featureImage: posts[0].feature_image };
  }

  async setFeatureImage(slug: string, imageUrl: string) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    return this.updateFeatureImage(slug, imageUrl);
  }

  async clearFeatureImage(slug: string) {
    return this.updateFeatureImage(slug, null);
  }
}
