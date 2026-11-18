// Repeated export must reuse a revision; local edits need a higher native sync version.
import test from 'node:test';
import assert from 'node:assert/strict';
import {nextBodyRevision,validateBody} from '../src/core.mjs';
test('new records start at one; legacy and edited records increment once',()=>{
 assert.equal(nextBodyRevision(undefined),1);
 assert.equal(nextBodyRevision({}),2);
 assert.equal(nextBodyRevision({revision:4}),5);
 assert.throws(()=>nextBodyRevision({revision:2147483647}));
});
test('validation and backup reads preserve a saved export revision',()=>{
 const input={date:'2026-01-01',weight:70,revision:4};
 assert.equal(validateBody(input).revision,4);
 assert.equal(validateBody(input).revision,4);
 for(const revision of [0,-1,1.5,NaN,2147483648])assert.throws(()=>validateBody({...input,revision}));
});
