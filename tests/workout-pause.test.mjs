import test from 'node:test';
import assert from 'node:assert/strict';
import {applyWatchCommand, beginPreparedWorkout, prepareWorkout, closeWorkout, toggleWorkoutPause, workoutElapsedSeconds} from '../src/core.mjs';

const workout = {
    id:'session', name:'스쿼트', startedAt:new Date(0).toISOString(), restEndsAt:20_000,
    exercises:[{id:'squat',type:'strength',sets:[
        {id:'first',weight:30,reps:10,done:true},
        {id:'next',weight:30,reps:10,done:false},
    ]}],
};

test('pause and resume keep the completed sets and freeze both clocks across a reload', () => {
    const paused = JSON.parse(JSON.stringify(toggleWorkoutPause(workout,10_000)));
    assert.equal(workoutElapsedSeconds(paused,80_000),10);
    assert.equal(paused.restEndsAt,null);
    assert.deepEqual(paused.exercises,workout.exercises);
    const resumed = toggleWorkoutPause(paused,80_000);
    assert.equal(resumed.restEndsAt,90_000);
    assert.equal(workoutElapsedSeconds(resumed,85_000),15);
    assert.equal(workoutElapsedSeconds(toggleWorkoutPause(resumed,85_000),95_000),15);
});

test('ending a paused workout saves completed sets without counting the pause', () => {
    const paused = toggleWorkoutPause(workout,10_000);
    const saved = closeWorkout(paused,80_000);
    assert.equal(saved.endedAt,new Date(80_000).toISOString());
    assert.equal(workoutElapsedSeconds(saved),10);
    assert.equal(saved.pausedAt,undefined);
    assert.deepEqual(saved.exercises,workout.exercises);
    assert.throws(()=>closeWorkout({...workout,exercises:[]},80_000),/완료한 세트/);
});

test('a paused workout rejects watch set completion, and resume permits it', () => {
    const paused = toggleWorkoutPause(workout,10_000);
    const command = {id:'command',sessionId:'session',exerciseId:'squat',setId:'next',action:'completeSet'};
    assert.equal(applyWatchCommand(paused,command,[]).accepted,false);
    assert.equal(applyWatchCommand(toggleWorkoutPause(paused,12_000),command,[]).accepted,true);
});

test('preparing a blank workout neither starts nor pauses the clock before the explicit start', () => {
    const draft = JSON.parse(JSON.stringify({...prepareWorkout(),exercises:workout.exercises}));
    assert.equal(workoutElapsedSeconds(draft,200_000),0);
    assert.equal(toggleWorkoutPause(draft,80_000),draft);
    assert.throws(()=>closeWorkout(draft,90_000),/먼저 운동을 시작/);
    assert.equal(applyWatchCommand(draft,{id:'watch',sessionId:draft.id,exerciseId:'squat',setId:'next',action:'completeSet'},[]).accepted,false);
    const started = beginPreparedWorkout(draft,150_000);
    assert.equal(started.id,draft.id);
    assert.deepEqual(started.exercises,draft.exercises);
    assert.equal(started.preparing,undefined);
    assert.equal(workoutElapsedSeconds(started,154_000),4);
    assert.equal(beginPreparedWorkout(started,200_000),started);
});
