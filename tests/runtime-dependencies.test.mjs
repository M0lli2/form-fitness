import test from 'node:test';
import assert from 'node:assert/strict';
import {auditedRuntimeModules} from '../scripts/report-runtime-dependencies.mjs';
test('release dependency inspection includes nested and Windows package paths',()=>{
 assert.deepEqual(auditedRuntimeModules([
  'node_modules/metro/node_modules/picomatch/lib/parse.js',
  String.raw`C:\build\node_modules\postcss\lib\parse.js`
 ]),['picomatch','postcss']);
});
test('app source names and unused build tools do not count as bundled packages',()=>{
 assert.deepEqual(auditedRuntimeModules(['src/picomatch.js','node_modules/react/index.js']),[]);
});
