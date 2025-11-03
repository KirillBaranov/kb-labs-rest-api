/**
 * @module @kb-labs/rest-api-core/utils/openapi
 * OpenAPI schema generation utilities
 */

import { z } from 'zod';

/**
 * Convert Zod schema to OpenAPI schema (basic implementation)
 * Note: This is a simplified conversion - full conversion would use zod-to-openapi or similar
 */
export function zodToOpenApiSchema(schema: z.ZodTypeAny): any {
  try {
    // Basic conversion - handle common Zod types
    if (schema instanceof z.ZodObject) {
      const shape = (schema as any)._def.shape();
      const properties: Record<string, any> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const fieldSchema = value as z.ZodTypeAny;
        const fieldDef = (fieldSchema as any)._def;
        
        // Map Zod types to JSON Schema types
        if (fieldDef.typeName === 'ZodString') {
          properties[key] = { type: 'string' };
        } else if (fieldDef.typeName === 'ZodNumber') {
          properties[key] = { type: 'number' };
        } else if (fieldDef.typeName === 'ZodBoolean') {
          properties[key] = { type: 'boolean' };
        } else if (fieldDef.typeName === 'ZodArray') {
          properties[key] = { type: 'array', items: { type: 'object' } };
        } else if (fieldDef.typeName === 'ZodObject') {
          properties[key] = zodToOpenApiSchema(fieldSchema);
        } else {
          properties[key] = { type: 'object' };
        }

        // Check if field is optional
        if (!fieldDef.optional) {
          required.push(key);
        }
      }

      return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required }),
      };
    }

    if (schema instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: (schema as any)._def.values,
      };
    }

    if (schema instanceof z.ZodLiteral) {
      return {
        type: typeof (schema as any)._def.value,
        enum: [(schema as any)._def.value],
      };
    }

    // Default fallback
    return { type: 'object', description: 'Schema from Zod' };
  } catch (error) {
    // Fallback for any errors
    return { type: 'object' };
  }
}

/**
 * Generate OpenAPI spec from route schemas
 */
export function generateOpenApiSpec(config: {
  title: string;
  version: string;
  basePath: string;
}): any {
  return {
    openapi: '3.0.0',
    info: {
      title: config.title,
      version: config.version,
      description: 'KB Labs REST API - HTTP interface for CLI tools',
    },
    servers: [
      {
        url: `http://localhost:3001${config.basePath}`,
        description: 'Local development',
      },
    ],
    paths: {},
    components: {
      schemas: {},
      securitySchemes: {
        none: {
          type: 'apiKey',
          name: 'X-API-Key',
          in: 'header',
        },
      },
    },
    tags: [
      { name: 'System', description: 'Health and system information' },
      { name: 'Audit', description: 'Audit operations' },
      { name: 'Release', description: 'Release operations' },
      { name: 'DevLink', description: 'DevLink operations' },
      { name: 'Mind', description: 'Mind operations' },
      { name: 'Analytics', description: 'Analytics operations' },
      { name: 'Jobs', description: 'Job management' },
    ],
  };
}

