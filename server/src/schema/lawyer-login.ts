

export const fricLowensteinLoginSchema = {
  body: {
    type: 'object',
    required: ['username', 'password'],
    additionalProperties: false,
    properties: {
      username: { type: 'string', minLength: 1, maxLength: 80 },
      password: { type: 'string', minLength: 1, maxLength: 256 },
    },
  },
} as const;