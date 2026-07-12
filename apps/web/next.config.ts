import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
// Extract origin from API URL for CSP connect-src (e.g. https://api.example.com)
const apiOrigin = (() => {
  try {
    const u = new URL(apiUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return 'http://localhost:3001';
  }
})();

const isProd = process.env.NODE_ENV === 'production';

const CSP = [
  "default-src 'self'",
  // unsafe-eval is only needed by Next.js HMR in development, not production builds
  isProd ? "script-src 'self' 'unsafe-inline'" : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://res.cloudinary.com https://flagcdn.com https://i.ytimg.com https://img.youtube.com" + (isProd ? '' : ' http://localhost:2368'),
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src 'self' ${apiOrigin} https://api.cloudinary.com`,
  "media-src 'self' https://www.youtube.com",
  "object-src 'none'",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    optimizePackageImports: ['lucide-react'],
    webpackMemoryOptimizations: true,
    cpus: 1,   // limit Next.js page worker threads during build
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: 'flagcdn.com',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '2368',
        pathname: '/content/images/**',
      },
    ],
  },
  // Limit webpack parallelism to avoid saturating build servers
  webpack(config, { isServer }) {
    if (process.env.NEXT_WEBPACK_PARALLELISM) {
      config.parallelism = Number(process.env.NEXT_WEBPACK_PARALLELISM)
    }
    // Suppress "Critical dependency" warnings from @opentelemetry pulled in by @sentry/node
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { module: /@opentelemetry\/instrumentation/ },
      { module: /require-in-the-middle/ },
    ]
    return config
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: CSP },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS: 2 years, includeSubDomains — only enforce on production to avoid dev issues
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
        ],
      },
    ];
  },
};

const sentryOptions = {
  tunnelRoute: '/monitoring',
  sourcemaps: { disable: true },
  disableLogger: true,
  webpack: {
    autoInstrumentServerFunctions: false,
    autoInstrumentMiddleware: false,
  },
};

export default process.env.SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryOptions)
  : nextConfig;

