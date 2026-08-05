export const ROUTE_ORDER = [
  'home',
  'about',
  'areas-of-law',
  'pricing',
  'blog',
  'faq',
  'contact-us',
] as const;

export type RouteKey = typeof ROUTE_ORDER[number];

export function routeAnimationIndex(route: RouteKey): number {
  return ROUTE_ORDER.indexOf(route);
}