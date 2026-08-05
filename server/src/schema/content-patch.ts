

export const contentPatchSchema = {
  body: {
    type: 'object',
    required: ['key', 'value'],
    additionalProperties: false,
    properties: {
      key:   { type: 'string', minLength: 1, maxLength: 512 },
      value: { type: 'string', maxLength: 50000 },
    },
  },
} as const;