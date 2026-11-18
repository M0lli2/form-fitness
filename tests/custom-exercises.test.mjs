// User-created movements must survive backup without invalid data reaching the UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCustomExercise,validateBackup} from '../src/core.mjs';
const input={name:' 케이블 운동 ',muscle:'등',equipment:'케이블',type:'strength',steps:['준비','당기기'],caution:'천천히'};
test('custom exercises preserve tracking type and validate required fields',()=>{
 const exercise=validateCustomExercise(input);
 assert.equal(exercise.name,'케이블 운동');
 assert.match(exercise.id,/^custom-/);
 for(const patch of [{name:''},{type:'unknown'},{steps:[]},{steps:['']}])assert.throws(()=>validateCustomExercise({...input,...patch}));
});
test('custom movements are validated on backup import and old backups remain compatible',()=>{
 const backup={schema:1,history:[],body:[],routines:[]};
 assert.equal(validateBackup(backup).schema,1);
 assert.equal(validateBackup({...backup,customExercises:[validateCustomExercise(input)]}).customExercises.length,1);
 assert.throws(()=>validateBackup({...backup,customExercises:[{...input,type:'unknown'}]}));
});
