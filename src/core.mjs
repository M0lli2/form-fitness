export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export function numberIn(value, min, max, label) { const n = Number(value); if (String(value).trim() === '' || !Number.isFinite(n) || n < min || n > max)
    throw Error(`${label}: ${min}~${max} 범위로 입력하세요.`); return n; }
export function validateBody(input) { const date = new Date(input.date); if (!Number.isFinite(+date) || +date > Date.now() + 60000)
    throw Error('측정일을 확인하세요.'); const out = { id: input.id || uid(), date: date.toISOString(), weight: numberIn(input.weight, 20, 400, '체중'), source: 'manual', note: String(input.note || '').slice(0, 2000), photo: input.photo || null }; for (const [key, min, max, label] of [['bodyFat', 0, 75, '체지방률'], ['muscle', 1, 150, '골격근량'], ['height', 80, 250, '키'], ['visceralFat', 1, 30, '내장지방 레벨'], ['bmr', 300, 5000, '기초대사량'], ['waist', 30, 250, '허리둘레']]) {
    if (input[key] !== undefined && input[key] !== null && input[key] !== '')
        out[key] = numberIn(input[key], min, max, label);
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
export function applyWatchCommand(session, cmd, seen) { if (!session || !cmd || seen.includes(cmd.id) || cmd.sessionId !== session.id || cmd.action !== 'completeSet')
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
    throw Error('지원하지 않는 백업 파일입니다.'); if (value.history.length > 10000 || value.body.length > 10000)
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
