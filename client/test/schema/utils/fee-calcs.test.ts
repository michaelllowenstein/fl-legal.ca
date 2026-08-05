import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { esc, ltoFee, round2 } from '../../../src/app/schema/utils/fee-calcs';

describe('fee calculation utilities', () => {
  it('returns zero land-title fees for empty or negative values', () => {
    assert.equal(ltoFee(0), 0);
    assert.equal(ltoFee(-1), 0);
  });

  it('applies the Alberta registration formula with ceiling increments', () => {
    assert.equal(ltoFee(1), 55);
    assert.equal(ltoFee(5000), 55);
    assert.equal(ltoFee(5001), 60);
    assert.equal(ltoFee(250000), 300);
  });

  it('rounds to two decimal places', () => {
    assert.equal(round2(10.005), 10.01);
    assert.equal(round2(10.004), 10);
  });

  it('escapes HTML-sensitive characters in generated estimate text', () => {
    assert.equal(esc(`A&B <firm> "quote" 'single'`), 'A&amp;B &lt;firm&gt; &quot;quote&quot; &#39;single&#39;');
  });
});
