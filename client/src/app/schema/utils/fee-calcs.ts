/**
 * Alberta Land Titles Office registration fee — current schedule (effective
 * Oct. 20, 2024): $50 base + $5 per $5,000 of value (or part thereof),
 * applied identically to title transfers and mortgage registrations.
 */
export const ltoFee = (value: number): number => {
  if (!value || value <= 0) return 0;
  return 50 + Math.ceil(value / 5000) * 5;
};

export const round2 = (n: number): number => {
  return Math.round(n * 100) / 100;
};

export const esc = (s: string): string => {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};