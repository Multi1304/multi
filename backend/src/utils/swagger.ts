import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Multilogin Ultra Deluxe V2 API',
      version: '1.0.0',
      description: 'Public API for Multilogin Ultra Deluxe — Automations & Ecosystem',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
    },
    security: [
      { bearerAuth: [] },
      { apiKeyAuth: [] },
    ],
  },
  apis: ['./src/routes/*.ts', './src/server.ts'], // Path to the API docs
};

let swaggerSpecCache: ReturnType<typeof swaggerJsdoc> | null = null;

export function getSwaggerSpec() {
  if (!swaggerSpecCache) {
    swaggerSpecCache = swaggerJsdoc(options);
  }
  return swaggerSpecCache;
}
