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
export function makeSession(name, exercises, history = []) { return { id: uid(), name, startedAt: new Date().toISOString(), restEndsAt: null, exercises: exercises.map(e => { const old = history.flatMap(h => h.exercises).find(x => x.id === e.id); return { id: e.id, name: e.name, type: e.type, muscle: e.muscle, sets: Array.from({ length: e.type === 'strength' ? 3 : 1 }, (_, i) => ({ id: uid(), weight: old?.sets[i]?.weight || 0, reps: old?.sets[i]?.reps || 10, seconds: e.type === 'cardio' ? 1200 : 30, distance: 0, rpe: '', kind: 'normal', done: false })), note: '' }; }) }; }
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

