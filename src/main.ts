import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });

  // Render (and most hosts) put a proxy in front of the app. Without this,
  // every visitor looks like the same IP address and the per-IP rate limits
  // (login attempts, etc.) would be shared by ALL users at once.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // The client app previews photos the person just took (blob: URLs).
          'img-src': ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );

  // The installable client app (a static web app) is served from the same
  // server at /app - same origin as the API, so no CORS or extra hosting.
  const appDir = [path.join(process.cwd(), 'public', 'client-app'), path.join(__dirname, '..', 'public', 'client-app')].find((p) => fs.existsSync(p));
  if (appDir) {
    app.use(
      '/app',
      express.static(appDir, {
        index: 'index.html',
        setHeaders: (res, filePath) => {
          const base = path.basename(filePath);
          if (base === 'sw.js' || base === 'index.html' || base === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=86400');
          }
          if (base === 'sw.js') res.setHeader('Service-Worker-Allowed', '/app/');
        },
      }),
    );
  }

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`EMI CoreHub API listening on port ${port}`);
}
bootstrap();
