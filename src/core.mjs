export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
/** Format the stored instant as a local calendar day without UTC slicing or locale assumptions.
 * @param {string | number | Date} value
 */
export function localDateInput(value = new Date()) {
    const date = new Date(value);
    if (!Number.isFinite(+date)) throw Error('측정일을 확인하세요.');
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
/** Parse a measurement day locally; reject rollover dates such as February 30. */
export function measurementDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw Error('측정일은 YYYY-MM-DD 형식으로 입력하세요.');
    const [, y, m, d] = match.map(Number);
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) throw Error('존재하지 않는 날짜입니다.');
    return date.toISOString();
}
export function numberIn(value, min, max, label) { const n = Number(value); if (String(value).trim() === '' || !Number.isFinite(n) || n < min || n > max)
    throw Error(`${label}: ${min}~${max} 범위로 입력하세요.`); return n; }
export function validateBody(input) { const date = new Date(input.date); if (!Number.isFinite(+date) || +date > Date.now() + 60000)
    throw Error('측정일을 확인하세요.'); const out = { id: input.id || uid(), date: date.toISOString(), weight: numberIn(input.weight, 20, 400, '체중'), source: 'manual', note: String(input.note || '').slice(0, 2000), photo: input.photo || null }; for (const [key, min, max, label] of [['bodyFat', 0, 75, '체지방률'], ['muscle', 1, 150, '골격근량'], ['height', 80, 250, '키'], ['visceralFat', 1, 30, '내장지방 레벨'], ['bmr', 300, 5000, '기초대사량'], ['waist', 30, 250, '허리둘레']]) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '')
        out[key] = numberIn(input[key], min, max, label);
} if (input.revision !== undefined) {
    if (!Number.isInteger(input.revision) || input.revision < 1 || input.revision > 2147483647) throw Error('기록 버전을 확인하세요.');
    out.revision = input.revision;
} if (out.muscle && out.muscle > out.weight)
    throw Error('골격근량은 체중보다 클 수 없습니다.'); return out; }
export function volume(session) { return session.exercises.reduce((sum, e) => sum + e.sets.filter(s => s.done && s.kind !== 'warmup').reduce((a, s) => a + (s.weight || 0) * (s.reps || 0), 0), 0); }
export function estimated1RM(weight, reps) { return weight > 0 && reps > 0 && reps <= 12 ? weight * (1 + reps / 30) : null; }
export function validateSession(session) { if (!session.exercises.some(e => e.sets.some(s => s.done)))
    throw Error('완료한 세트를 하나 이상 기록하세요.'); for (const e of session.exercises)
    for (const s of e.sets.filter(s => s.done)) {
        numberIn(s.weight ?? 0, 0, 1000, '중량');
        if (e.type === 'strength')
            numberIn(s.reps, 1, 1000, '횟수');
        else
            numberIn(s.seconds, 1, 86400, '시간');
        if (s.rpe !== '' && s.rpe != null)
            numberIn(s.rpe, 1, 10, 'RPE');
    } return session; }
/** 같은 종목의 가장 최근 완료 기록에서 실제로 마친 세트들을 뽑습니다.
 * @param {any[]} history 최신순으로 쌓인 세션 목록
 * @param {string} exerciseId */
export function previousSets(history = [], exerciseId) {
    let latest = null;
    for (const session of Array.isArray(history) ? history : []) {
        const exercise = session?.exercises?.find(item => item.id === exerciseId);
        const sets = (exercise?.sets ?? []).filter(set => set.done && set.kind !== 'warmup')
            .map(set => ({ weight: Number(set.weight) || 0, reps: Number(set.reps) || 0 }));
        if (!sets.length) continue;
        const at = Date.parse(session.endedAt ?? session.startedAt ?? '') || 0;
        if (!latest || at >= latest.at) latest = { at, startedAt: session.startedAt ?? null, sets };
    }
    return latest;
}
/** 이전 기록에서 가장 무거운(같으면 더 많이 반복한) 작업 세트를 추천 기준으로 씁니다. */
export function recommendation(history = [], exerciseId) {
    const previous = previousSets(history, exerciseId);
    if (!previous) return null;
    const top = previous.sets.reduce((best, set) => set.weight > best.weight
        || (set.weight === best.weight && set.reps > best.reps) ? set : best, previous.sets[0]);
    return { weight: top.weight, reps: top.reps, sets: previous.sets.length, at: previous.startedAt };
}
/** 휴식 시간은 15초에서 600초 사이 정수로 맞춥니다. */
export function clampRest(value) {
    if (value === null || value === undefined || String(value).trim() === '') return 90;
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return 90;
    return Math.max(15, Math.min(600, Math.round(seconds)));
}
/** 장비와 종류로 휴식 시간을 정합니다. 바벨·고중량 복합 동작 120초, 머신·덤벨·케이블 90초, 맨몸·코어 60초. */
export function recommendedRest(exercise, previous) {
    if (!exercise) return 90;
    if (exercise.type === 'cardio') return 60;
    if (exercise.type === 'duration') return exercise.muscle === '스트레칭' ? 30 : 45;
    const weight = Number(previous?.weight ?? previous?.sets?.at(-1)?.weight ?? 0);
    if (exercise.equipment === '바벨' || weight >= 80) return 120;
    if (['머신', '케이블', '덤벨', '케틀벨', '소도구'].includes(exercise.equipment)) return 90;
    return 60;
}
/** 첫 세트를 고치면 아직 끝내지 않았고 직접 손대지 않은 뒤 세트에도 같은 중량·횟수를 채웁니다.
 * 2세트 이후를 직접 고친 세트는 edited로 남겨 자동 반영에서 제외합니다. */
export function editSets(sets, index, patch) {
    const set = sets?.[index];
    if (!set) return sets;
    Object.assign(set, patch);
    if (index !== 0) { set.edited = true; return sets; }
    for (const next of sets.slice(1)) {
        if (next.done || next.edited) continue;
        if (patch.weight !== undefined) next.weight = set.weight;
        if (patch.reps !== undefined) next.reps = set.reps;
    }
    return sets;
}
/** 새로 추가한 세트는 직전 세트의 중량·횟수를 그대로 이어받습니다. */
export function appendSet(sets = []) {
    const last = sets[sets.length - 1];
    const base = last ? { ...last } : { weight: 0, reps: 10, seconds: 30, distance: 0, rpe: '', kind: 'normal' };
    return [...sets, { ...base, id: uid(), done: false, edited: false }];
}
export function makeSession(name, exercises, history = []) { return { id: uid(), name, startedAt: new Date().toISOString(), restEndsAt: null, exercises: exercises.map(e => { const previous = e.type === 'strength' ? previousSets(history, e.id) : null; const count = e.type === 'strength' ? Math.min(6, Math.max(1, previous?.sets.length ?? 3)) : 1; return { id: e.id, name: e.name, type: e.type, muscle: e.muscle, sets: Array.from({ length: count }, (_, i) => { const source = previous ? previous.sets[Math.min(i, previous.sets.length - 1)] : null; return { id: uid(), weight: source?.weight ?? 0, reps: source?.reps ?? (e.type === 'strength' ? 10 : 0), seconds: e.type === 'cardio' ? 1200 : 30, distance: 0, rpe: '', kind: 'normal', done: false }; }), note: '' }; }) }; }
/** Persist the pause instant and the remaining rest so both survive an app restart. */
export function toggleWorkoutPause(session, now = Date.now()) {
    if (session.preparing) return session;
    const {pausedAt, pausedRestMs, ...current} = session;
    if (pausedAt !== undefined) {
        return {...current, pausedMs:(current.pausedMs ?? 0) + Math.max(0, now - pausedAt),
            restEndsAt:pausedRestMs > 0 ? now + pausedRestMs : null};
    }
    return {...current, pausedAt:now, restEndsAt:null,
        pausedRestMs:Math.max(0, (current.restEndsAt ?? now) - now)};
}
export function workoutElapsedSeconds(session, now = Date.now()) {
    if (session.preparing) return 0;
    const end = session.pausedAt ?? (session.endedAt ? Date.parse(session.endedAt) : now);
    const pausedMs = Number.isFinite(session.pausedMs) ? Math.max(0, session.pausedMs) : 0;
    return Math.max(0, Math.floor((end - Date.parse(session.startedAt) - pausedMs) / 1000));
}
export function closeWorkout(session, now = Date.now()) {
    if (session.preparing) throw Error('먼저 운동을 시작하세요.');
    validateSession(session);
    const {pausedAt, pausedRestMs, ...record} = session;
    const end = Math.max(now, Date.parse(record.startedAt) + 1);
    return {...record, endedAt:new Date(end).toISOString(), restEndsAt:null,
        pausedMs:(record.pausedMs ?? 0) + (pausedAt === undefined ? 0 : Math.max(0, end - pausedAt))};
}
/** Save the selection before starting the clock; older saved sessions have no preparing flag. */
export function prepareWorkout() {
    return {...makeSession('자유 운동',[]),preparing:true};
}
export function beginPreparedWorkout(session, now = Date.now()) {
    if (!session.preparing) return session;
    const {preparing, ...ready} = session;
    return {...ready,startedAt:new Date(now).toISOString()};
}
export function applyWatchCommand(session, cmd, seen) { if (!session || session.preparing || session.pausedAt !== undefined || !cmd || seen.includes(cmd.id) || cmd.sessionId !== session.id || cmd.action !== 'completeSet')
    return { session, accepted: false }; const clone = structuredClone(session), e = clone.exercises.find(x => x.id === cmd.exerciseId), s = e?.sets.find(x => x.id === cmd.setId); if (!s || s.done)
    return { session, accepted: false }; s.done = true; try {
    validateSession(clone);
}
catch {
    return { session, accepted: false };
} return { session: clone, accepted: true }; }
export function weekStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
/** Group completed sessions by local calendar day, including weeks containing a DST change. */
export function calendarWeekVolume(sessions, reference = new Date()) {
    const start = weekStart(reference);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const today = localDateInput(reference);
    const days = Array.from({length:7},(_,index)=>{
        const date = new Date(start);
        date.setDate(date.getDate() + index);
        const key = localDateInput(date);
        return {date,key,isToday:key===today,count:0,volume:0};
    });
    const byDate = new Map(days.map(day=>[day.key,day]));
    for (const session of sessions) {
        const date = new Date(session.startedAt);
        if (!Number.isFinite(+date) || date < start || date >= end) continue;
        const day = byDate.get(localDateInput(date));
        if (!day) continue;
        day.count++;
        day.volume += volume(session);
    }
    return {days,count:days.reduce((n,day)=>n+day.count,0),volume:days.reduce((n,day)=>n+day.volume,0)};
}
export function bmi(weight, height) { return height ? weight / (height / 100) ** 2 : null; }
export function validateBackup(value) { if (value?.schema !== 1 || !Array.isArray(value.history) || !Array.isArray(value.body) || !Array.isArray(value.routines))
    throw Error('지원하지 않는 백업 파일입니다.'); if (value.customExercises !== undefined) {
    if (!Array.isArray(value.customExercises) || value.customExercises.length > 2000) throw Error('사용자 운동 형식을 확인하세요.');
    for (const exercise of value.customExercises) validateCustomExercise(exercise);
} if (value.history.length > 10000 || value.body.length > 10000)
    throw Error('백업 크기 제한을 초과했습니다.'); for (const h of value.history) {
    if (typeof h.id !== 'string' || typeof h.name !== 'string' || !Number.isFinite(Date.parse(h.startedAt)) || !Number.isFinite(Date.parse(h.endedAt)) || !Array.isArray(h.exercises))
        throw Error('운동 기록 형식이 올바르지 않습니다.');
    for (const e of h.exercises) {
        if (typeof e.name !== 'string' || !Array.isArray(e.sets))
            throw Error('세트 형식이 올바르지 않습니다.');
    }
    if (Date.parse(h.endedAt) <= Date.parse(h.startedAt)) throw Error('운동 종료 시간을 확인하세요.');
    if (!(h.external === true && h.exercises.length === 0 && ['watch','synced'].includes(h.sync))) validateSession(h);
} for (const b of value.body)
    validateBody(b); for (const r of value.routines)
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ids) || r.ids.some(id => typeof id !== 'string'))
        throw Error('루틴 형식이 올바르지 않습니다.'); return value; }

/** Keep export revisions stable on retries and increment only when a local edit is saved.
 * @param {{revision?: number} | null | undefined} previous
 */
export function nextBodyRevision(previous) {
    if (!previous) return 1;
    const revision = previous.revision ?? 1;
    if (!Number.isInteger(revision) || revision < 1 || revision >= 2147483647)
        throw Error('기록 버전을 확인하세요.');
    return revision + 1;
}

/** Validate user-defined movements before catalog display or backup import. */
export function validateCustomExercise(input) {
    const field = (value, label, max = 120) => {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
            throw Error(label + ' 입력을 확인하세요.');
        return value.trim();
    };
    if (!['strength','cardio','isometric'].includes(input?.type)) throw Error('운동 기록 방식을 선택하세요.');
    if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 12) throw Error('운동 방법은 1~12단계로 입력하세요.');
    return {
        id: input.id ? field(input.id, '운동 ID') : 'custom-' + uid(),
        name: field(input.name, '운동 이름', 80), muscle: field(input.muscle, '운동 부위', 40),
        equipment: field(input.equipment, '사용 장비', 60), type: input.type, level: '사용자 등록',
        steps: input.steps.map(step => field(step, '운동 방법', 500)),
        caution: typeof input.caution === 'string' ? input.caution.trim().slice(0,1000) : ''
    };
}

