/**
 * Writes the OpenAPI document to `openapi.json`.
 *
 * Committing the generated contract means a reviewer can import it into Postman
 * or generate a client without the deployed API being reachable, and it makes
 * an accidental breaking change visible as a diff in review rather than as a
 * surprise for a consumer.
 *
 *   npm run openapi:export
 */
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { buildOpenApiDocument } from '../src/swagger';

async function main(): Promise<void> {
  // `abortOnError: false` so a configuration problem surfaces as a thrown error
  // here rather than as a process exit with no explanation.
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });

  // The document is built from route metadata, so the prefix and versioning
  // have to match main.ts or every path in the export would be wrong.
  app.setGlobalPrefix('api', { exclude: ['health', 'live'] });
  const { VersioningType } = await import('@nestjs/common');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.init();

  const document = buildOpenApiDocument(app);
  const target = join(__dirname, '..', 'openapi.json');
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths).length;
  console.log(`Wrote ${target} (${pathCount} paths)`);

  await app.close();
}

main().catch((error: unknown) => {
  console.error('Failed to export OpenAPI document:', error);
  process.exitCode = 1;
});
