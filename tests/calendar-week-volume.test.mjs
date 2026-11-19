import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarWeekVolume} from '../src/core.mjs';

const record = (day,hour,weight) => ({
    startedAt:new Date(2026,10,day,hour).toISOString(),
    exercises:[{sets:[{weight,reps:10,done:true,kind:'normal'},
        {weight:99,reps:10,done:true,kind:'warmup'},{weight:99,reps:10,done:false}]}],
});
test('calendar week groups Monday through Sunday in local time without leaking adjacent weeks',()=>{
    const result = calendarWeekVolume([
        record(15,23,100),record(16,0,10),record(16,15,5),
        record(19,15,20),record(22,23,10),record(23,0,100),
    ],new Date(2026,10,19,12));
    assert.deepEqual(result.days.map(({count,volume})=>[count,volume]),
        [[2,150],[0,0],[0,0],[1,200],[0,0],[0,0],[1,100]]);
    assert.equal(result.count,4);
    assert.equal(result.volume,450);
    assert.equal(result.days.find(day=>day.isToday).key,'2026-11-19');
});
