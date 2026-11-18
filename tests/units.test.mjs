// Unit switching must change presentation without changing the stored kilogram value.
import test from 'node:test';
import assert from 'node:assert/strict';
import { displayMass, parseMass } from '../src/ui-v2/policy.mjs';
test('displayed pounds convert back to the original kg within display precision', () => {
  for (const kg of [0, 2.5, 52.5, 100, 453.59, 999.99]) {
    assert.ok(Math.abs(parseMass(displayMass(kg,'lb'),'lb') - kg) < .003);
    assert.equal(displayMass(kg,'kg'),kg);
  }
});
test('unit parsing rejects invalid input and respects kilogram limit', () => {
  assert.equal(parseMass('52,5','kg'),52.5);
  assert.ok(Math.abs(parseMass('220.46226218','lb')-100)<1e-8);
  for (const value of ['', 'NaN','Infinity','-1','2205']) assert.throws(()=>parseMass(value,'lb'));
});
