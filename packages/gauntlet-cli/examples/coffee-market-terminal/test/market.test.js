import assert from 'node:assert/strict';
import test from 'node:test';
import { latestPrice, parsePrices } from '../src/market.js';
test('normalizes price observations and selects the latest',()=>{
  const rows=parsePrices('date,market,price_brl_per_bag\n2026-01-01,x,10\n2026-01-02,x,12\n');
  assert.deepEqual(latestPrice(rows),{date:'2026-01-02',market:'x',price_brl_per_bag:12});
});
