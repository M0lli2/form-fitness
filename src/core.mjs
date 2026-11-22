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
/** 훈련 목적별 %1RM·반복·세트·휴식. NSCA/ACSM 권장 범위의 중간값을 씁니다. */
export const TRAINING_GOALS = {
    strength: { id: 'strength', label: '스트렝스', percent: 0.85, percentLabel: '85% 1RM', reps: 4, repsLabel: '3~5회', sets: 4, rest: 180 },
    hypertrophy: { id: 'hypertrophy', label: '근비대', percent: 0.75, percentLabel: '75% 1RM', reps: 10, repsLabel: '8~12회', sets: 3, rest: 90 },
    endurance: { id: 'endurance', label: '근지구력', percent: 0.6, percentLabel: '60% 1RM', reps: 15, repsLabel: '15~20회', sets: 3, rest: 60 },
};
export function trainingGoal(id) { return TRAINING_GOALS[id] ?? TRAINING_GOALS.hypertrophy; }
/** 장비에 맞는 실제 적재 단위로 반올림합니다(바벨·머신 2.5kg, 덤벨·케틀벨 2kg, 그 외 1kg). */
export function roundLoad(weight, equipment) {
    if (!(weight > 0)) return 0;
    const step = ['덤벨', '케틀벨'].includes(equipment) ? 2 : ['바벨', '머신', '케이블'].includes(equipment) ? 2.5 : 1;
    return Math.max(step, Math.round(weight / step) * step);
}
/** 기록에서 그 종목의 가장 높은 추정 1RM을 찾습니다(Epley). */
export function bestOneRm(history = [], exerciseId) {
    let best = null;
    for (const session of Array.isArray(history) ? history : []) {
        const exercise = session?.exercises?.find(item => item.id === exerciseId);
        for (const set of exercise?.sets ?? []) {
            if (!set.done || set.kind === 'warmup') continue;
            const value = estimated1RM(Number(set.weight) || 0, Number(set.reps) || 0);
            if (value && (!best || value > best.value)) best = { value, weight: Number(set.weight), reps: Number(set.reps), at: session.startedAt ?? null };
        }
    }
    return best;
}
/** 종목군별 초보~초중급 안전 계수(제지방량 대비). 스쿼트·데드·벤치·로우 같은 복합 동작에서
 *  무리 없이 시작할 수 있는 추정 1RM을 위해 보수적으로 잡았습니다. */
const BODY_FACTORS = [
    [/데드리프트|히프 쓰러스트|굿모닝/, 1.25],
    [/스쿼트|런지|레그프레스|레그 익스텐션|레그 컬|카프|브릿지/, 1.0],
    [/벤치|체스트|푸시업|푸시|딥스|플라이/, 0.8],
    [/로우|풀업|친업|풀다운|랫/, 0.6],
    [/오버헤드|숄더|레터럴|아놀드/, 0.55],
    [/컬|익스텐션|레이즈|킥백|푸시다운/, 0.35],
];
/** 최신 체성분으로 종목군별 초기 추정 1RM을 구합니다. 기록이 하나도 없을 때만 씁니다. */
export function bodyStart(exercise, body = []) {
    if (!exercise) return null;
    const entries = [...(Array.isArray(body) ? body : [])]
        .filter(entry => Number(entry?.weight) > 0)
        .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
    const latest = entries[0];
    if (!latest) return null;
    const weight = Number(latest.weight);
    const fat = Number(latest.bodyFat);
    const muscle = Number(latest.muscle);
    const lean = Number.isFinite(fat) && fat > 0 && fat < 60 ? weight * (1 - fat / 100)
        : Number.isFinite(muscle) && muscle > 0 ? muscle * 1.6 : weight * 0.8;
    const text = `${exercise.name ?? ''} ${exercise.equipment ?? ''} ${exercise.muscle ?? ''}`;
    const factor = (BODY_FACTORS.find(([pattern]) => pattern.test(text)) ?? [null, 0.5])[1];
    const bodyweight = ['맨몸', '소도구'].includes(exercise.equipment);
    return { lean: Math.round(lean * 10) / 10, factor, bodyweight, oneRm: Math.round(lean * factor * 10) / 10,
        entry: latest };
}
/** 선택한 훈련 목적에 맞춘 무게·반복·세트·휴식과 그 근거입니다.
 *  이전 기록이 있으면 추정 1RM + 점진적 과부하, 없으면 최신 체성분 기반 초기 추정을 씁니다. */
export function goalRecommendation(history = [], exercise, goalId, body = []) {
    const goal = trainingGoal(goalId);
    const previous = recommendation(history, exercise?.id);
    const best = bestOneRm(history, exercise?.id);
    const oneRm = best?.value ?? (previous ? estimated1RM(previous.weight, previous.reps) : null);
    if (oneRm) {
        const step = ['덤벨', '케틀벨'].includes(exercise?.equipment) ? 2 : ['바벨', '머신', '케이블'].includes(exercise?.equipment) ? 2.5 : 1;
        const lift = previous && previous.reps >= goal.reps + 2;
        const weight = roundLoad(oneRm * goal.percent + (lift ? step : 0), exercise?.equipment);
        const rest = recommendedRest(exercise, previous, goal.id);
        return { ...goal, id: goal.id, hasHistory: true, source: 'history', weight, rest, oneRm: Math.round(oneRm * 10) / 10, previous,
            reason: `${goal.label}(${goal.percentLabel}) · 이전 기록 추정 1RM ${Math.round(oneRm * 10) / 10}kg 기준 → ${weight}kg × ${goal.reps}회 · ${goal.sets}세트 · 휴식 ${rest}초` };
    }
    const start = bodyStart(exercise, body);
    if (start) {
        const weight = start.bodyweight ? 0 : roundLoad(start.oneRm * goal.percent, exercise?.equipment);
        const rest = recommendedRest(exercise, { weight: start.oneRm }, goal.id);
        const basis = start.entry.bodyFat ? `체중 ${start.entry.weight}kg·체지방 ${start.entry.bodyFat}%`
            : start.entry.muscle ? `체중 ${start.entry.weight}kg·골격근 ${start.entry.muscle}kg` : `체중 ${start.entry.weight}kg`;
        return { ...goal, id: goal.id, hasHistory: false, source: 'body', weight, rest, oneRm: start.oneRm,
            reason: start.bodyweight
                ? `${goal.label}(${goal.percentLabel}) · ${basis} 기반 체중 종목 → ${goal.repsLabel} × ${goal.sets}세트 · 휴식 ${rest}초`
                : `${goal.label}(${goal.percentLabel}) · ${basis} 기반 초기 추정 1RM ${start.oneRm}kg → ${weight}kg × ${goal.reps}회 · ${goal.sets}세트 · 휴식 ${rest}초` };
    }
    const rest = recommendedRest(exercise, null, goal.id);
    return { ...goal, id: goal.id, hasHistory: false, source: 'none', weight: 0, rest, oneRm: null,
        reason: `${goal.label}(${goal.percentLabel}) · 첫 기록입니다. ${goal.repsLabel} × ${goal.sets}세트 · 휴식 ${rest}초 · 인바디·체성분을 기록하면 맞춤 초기 중량이 더 정확해집니다` };
}
/** 장비·종류·훈련 목적에 맞는 휴식 시간입니다. */
export function recommendedRest(exercise, previous, goalId = 'hypertrophy') {
    if (!exercise) return 90;
    if (exercise.type === 'cardio') return 60;
    if (exercise.type === 'duration') return exercise.muscle === '스트레칭' ? 30 : 45;
    const heavy = exercise.equipment === '바벨' || Number(previous?.weight ?? previous?.sets?.at(-1)?.weight ?? 0) >= 80;
    const goal = trainingGoal(goalId).id;
    if (goal === 'strength') return heavy ? 180 : 120;
    if (goal === 'endurance') return 60;
    return heavy ? 120 : 90;
}
/** 어느 세트를 고치든 그 뒤의 미완료·미수정 세트에 같은 값을 채웁니다.
 * 예전에는 1세트(index 0)만 전파해서, 준비 화면에서 2세트를 고치면 3·4세트가 0으로 남았습니다(IMG_9256).
 * 직접 고친 세트는 edited로 남겨 앞 세트의 자동 반영에서 제외하고, 0번 세트는 전파 기준값으로 남깁니다. */
export const SET_VALUE_KEYS = ['weight', 'reps', 'seconds', 'distance', 'rpe'];
export function editSets(sets, index, patch) {
    const set = sets?.[index];
    if (!set) return sets;
    Object.assign(set, patch);
    if (index !== 0) set.edited = true;
    for (const next of sets.slice(index + 1)) {
        if (next.done || next.edited) continue;
        for (const key of SET_VALUE_KEYS) {
            if (patch[key] !== undefined) next[key] = set[key];
        }
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
/** 루틴·추천 구성·기록 다시하기도 세트와 중량을 먼저 확인하는 준비 화면으로 들어갑니다(IMG_9257·IMG_9258).
 * 타이머는 사용자가 상단의 `운동 시작`을 누를 때 beginPreparedWorkout이 시작합니다. */
export function prepareSession(name, exercises = [], history = []) {
    return {...makeSession(name, exercises, history), preparing: true};
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
/** 측정한 날짜 그대로(입력 시점 기준) 체성분 추이를 만듭니다. 주 단위로 묶지 않습니다. */
export function bodyTrend(body = [], limit = 12) {
    const points = [...(Array.isArray(body) ? body : [])]
        .filter(entry => Number.isFinite(Date.parse(entry?.date)) && Number(entry.weight) > 0)
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        .map(entry => {
            const date = new Date(entry.date);
            return { id: entry.id, date: entry.date, label: `${date.getMonth() + 1}/${date.getDate()}`,
                weight: Number(entry.weight), muscle: entry.muscle ?? null, bodyFat: entry.bodyFat ?? null,
                height: entry.height ?? null };
        });
    const recent = points.slice(-limit);
    const series = key => {
        const values = recent.filter(point => Number.isFinite(point[key])).map(point => point[key]);
        if (!values.length) return null;
        const first = values[0], last = values[values.length - 1];
        const previous = values.length > 1 ? values[values.length - 2] : null;
        return { first, last, previous, delta: Math.round((last - first) * 10) / 10,
            deltaFromPrevious: previous === null ? null : Math.round((last - previous) * 10) / 10 };
    };
    return { points: recent, count: points.length, weight: series('weight'), muscle: series('muscle'), bodyFat: series('bodyFat') };
}
/** 인바디 결과지(OCR 또는 붙여넣기) 텍스트에서 신장·체중·골격근량·체지방을 읽습니다.
 *  표준체중·표준체지방처럼 기준값이 섞여 있어도 실제 측정값만 고릅니다. */
export function parseInbodyText(text) {
    const source = String(text ?? '').replace(/\u00a0/g, ' ').replace(/：/g, ':');
    const number = '([0-9]+(?:[.,][0-9]+)?)';
    const read = patterns => {
        for (const pattern of patterns) {
            const match = source.match(pattern);
            if (!match) continue;
            const value = Number(String(match[1]).replace(',', '.'));
            if (Number.isFinite(value) && value > 0) return value;
        }
        return null;
    };
    const height = read([new RegExp('(?<!표준)신장[^0-9]{0,6}' + number), new RegExp('(?<!표준)키[^0-9]{0,6}' + number, 'i'), new RegExp('height[^0-9]{0,6}' + number, 'i')]);
    const weight = read([new RegExp('(?<!표준)(?<!적정)체중[^0-9]{0,6}' + number), new RegExp('(?<!표준)몸무게[^0-9]{0,6}' + number), new RegExp('weight[^0-9]{0,6}' + number, 'i')]);
    const muscle = read([new RegExp('골격근량[^0-9]{0,6}' + number), new RegExp('skeletal muscle mass[^0-9]{0,6}' + number, 'i')]);
    const fatMass = read([new RegExp('(?<!표준)체지방량[^0-9]{0,6}' + number), new RegExp('body fat mass[^0-9]{0,6}' + number, 'i')]);
    const percent = read([new RegExp('(?<!표준)체지방률[^0-9]{0,6}' + number), new RegExp('body fat(?: percentage)?[^0-9]{0,6}' + number, 'i')]);
    const bodyFat = percent ?? (fatMass && weight ? Math.round(fatMass / weight * 1000) / 10 : null);
    const values = { height, weight, muscle, bodyFat };
    const keys = Object.entries(values).filter(([, value]) => value !== null).map(([key]) => key);
    return { ...values, fatMass, count: keys.length, keys };
}

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
    if (typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ids) || r.ids.some(id => typeof id !== 'string')
        || (r.recommended !== undefined && typeof r.recommended !== 'boolean'))
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

/** 루틴 이름·운동 목록·추천 포함 여부를 한 곳에서 정리합니다. 사용자가 직접 쓴 이름을 그대로 살립니다. */
export function normalizeRoutine(input) {
    const name = String(input?.name ?? '').trim();
    if (!name) throw Error('루틴 이름을 입력하세요.');
    if (name.length > 40) throw Error('루틴 이름은 40자 이내로 입력하세요.');
    const ids = [...new Set((Array.isArray(input?.ids) ? input.ids : []).filter(id => typeof id === 'string' && id))];
    if (!ids.length) throw Error('루틴에 운동을 하나 이상 넣으세요.');
    return {
        id: typeof input?.id === 'string' && input.id ? input.id : uid(),
        name,
        subtitle: String(input?.subtitle ?? '').trim() || '나만의 트레이닝',
        ids,
        recommended: input?.recommended !== false,
    };
}
/** 저장과 수정을 같은 경로로 처리합니다. 같은 ID는 내용만 바꾸고 목록 맨 앞으로 올립니다. */
export function saveRoutine(routines = [], routine) {
    const next = normalizeRoutine(routine);
    const list = Array.isArray(routines) ? routines : [];
    return [next, ...list.filter(item => item?.id !== next.id)];
}
/** 삭제는 루틴만 지웁니다. 운동 기록과 세션은 건드리지 않습니다. */
export function removeRoutine(routines = [], id) {
    return (Array.isArray(routines) ? routines : []).filter(item => item?.id !== id);
}
/** 홈 추천·추천 카드에는 recommended가 false가 아닌 루틴만 씁니다. 예전 루틴은 추천에 포함합니다. */
export function recommendedRoutines(routines = []) {
    return (Array.isArray(routines) ? routines : []).filter(item => item?.recommended !== false);
}
/** 카드에서 추천 포함 스위치만 바꿀 때 순서와 내용은 그대로 둡니다. */
export function setRoutineRecommended(routines = [], id, recommended) {
    return (Array.isArray(routines) ? routines : []).map(item => item?.id === id ? {...item, recommended: recommended !== false} : item);
}
