import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveMaterial,remainingSeconds,parseSetInput,resolveMode} from '../src/ui-v2/policy.mjs';
import {validateBackup} from '../src/core.mjs';
// Guard accessibility, deadline calculations and imported watch history against regressions.
test('content and reduced transparency always stay opaque',()=>{
 const flags={enabled:true,reduceTransparency:false,role:'control',platform:'ios',nativeAvailable:true};
 assert.equal(resolveMaterial(flags),'native-glass');
 for(const patch of [{enabled:false},{reduceTransparency:true},{role:'content'}])assert.equal(resolveMaterial({...flags,...patch}),'opaque');
 assert.equal(resolveMaterial({...flags,platform:'android'}),'frosted');
 assert.equal(resolveMode('system','dark'),'dark');
});
test('rest timer resumes from the deadline after backgrounding',()=>{
 assert.equal(remainingSeconds(10000,1001),9);
 assert.equal(remainingSeconds(10000,12000),0);
});
test('set drafts reject incomplete input and accept decimal comma',()=>{
 assert.deepEqual(parseSetInput('52,5','8'),{weight:52.5,reps:8});
 for(const pair of [['','8'],['-1','8'],['50','1.5'],['50','0'],['Infinity','8']])assert.throws(()=>parseSetInput(...pair));
});
test('watch-only summaries survive backup while malformed empty workouts fail',()=>{
 const h={id:'watch1',name:'Watch',startedAt:'2026-01-01T10:00:00Z',endedAt:'2026-01-01T11:00:00Z',external:true,sync:'watch',exercises:[]};
 const backup={schema:1,history:[h],body:[],routines:[]};
 assert.equal(validateBackup(backup).history.length,1);
 assert.throws(()=>validateBackup({...backup,history:[{...h,external:false}]}));
 assert.throws(()=>validateBackup({...backup,history:[{...h,endedAt:h.startedAt}]}));
});
