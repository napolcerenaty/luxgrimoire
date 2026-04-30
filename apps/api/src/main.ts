import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

// TODO[prod-setup]: Add Sentry integration here when SENTRY_DSN is configured
// import * as Sentry from '@sentry/node'; etc.

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, bodyLimit: 20 * 1024 * 1024 }), // 20 MB for base64 image uploads; Fastify logger disabled in favour of Pino
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));

  // Security headers (helmet for Fastify)
  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: false, // API is not HTML, CSP belongs on the web app
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // Brotli/Gzip/Deflate compression for all responses
  await app.register(require('@fastify/compress'), {
    global: true,
    threshold: 1024, // only compress responses > 1 KB
    encodings: ['br', 'gzip', 'deflate'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidUnknownValues: true,
      disableErrorMessages: process.env.NODE_ENV === 'production',
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 86400, // cache preflight for 24h to reduce OPTIONS load
  });

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('LuxGrimoire API')
    .setDescription('LuxGrimoire backend API')
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Register spec endpoint manually (NestJS Swagger Fastify bug: auto-generated routes return empty)
  const httpAdapter = app.getHttpAdapter();
  const specJson = JSON.stringify(document);
  httpAdapter.get('/api/docs-json', (_req: unknown, res: any) => {
    res.header('Content-Type', 'application/json').send(specJson);
  });

  SwaggerModule.setup('api/docs', app, document, {
    customCssUrl: 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css',
    customJs: [
      'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js',
      'https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
    ],
    customJsStr: `
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: '/api/docs-json',
          dom_id: '#swagger-ui',
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: 'StandaloneLayout'
        });
      };
    `,
  });

  const port = process.env.APP_PORT ?? 3001;
  const logger = app.get(Logger);
  await app.listen(port, '0.0.0.0');
  logger.log(`🚀 API running on http://localhost:${port}/api`, 'Bootstrap');
  logger.log(`📚 Swagger docs: http://localhost:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
