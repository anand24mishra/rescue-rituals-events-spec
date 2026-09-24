import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export const SWAGGER_PATH = 'docs';

/**
 * Builds the OpenAPI document.
 *
 * Every schema comes from explicit `@Api*` decorators rather than the Swagger
 * CLI plugin, so the document is identical whether it is produced by
 * `nest build`, `ts-node` (the openapi:export script) or a test run. With the
 * plugin, the exported contract and the deployed one can differ, which is a bad
 * property for the artefact clients generate code from.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Rescue Rituals Events API')
    .setDescription(
      [
        'Events and RSVP API for a rescue/community platform.',
        '',
        '**RSVP** is *Répondez s\'il vous plaît* — "please respond". Here an RSVP',
        "is a user's record that they intend to attend an event.",
        '',
        '### How to try this',
        '1. `POST /api/v1/auth/register` — you get a token back immediately.',
        '2. Click **Authorize** and paste the `accessToken`.',
        '3. `POST /api/v1/events` to create an event with a small `capacity`.',
        '4. `POST /api/v1/events/{id}/rsvp` to attend; repeat it to see the 409.',
        '',
        '### What is worth looking at',
        'The capacity decision on the RSVP route runs inside a PostgreSQL',
        'transaction holding a row lock on the event, so concurrent requests',
        'cannot both claim the last place. A unique index on `(event_id,',
        'user_id)` and a `confirmed_count <= capacity` CHECK constraint sit',
        'underneath as guarantees independent of the application code.',
        '',
        'Seed data is fictional and rescue-themed for demonstration; it does not',
        'represent real Rescue Rituals events.',
      ].join('\n'),
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Paste the `accessToken` from register or login.',
      },
      'bearer',
    )
    .addTag('auth', 'Registration, login and the current user')
    .addTag('events', 'Event discovery and organiser management')
    .addTag('rsvp', 'Attending, cancelling and attendee lists')
    .addTag('health', 'Liveness and readiness')
    .build();

  return SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      // Survives a page reload, so a reviewer does not re-paste their token
      // after every refresh.
      persistAuthorization: true,
      docExpansion: 'list',
      tagsSorter: 'alpha',
    },
    customSiteTitle: 'Rescue Rituals Events API',
  });

  return document;
}
