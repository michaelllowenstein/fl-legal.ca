

export const calendarEventSchema = {
  body: {
    type: 'object',
    required: ['title', 'date'],
    additionalProperties: false,
    properties: {
      title:       { type: 'string', minLength: 1, maxLength: 200 },
      date:        { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      time:        { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      description: { type: 'string', maxLength: 1000 },
    },
  },
} as const;