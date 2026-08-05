import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ROUTE_ORDER, routeAnimationIndex } from '../../../src/app/schema/utils/route-order';

describe('route animation order', () => {
  it('keeps the primary public pages in navigation order', () => {
    assert.deepEqual([...ROUTE_ORDER], [
      'home',
      'about',
      'areas-of-law',
      'pricing',
      'blog',
      'faq',
      'contact-us',
    ]);
  });

  it('returns a stable animation index for each known route', () => {
    assert.equal(routeAnimationIndex('home'), 0);
    assert.equal(routeAnimationIndex('pricing'), 3);
    assert.equal(routeAnimationIndex('contact-us'), 6);
  });
});
