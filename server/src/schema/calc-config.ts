/**
 * schema/calc-config.ts
 *
 * Validates the body of PATCH /api/calc-config. Mirrors content-patch.ts's
 * { key, value } shape, but `value` is allowed to be a string, number, or
 * boolean — calc-config fields are heterogeneous (label/disclaimer are
 * strings, default is a number, included/taxable are booleans), whereas
 * content-patch.ts only ever stores strings and didn't need this.
 */
export const calcConfigPatchSchema = {
  body: {
    type: 'object',
    required: ['key', 'value'],
    additionalProperties: false,
    properties: {
      key:   { type: 'string', minLength: 1, maxLength: 200 },
      value: { type: ['string', 'number', 'boolean'] },
    },
  },
} as const;