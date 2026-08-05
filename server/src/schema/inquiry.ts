/**
 * schema/inquiry.ts
 *
 * JSON Schema definitions for the inquiry endpoints, consumed by Fastify's
 * built-in ajv validator.  Keeps route handlers thin and validation declarative.
 *
 * Payload TypeScript interfaces live in services/mailer.ts alongside the
 * send logic — routes/inquiry.ts imports schemas from here and types from there.
 */

export const generalInquirySchema = {
  body: {
    type: 'object',
    required: ['name', 'email', 'message'],
    additionalProperties: false,
    properties: {
      name:    { type: 'string', minLength: 1, maxLength: 120 },
      email:   { type: 'string', format: 'email', maxLength: 254 },
      phone:   { type: 'string', maxLength: 30 },
      message: { type: 'string', minLength: 1, maxLength: 2000 },
    },
  },
} as const;
 
export const priorityInquirySchema = {
  body: {
    type: 'object',
    required: ['name', 'email', 'message'],
    additionalProperties: false,
    properties: {
      name:         { type: 'string', minLength: 1, maxLength: 120 },
      email:        { type: 'string', format: 'email', maxLength: 254 },
      phone:        { type: 'string', maxLength: 30 },
      message:      { type: 'string', minLength: 1, maxLength: 2000 },
      practiceArea: { type: 'string', maxLength: 80 },
    },
  },
} as const;