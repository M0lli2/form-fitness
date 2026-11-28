import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    PICKLE_INBOX_URL, applyPickleInbox, base64urlDecode, base64urlEncode, buildBodyFromPayload,
    buildRoutineFromPayload, buildSessionFromPayload, encodePickleLink, feedbackPayload, feedbackText,
    inboxUrl, mergePickleBody, mergePickleRoutine, mergePickleSession, parsePickleInbox, parsePickleInput, payloadKind,
} from '../src/pickle-sync.mjs';
import {localDateInput} from '../src/core.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../src/exercises.json', import.meta.url), 'utf8'));
const library = catalog.exercises;

const benchPayload = {
    type: 'session',
    name: '가슴·삼두',
    date: '2026-11-28',
    minutes: 52,
    exercises: [
        {name: '바벨 벤치 프레스', sets: [{weight: 80, reps: 8, rpe: 8}, {weight: 80, reps: 8}, [82.5, 6]], note: '마지막 세트 자세 유지'},
        {name: '트라이셉스 푸시다운', sets: [{weight: 30, reps: 12}, {weight: 30, reps: 12}]},
    ],
};

test('base64url keeps Korean, emoji and spacing intact', () => {
    const text = JSON.stringify({name: '가슴·삼두 🏋️', note: '80 kg × 8회'});
    assert.equal(base64urlDecode(base64urlEncode(text)), text);
    assert.equal(/[+/=]/.test(base64urlEncode(text)), false);
});

test('a base64url link carries a session payload', () => {
    const parsed = parsePickleInput(encodePickleLink('session', benchPayload));
    assert.equal(parsed.kind, 'session');
    assert.equal(parsed.payload.name, '가슴·삼두');
    assert.equal(parsed.payload.exercises.length, 2);
});

test('URL-encoded JSON and hash data are read like base64url', () => {
    const encoded = parsePickleInput(`form://import-session?json=${encodeURIComponent(JSON.stringify(benchPayload))}`);
    assert.equal(encoded.kind, 'session');
    assert.equal(encoded.payload.minutes, 52);
    const hashed = parsePickleInput(`form://import-session#${base64urlEncode(JSON.stringify(benchPayload))}`);
    assert.equal(hashed.kind, 'session');
    assert.equal(hashed.payload.name, '가슴·삼두');
});

test('raw JSON paste is accepted and classified by its content', () => {
    const parsed = parsePickleInput(JSON.stringify(benchPayload));
    assert.equal(parsed.kind, 'session');
    const routine = parsePickleInput(JSON.stringify({name: '푸시 A', exercises: ['바벨 벤치 프레스']}));
    assert.equal(routine.kind, 'routine');
});

test('unknown link paths, wrong kinds and empty text are refused with Korean messages', () => {
    assert.throws(() => parsePickleInput('form://unknown?data=abc'), /알 수 없는 피클 링크/);
    assert.throws(() => parsePickleInput(''), /붙여넣어/);
    assert.throws(() => parsePickleInput('https://example.com'), /form:\/\//);
    assert.throws(() => parsePickleInput(encodePickleLink('session', {type: 'routine', name: '푸시', exercises: ['벤치']})), /운동 기록이 아닌/);
    assert.throws(() => parsePickleInput('form://import-session?data=%%%'), /읽지 못했습니다/);
});

test('a session payload becomes a finished Form session', () => {
    const {session, minutes} = buildSessionFromPayload(benchPayload, library);
    assert.equal(minutes, 52);
    assert.equal(session.source, 'pickle');
    assert.equal(session.exercises.length, 2);
    assert.equal(session.exercises[0].id, 'bench');
    assert.equal(session.exercises[0].name, '바벨 벤치 프레스');
    assert.deepEqual(session.exercises[0].sets.map(set => set.weight), [80, 80, 82.5]);
    assert.deepEqual(session.exercises[0].sets.map(set => set.done), [true, true, true]);
    assert.equal(session.exercises[0].sets[0].rpe, '8');
    assert.equal(session.exercises[0].note, '마지막 세트 자세 유지');
    assert.equal(Date.parse(session.endedAt) - Date.parse(session.startedAt), 52 * 60000);
    assert.equal(new Date(session.startedAt).getHours(), 19);
});

test('short names and IDs resolve to catalog exercises; ambiguous names ask for a precise one', () => {
    assert.equal(buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: [[80, 8]]}]}, library).session.exercises[0].id, 'bench');
    assert.equal(buildSessionFromPayload({name: 'x', exercises: [{id: 'lat', sets: [[40, 12]]}]}, library).session.exercises[0].id, 'lat');
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '컬', sets: [[10, 10]]}]}, library), /여러 개/);
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '없는운동', sets: [[10, 10]]}]}, library), /찾지 못했습니다/);
});

test('invalid sets are refused before saving', () => {
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: []}]}, library), /세트 기록이 없습니다/);
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: [{weight: 80, reps: 0}]}]}, library), /횟수/);
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: [{weight: 2000, reps: 5}]}]}, library), /중량/);
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: [{weight: 80, reps: 5, rpe: 12}]}]}, library), /RPE/);
    assert.throws(() => buildSessionFromPayload({name: 'x', exercises: [{name: '벤치', sets: [[80, 8]]}, {name: '바벨 벤치 프레스', sets: [[70, 8]]}]}, library), /두 번/);
    assert.throws(() => buildSessionFromPayload({name: 'x', date: '2026-02-30', exercises: [{name: '벤치', sets: [[80, 8]]}]}, library), /날짜/);
});

test('timed exercises keep seconds and show minutes in the briefing', () => {
    const {session} = buildSessionFromPayload({name: '코어', date: '2026-11-28', exercises: [{name: '플랭크', sets: [{seconds: 60}, {minutes: 2}]}]}, library);
    assert.deepEqual(session.exercises[0].sets.map(set => set.seconds), [60, 120]);
    const text = feedbackText(session, [session]);
    assert.match(text, /1세트 1분/);
    assert.match(text, /2세트 2분/);
});

test('the same payload imports once and never overwrites existing history', () => {
    const first = buildSessionFromPayload(benchPayload, library).session;
    const again = buildSessionFromPayload(benchPayload, library).session;
    assert.equal(first.id, again.id);
    const history = [{id: 'old', name: '기존 운동', startedAt: '2026-11-27T10:00:00.000Z', endedAt: '2026-11-27T11:00:00.000Z', restEndsAt: null, exercises: [], external: true, sync: 'watch'}];
    const merged = mergePickleSession(history, first);
    assert.equal(merged.added, true);
    assert.equal(merged.history.length, 2);
    assert.equal(merged.history[0].id, first.id);
    const repeated = mergePickleSession(merged.history, again);
    assert.equal(repeated.added, false);
    assert.equal(repeated.history.length, 2);
});

test('routines are added, merged by name and updated by id', () => {
    const built = buildRoutineFromPayload({name: '푸시 A', exercises: ['바벨 벤치 프레스', '덤벨 숄더 프레스', '벤치']}, library).routine;
    assert.deepEqual(built.ids, ['bench', 'db-shoulder']);
    const added = mergePickleRoutine([{id: 'mine', name: '내 루틴', ids: ['lat']}], built);
    assert.equal(added.mode, 'added');
    assert.equal(added.routines.length, 2);
    const merged = mergePickleRoutine(added.routines, {...built, id: 'other', ids: ['pushdown']});
    assert.equal(merged.mode, 'merged');
    assert.deepEqual(merged.routines[0].ids, ['bench', 'db-shoulder', 'pushdown']);
    const updated = mergePickleRoutine(added.routines, {...built, name: '푸시 B', ids: ['ohp']});
    assert.equal(updated.mode, 'updated');
    assert.equal(updated.routines[0].name, '푸시 B');
    assert.deepEqual(updated.routines[0].ids, ['bench', 'db-shoulder', 'ohp']);
});

test('routine payloads need a name and at least one exercise', () => {
    assert.throws(() => buildRoutineFromPayload({exercises: ['벤치']}, library), /루틴 이름/);
    assert.throws(() => buildRoutineFromPayload({name: '푸시'}, library), /운동을 하나 이상/);
    assert.throws(() => buildRoutineFromPayload({name: '푸시', exercises: ['없는운동']}, library), /찾지 못했습니다/);
});

test('start links carry a routine name or a prepared exercise list', () => {
    const byName = parsePickleInput('form://start?routine=' + encodeURIComponent('푸시 A'));
    assert.equal(byName.kind, 'start');
    assert.equal(byName.target, '푸시 A');
    const withData = parsePickleInput(encodePickleLink('start', {type: 'routine', name: '푸시 A', exercises: ['벤치']}));
    assert.equal(withData.kind, 'start');
    assert.deepEqual(withData.payload.exercises, ['벤치']);
    assert.throws(() => parsePickleInput('form://start'), /링크에 없습니다/);
});

test('payload kinds are read from type or structure', () => {
    assert.equal(payloadKind({type: 'workout'}), 'session');
    assert.equal(payloadKind({type: 'routine'}), 'routine');
    assert.equal(payloadKind({exercises: [{name: '벤치', sets: [[80, 8]]}]}), 'session');
    assert.equal(payloadKind({ids: ['bench']}), 'routine');
    assert.throws(() => payloadKind({}), /운동 기록/);
});

test('the Pickle briefing reads like a message the user can paste', () => {
    const {session} = buildSessionFromPayload(benchPayload, library);
    const history = [session];
    const text = feedbackText(session, history, {body: {date: '2026-11-27T09:00:00.000Z', weight: 78.4, muscle: 36.2, bodyFat: 16.1}, goal: 4});
    assert.match(text, /^\[Form\] 11월 28일 \(토\) · 가슴·삼두/);
    assert.match(text, /총 볼륨 [\d,]+ kg/);
    assert.match(text, /■ 바벨 벤치 프레스 · 가슴/);
    assert.match(text, /1세트 80 kg × 8회 · RPE 8/);
    assert.match(text, /3세트 82\.5 kg × 6회/);
    assert.match(text, /메모: 마지막 세트 자세 유지/);
    assert.match(text, /이번 주 1\/4회/);
    assert.match(text, /체성분 11월 27일 · 체중 78\.4 kg · 골격근 36\.2 kg · 체지방 16\.1%/);
    assert.match(text, /오늘 운동 피드백과 다음 운동 계획을 부탁해\.$/);
});

test('a bodyweight set is written as 0 kg without losing the unit', () => {
    const {session} = buildSessionFromPayload({name: '맨몸', date: '2026-11-28', exercises: [{name: '푸시업', sets: [{weight: 0, reps: 20}]}]}, library);
    assert.match(feedbackText(session, [session]), /1세트 0 kg × 20회/);
});

test('the JSON briefing is a session payload that imports back unchanged', () => {
    const {session} = buildSessionFromPayload(benchPayload, library);
    const payload = feedbackPayload(session, [session], {goal: 3});
    assert.equal(payload.type, 'session');
    assert.equal(payload.schemaVersion, 1);
    assert.equal(payload.summary.sets, 5);
    assert.equal(payload.exercises[1].name, '트라이셉스 푸시다운');
    const back = buildSessionFromPayload(payload, library).session;
    assert.equal(back.id, session.id);
    assert.deepEqual(back.exercises.map(item => item.id), session.exercises.map(item => item.id));
    assert.deepEqual(back.exercises[0].sets.map(set => set.weight), [80, 80, 82.5]);
});

test('pound display converts weights but keeps the stored kilograms intact', () => {
    const {session} = buildSessionFromPayload(benchPayload, library);
    const text = feedbackText(session, [session], {unit: 'lb'});
    assert.match(text, /176\.4 lb/);
    assert.deepEqual(session.exercises[0].sets.map(set => set.weight), [80, 80, 82.5]);
});

test('an inbody link becomes one body entry with derived body fat and BMI', () => {
    const link = encodePickleLink('body', {
        type: 'body', date: '2026-11-28', weight: 78.4, muscleMass: 36.2, bodyFatMass: 12.6,
        height: 176, bmr: 1650, visceralFat: 7, inbodyScore: 72, note: '아침 공복',
    });
    const parsed = parsePickleInput(link);
    assert.equal(parsed.kind, 'body');
    const {entry} = buildBodyFromPayload(parsed.payload);
    assert.equal(entry.weight, 78.4);
    assert.equal(entry.muscle, 36.2);
    assert.equal(entry.bodyFat, 16.1);
    assert.equal(entry.bodyFatMass, 12.6);
    assert.equal(entry.height, 176);
    assert.equal(entry.bmr, 1650);
    assert.equal(entry.visceralFat, 7);
    assert.equal(entry.inbodyScore, 72);
    assert.equal(entry.bmi, 25.3);
    assert.equal(entry.source, 'pickle');
    assert.equal(entry.note, '아침 공복');
    assert.equal(localDateInput(entry.date), '2026-11-28');
});

test('a measurement day is matched in the device calendar, not by UTC text', () => {
    const built = buildBodyFromPayload({measuredAt: '2026-11-28T08:10:00+09:00', weight: 78.2}).entry;
    const day = localDateInput(new Date('2026-11-28T08:10:00+09:00'));
    assert.equal(localDateInput(built.date), day);
    const fromDay = buildBodyFromPayload({date: day, weight: 78.2}).entry;
    const merged = mergePickleBody([fromDay], built);
    assert.equal(merged.mode, 'updated');
    assert.equal(merged.body.length, 1);
});

test('the same day is updated in place and keeps photo, note, sync and revision history', () => {
    const first = buildBodyFromPayload({type: 'body', date: '2026-11-28', weight: 78.4, muscle: 36.2, bodyFat: 16.1}).entry;
    const added = mergePickleBody([], first);
    assert.equal(added.mode, 'added');
    assert.equal(added.body.length, 1);
    assert.equal(added.entry.revision, 1);
    const existing = [{...added.entry, id: 'manual-1', revision: 3, photo: 'file://inbody.jpg', note: '직접 입력', sync: 'synced', source: 'manual'}];
    const again = buildBodyFromPayload({type: 'body', date: '2026-11-28', weight: 77.9, muscleMass: 36.5}).entry;
    const updated = mergePickleBody(existing, again);
    assert.equal(updated.mode, 'updated');
    assert.equal(updated.body.length, 1);
    assert.equal(updated.entry.id, 'manual-1');
    assert.equal(updated.entry.revision, 4);
    assert.equal(updated.entry.photo, 'file://inbody.jpg');
    assert.equal(updated.entry.note, '직접 입력');
    assert.equal(updated.entry.sync, 'synced');
    assert.equal(updated.entry.weight, 77.9);
    assert.equal(updated.entry.muscle, 36.5);
    assert.equal(updated.entry.bodyFat, 16.1);
});

test('a different measurement day is added without touching existing records', () => {
    const monday = buildBodyFromPayload({date: '2026-11-24', weight: 79}).entry;
    const friday = buildBodyFromPayload({date: '2026-11-28', weight: 78.4}).entry;
    const state = mergePickleBody([monday], friday);
    assert.equal(state.mode, 'added');
    assert.equal(state.body.length, 2);
    assert.equal(localDateInput(state.body[0].date), '2026-11-28');
    assert.equal(localDateInput(state.body[1].date), '2026-11-24');
});

test('body imports refuse impossible numbers, missing days and future measurements', () => {
    assert.throws(() => buildBodyFromPayload({date: '2026-11-28'}), /체중/);
    assert.throws(() => buildBodyFromPayload({date: '2026-11-28', weight: 10}), /체성분 값을 확인/);
    assert.throws(() => buildBodyFromPayload({date: '2026-11-28', weight: 78, muscle: 90}), /골격근량/);
    assert.throws(() => buildBodyFromPayload({weight: 78}), /측정일/);
    assert.throws(() => buildBodyFromPayload({date: '2099-01-01', weight: 78}), /체성분 값을 확인/);
    assert.throws(() => buildBodyFromPayload({date: '2026-02-30', weight: 78}), /날짜/);
    assert.throws(() => parsePickleInput(encodePickleLink('body', {type: 'session', name: 'x', exercises: [{name: '벤치', sets: [[80, 8]]}]})), /체성분 기록이 아닌/);
    assert.equal(payloadKind({type: 'inbody', weight: 78, date: '2026-11-28'}), 'body');
    assert.equal(payloadKind({weight: 78, date: '2026-11-28'}), 'body');
});

test('the inbox url carries a cache-busting timestamp and rejects non-http input', () => {
    assert.equal(inboxUrl(PICKLE_INBOX_URL, 1700000000000), PICKLE_INBOX_URL + '?t=1700000000000');
    assert.equal(inboxUrl('https://example.com/inbox.json?raw=1', 5), 'https://example.com/inbox.json?raw=1&t=5');
    assert.equal(inboxUrl('', 5), '');
    assert.equal(inboxUrl('file:///tmp/inbox.json', 5), '');
    assert.match(PICKLE_INBOX_URL, /^https:\/\/raw\.githubusercontent\.com\/M0lli2\/form-fitness\/main\/sync\/pickle-inbox\.json$/);
});

test('inbox items are validated one by one and bad ones are reported, not thrown', () => {
    const text = JSON.stringify({version: 1, items: [
        {id: 'a', kind: 'body', payload: {type: 'body', date: '2026-11-28', weight: 73.7}},
        {kind: 'body', payload: {date: '2026-11-28', weight: 73.7}},
        {id: 'b', kind: 'body'},
        {id: 'c', kind: 'nonsense', payload: {nothing: true}},
        {id: 'd', payload: {type: 'routine', name: '푸시 A', exercises: ['벤치']}},
    ]});
    const inbox = parsePickleInbox(text);
    assert.equal(inbox.items.length, 2);
    assert.deepEqual(inbox.items.map(item => [item.id, item.kind]), [['a', 'body'], ['d', 'routine']]);
    assert.equal(inbox.skipped.length, 3);
    assert.throws(() => parsePickleInbox('{'), /동기화 파일/);
    assert.throws(() => parsePickleInbox({version: 2, items: []}), /버전/);
    assert.throws(() => parsePickleInbox({version: 1}), /items/);
});

test('sync applies each item once and remembers applied ids', () => {
    const inbox = parsePickleInbox({version: 1, items: [
        {id: 'body-1', kind: 'body', payload: {type: 'body', date: '2026-11-28', weight: 73.7, muscleMass: 33.9, bodyFat: 18.7}},
        {id: 'routine-1', kind: 'routine', payload: {type: 'routine', name: '푸시 A', exercises: ['바벨 벤치 프레스']}},
        {id: 'session-1', kind: 'session', payload: {type: 'session', name: '가슴', date: '2026-11-28', exercises: [{name: '바벨 벤치 프레스', sets: [[80, 8]]}]}},
    ]});
    const empty = {history: [], body: [], routines: [], appliedSyncIds: []};
    const first = applyPickleInbox(empty, inbox, {library});
    assert.equal(first.count, 3);
    assert.deepEqual(first.summary, {body: 1, session: 1, routine: 1});
    assert.equal(first.patch.body.length, 1);
    assert.equal(first.patch.history.length, 1);
    assert.equal(first.patch.routines.length, 1);
    assert.deepEqual(first.patch.appliedSyncIds, ['body-1', 'routine-1', 'session-1']);
    const second = applyPickleInbox({...empty, ...first.patch}, inbox, {library});
    assert.equal(second.count, 0);
    assert.equal(second.patch.body.length, 1);
    assert.equal(second.skipped.filter(item => item.reason.includes('이미')).length, 3);
});

test('a broken item does not block the rest and is retried next time', () => {
    const inbox = parsePickleInbox({version: 1, items: [
        {id: 'bad', kind: 'session', payload: {type: 'session', name: 'x', exercises: [{name: '없는운동', sets: [[10, 10]]}]}},
        {id: 'good', kind: 'body', payload: {type: 'body', date: '2026-11-28', weight: 73.7}},
    ]});
    const result = applyPickleInbox({history: [], body: [], routines: [], appliedSyncIds: []}, inbox, {library});
    assert.equal(result.count, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].id, 'bad');
    assert.match(result.errors[0].reason, /찾지 못했습니다/);
    assert.deepEqual(result.patch.appliedSyncIds, ['good']);
});

test('the shipped inbox carries this week inbody numbers as one anonymous body item', () => {
    const inbox = parsePickleInbox(fs.readFileSync(new URL('../sync/pickle-inbox.json', import.meta.url), 'utf8'));
    assert.equal(inbox.items.length, 1);
    const item = inbox.items[0];
    assert.equal(item.id, 'body-2026-11-28-inbody');
    assert.equal(item.kind, 'body');
    const result = applyPickleInbox({history: [], body: [], routines: [], appliedSyncIds: []}, inbox, {library});
    assert.equal(result.count, 1);
    const entry = result.patch.body[0];
    assert.equal(entry.weight, 73.7);
    assert.equal(entry.muscle, 33.9);
    assert.equal(entry.bodyFat, 18.7);
    assert.equal(entry.bodyFatMass, 13.8);
    assert.equal(entry.bmi, 23.5);
    assert.equal(entry.bmr, 1665);
    assert.equal(entry.visceralFat, 6);
    assert.equal(entry.inbodyScore, 78);
    assert.equal(entry.height, 177);
    assert.equal(localDateInput(entry.date), '2026-11-28');
    const text = fs.readFileSync(new URL('../sync/pickle-inbox.json', import.meta.url), 'utf8');
    assert.equal(/변상균|모리|010-?\d{4}|bsg/i.test(text), false);
});
