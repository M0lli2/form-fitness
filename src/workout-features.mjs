/** 0.3.5 운동 중 조작·기록 분석·도감 필터·원판 계산의 순수 로직.
 *  화면(React Native)과 분리해 node --test로 검증합니다. 저장 형식은 기존 세션·세트 구조를 그대로 씁니다. */
import {bestOneRm, calendarWeekVolume, estimated1RM, localDateInput, previousSets, volume} from './core.mjs';
import {exerciseTargets} from './muscle-filter.mjs';

const round1 = value => Math.round(Number(value) * 10) / 10;
const round2 = value => Math.round(Number(value) * 100) / 100;

/** 배열 한 항목을 다른 자리로 옮긴 새 배열. 범위를 벗어나면 원본을 그대로 돌려줍니다. */
/** @template T @param {T[]} list @param {number} from @param {number} to @returns {T[]} */
export function moveItem(list, from, to) {
    if (!Array.isArray(list) || from === to) return list;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
}

/** 운동 세션 안에서 종목 순서를 위(−1)·아래(+1)로 바꿉니다. 슈퍼세트 표시는 종목을 따라갑니다. */
/** @param {any} session @param {string} exerciseId @param {number} direction @returns {any} */
export function moveExercise(session, exerciseId, direction) {
    const list = session?.exercises ?? [];
    const index = list.findIndex(item => item.id === exerciseId);
    const to = index + (direction < 0 ? -1 : 1);
    if (index < 0 || to < 0 || to >= list.length) return session;
    return {...session, exercises: moveItem(list, index, to)};
}

/** 슈퍼세트로 묶인 종목은 같은 묶음 안에서 번갈아, 나머지는 목록 순서대로 다음 종목을 고릅니다. */
/** @param {any} session @param {string} currentId @returns {any | null} */
export function nextExercise(session, currentId) {
    const list = session?.exercises ?? [];
    const index = list.findIndex(item => item.id === currentId);
    if (index < 0) return list.find(item => item.sets?.some(set => !set.done)) ?? null;
    const current = list[index];
    const pending = item => item?.sets?.some(set => !set.done) && item.id !== currentId;
    if (current.superset) {
        const group = list.filter(item => item.superset === current.superset);
        const at = group.findIndex(item => item.id === currentId);
        for (let step = 1; step <= group.length; step++) {
            const candidate = group[(at + step) % group.length];
            if (pending(candidate)) return candidate;
        }
    }
    for (let step = 1; step <= list.length; step++) {
        const candidate = list[(index + step) % list.length];
        if (pending(candidate)) return candidate;
    }
    return null;
}

/** 이 종목의 순번(1부터). 화면의 `3 / 5 운동` 표기와 순서 변경에 함께 씁니다. */
export function exercisePosition(session, exerciseId) {
    const index = (session?.exercises ?? []).findIndex(item => item.id === exerciseId);
    return index < 0 ? 1 : index + 1;
}

/** 슈퍼세트 묶음 이름(A, B, …). 묶이지 않았으면 null. */
export function supersetLabel(session, exerciseId) {
    return session?.exercises?.find(item => item.id === exerciseId)?.superset ?? null;
}

const SUPERSET_LETTERS = 'ABCDEFGH';
function freeLetter(exercises, except = []) {
    const used = new Set(exercises.filter(item => !except.includes(item.id)).map(item => item.superset).filter(Boolean));
    return [...SUPERSET_LETTERS].find(letter => !used.has(letter)) ?? null;
}
function detach(session, id) {
    const exercises = session.exercises.map(item => ({...item}));
    const target = exercises.find(item => item.id === id);
    if (!target?.superset) return exercises;
    const label = target.superset;
    target.superset = undefined;
    const members = exercises.filter(item => item.superset === label);
    if (members.length === 1) members[0].superset = undefined;
    return exercises;
}

/** 종목을 앞(또는 뒤) 종목과 슈퍼세트로 묶거나, 이미 묶였으면 풉니다.
 *  한 묶음에는 최소 두 종목이 남고, 남은 종목이 하나면 표시도 지웁니다. */
/** @param {any} session @param {string} exerciseId @returns {any} */
export function toggleSuperset(session, exerciseId) {
    if (!session?.exercises?.length) return session;
    const index = session.exercises.findIndex(item => item.id === exerciseId);
    if (index < 0) return session;
    if (session.exercises[index].superset) return {...session, exercises: detach(session, exerciseId)};
    const partner = session.exercises[index - 1] ?? session.exercises[index + 1];
    if (!partner) return session;
    let exercises = detach(session, partner.id);
    const label = freeLetter(exercises) ?? 'A';
    exercises = exercises.map(item => item.id === exerciseId || item.id === partner.id ? {...item, superset: label} : item);
    return {...session, exercises};
}

/** 슈퍼세트 묶음 목록. 화면에서 `슈퍼세트 A · 2종목`을 표시할 때 씁니다. */
export function supersetGroups(session) {
    const groups = new Map();
    for (const item of session?.exercises ?? []) {
        if (!item.superset) continue;
        if (!groups.has(item.superset)) groups.set(item.superset, []);
        groups.get(item.superset).push(item);
    }
    return groups;
}

/** 같은 부위·비슷한 근육의 대체 종목을 고릅니다. 이미 세션에 들어간 종목과 자기 자신은 뺍니다. */
/** @param {any[]} exercises @param {any} current @param {any} session @param {{limit?: number}} [options] @returns {any[]} */
export function substitutionCandidates(exercises, current, session, {limit = 12} = {}) {
    if (!current) return [];
    const inSession = new Set((session?.exercises ?? []).map(item => item.id));
    const base = exerciseTargets(current);
    const scored = (exercises ?? [])
        .filter(item => item && item.id !== current.id && !inSession.has(item.id))
        .filter(item => (current.type === 'strength' ? item.type === 'strength' : true))
        .map(item => {
            const targets = exerciseTargets(item);
            let score = 0;
            if (item.muscle === current.muscle) score += 4;
            if (item.equipment === current.equipment) score += 1;
            for (const muscle of targets.primary) if (base.primary.includes(muscle)) score += 2;
            for (const muscle of targets.secondary) if (base.primary.includes(muscle)) score += 1;
            for (const muscle of base.secondary) if (targets.primary.includes(muscle)) score += 1;
            if (item.equipment === '맨몸') score += 0.25;
            return {item, score};
        })
        .filter(entry => entry.score > 0)
        .sort((a, b) => b.score - a.score || String(a.item.name).localeCompare(String(b.item.name), 'ko'));
    return scored.slice(0, limit).map(entry => entry.item);
}

/** 세트 수와 종류는 유지하고 종목만 같은 부위의 대체 종목으로 바꿉니다.
 *  완료 체크는 풀고, 새 종목의 직전 기록이 있으면 그 중량·횟수로 채웁니다. */
/** @param {any} session @param {string} exerciseId @param {any} replacement @param {any[]} [history] @returns {any} */
export function replaceExercise(session, exerciseId, replacement, history = []) {
    if (!session || !replacement) return session;
    const previous = previousSets(history, replacement.id)?.sets ?? [];
    const exercises = session.exercises.map(item => {
        if (item.id !== exerciseId) return item;
        return {...item, id: replacement.id, name: replacement.name, type: replacement.type, muscle: replacement.muscle,
            sets: item.sets.map((set, index) => {
                const source = previous[Math.min(index, previous.length - 1)];
                return {...set, weight: source?.weight ?? 0, reps: source?.reps ?? (replacement.type === 'strength' ? 10 : 0),
                    done: false, edited: false};
            })};
    });
    return {...session, exercises};
}

/** 직전 세션의 세트별 기록을 화면 순서대로 돌려줍니다. 없으면 null. */
/** @param {any[]} history @param {string} exerciseId @returns {{weight:number,reps:number}[] | null} */
export function previousHints(history, exerciseId) {
    return previousSets(history, exerciseId)?.sets ?? null;
}

/** 직전 세션의 무게·횟수를 이번 세트에 한 번에 채웁니다(0.3.6 '지난 기록 채우기').
 *  이미 완료한 세트는 기록을 보존하고, 직전 기록보다 세트가 많으면 마지막 값을 반복합니다.
 *  채운 세트는 edited로 표시해 추천 무게가 다시 덮어쓰지 않게 합니다. */
/** @param {any[]} sets @param {{weight:number,reps:number}[] | null | undefined} previous */
export function applyPreviousSets(sets, previous) {
    if (!Array.isArray(sets) || !sets.length) return sets ?? [];
    if (!Array.isArray(previous) || !previous.length) return sets;
    return sets.map((set, index) => {
        if (!set || set.done) return set;
        const source = previous[index] ?? previous[previous.length - 1];
        if (!source) return set;
        return {...set, weight: source.weight, reps: source.reps, edited: true};
    });
}

/** 완료한 세트가 있는 종목은 종류(일반·워밍업·드롭)를 순환합니다. */
export function cycleSetKind(kind) {
    return kind === 'warmup' ? 'drop' : kind === 'drop' ? 'normal' : 'warmup';
}

/** 종목 하나의 세션별 추이. 추정 1RM과 볼륨(kg)을 시간순으로 돌려줍니다. */
/** @param {any[]} history @param {string} exerciseId @param {number} [limit] @returns {any[]} */
export function exerciseGrowth(history, exerciseId, limit = 20) {
    const rows = [];
    for (const session of Array.isArray(history) ? history : []) {
        const exercise = session?.exercises?.find(item => item.id === exerciseId);
        const sets = (exercise?.sets ?? []).filter(set => set.done && set.kind !== 'warmup');
        if (!sets.length) continue;
        const best = sets.reduce((top, set) => {
            const oneRm = estimated1RM(Number(set.weight) || 0, Number(set.reps) || 0);
            return oneRm && (!top || oneRm > top.value) ? {value: oneRm, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0} : top;
        }, null);
        const at = session.endedAt ?? session.startedAt;
        rows.push({id: session.id, date: at, label: at ? `${new Date(at).getMonth() + 1}/${new Date(at).getDate()}` : '',
            oneRm: best ? round1(best.value) : null, topWeight: best?.weight ?? null, topReps: best?.reps ?? null,
            volume: round2(volume({exercises: [exercise]})), sets: sets.length});
    }
    rows.sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));
    return rows.slice(-limit);
}

/** 그 종목의 최고 추정 1RM 기록. 없으면 null. */
export function personalBest(history, exerciseId) {
    const best = bestOneRm(history, exerciseId);
    return best ? {...best, value: round1(best.value)} : null;
}

/** 완료된 세션을 시간순으로 훑어 종목별 신기록(PR)을 표시합니다.
 *  첫 기록은 `first`로만 표시하고, 이전 최고를 넘은 경우에만 improved=true입니다. */
/** @param {any[]} [history] @returns {Map<string, any[]>} */
export function historyPrFlags(history = []) {
    const bests = new Map();
    const flags = new Map();
    const ordered = [...history].sort((a, b) => String(a.startedAt ?? '').localeCompare(String(b.startedAt ?? '')));
    for (const session of ordered) {
        const found = [];
        for (const exercise of session?.exercises ?? []) {
            const sets = (exercise.sets ?? []).filter(set => set.done && set.kind !== 'warmup');
            let top = null;
            for (const set of sets) {
                const value = estimated1RM(Number(set.weight) || 0, Number(set.reps) || 0);
                if (value && (!top || value > top.value)) top = {value, weight: Number(set.weight) || 0, reps: Number(set.reps) || 0};
            }
            if (!top) continue;
            const previous = bests.get(exercise.id);
            if (!previous) found.push({id: exercise.id, name: exercise.name, value: round1(top.value), previous: null, first: true});
            else if (top.value > previous.value + 1e-9) found.push({id: exercise.id, name: exercise.name, value: round1(top.value), previous: round1(previous.value), first: false});
            if (!previous || top.value > previous.value) bests.set(exercise.id, top);
        }
        if (found.length) flags.set(session.id, found);
    }
    return flags;
}

/** 직전 완료 세션과 비교한 볼륨 증감, PR, 주간 목표 진행. 운동 완료 요약 카드에 씁니다. */
/** @param {any[]} history @param {any} session @param {number} [goal] @param {Date} [reference] @returns {{id:string|null,volume:number,previousVolume:number|null,volumeDelta:number|null,sets:number,minutes:number,prs:any[],weekCount:number,weekGoal:number,weekPercent:number,date:string|null}} */
export function sessionSummary(history = [], session, goal = 3, reference = new Date()) {
    if (!session) return {id: null, volume: 0, previousVolume: null, volumeDelta: null, sets: 0, minutes: 0, prs: [],
        weekCount: 0, weekGoal: Math.max(1, Number(goal) || 1), weekPercent: 0, date: null};
    const ordered = [...history].filter(item => item?.id && item.endedAt)
        .sort((a, b) => String(a.endedAt).localeCompare(String(b.endedAt)));
    const index = ordered.findIndex(item => item.id === session.id);
    const before = index > 0 ? ordered[index - 1] : index < 0 ? ordered[ordered.length - 1] : null;
    const currentVolume = round2(volume(session));
    const previousVolume = before ? round2(volume(before)) : null;
    const prs = historyPrFlags(history).get(session.id) ?? [];
    const week = calendarWeekVolume(history.filter(item => item.id), reference);
    const sets = session.exercises.reduce((count, exercise) => count + exercise.sets.filter(set => set.done).length, 0);
    const minutes = session.startedAt && session.endedAt
        ? Math.max(1, Math.round((Date.parse(session.endedAt) - Date.parse(session.startedAt)) / 60000)) : 0;
    return {id: session.id, volume: currentVolume, previousVolume,
        volumeDelta: previousVolume === null ? null : round2(currentVolume - previousVolume),
        sets, minutes, prs, weekCount: week.count, weekGoal: Math.max(1, Number(goal) || 1),
        weekPercent: Math.min(100, Math.round(week.count / Math.max(1, Number(goal) || 1) * 100)),
        date: session.endedAt ?? session.startedAt ?? null};
}

/** 주간 목표 진행률. 홈·완료 카드에서 같은 값을 씁니다. */
export function weeklyProgress(history, goal = 3, reference = new Date()) {
    const week = calendarWeekVolume(history, reference);
    const target = Math.max(1, Number(goal) || 1);
    return {count: week.count, goal: target, percent: Math.min(100, Math.round(week.count / target * 100)), volume: round2(week.volume)};
}

/** 기본 원판 재고. 바 20kg, 한쪽에 25·20·15·10·5·2.5·1.25kg을 차례로 채웁니다. */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** 목표 중량을 양쪽 원판 조합으로 나눕니다. 원판으로 정확히 맞출 수 없으면 남는 차이를 remainder로 알립니다.
 *  @param {number} targetKg 바를 포함한 목표 중량
 *  @param {{barKg?: number, plates?: number[]}} [options] */
export function plateMath(targetKg, {barKg = 20, plates = DEFAULT_PLATES} = {}) {
    const target = Number(targetKg);
    if (!Number.isFinite(target) || target <= 0) throw Error('중량을 확인하세요.');
    const bar = Number.isFinite(Number(barKg)) && Number(barKg) >= 0 ? Number(barKg) : 20;
    const perSideTarget = Math.max(0, (target - bar) / 2);
    let left = perSideTarget;
    const perSide = [];
    for (const plate of [...plates].sort((a, b) => b - a)) {
        while (left + 1e-9 >= plate) {
            perSide.push(plate);
            left = round2(left - plate);
        }
    }
    const plateTotal = round2(perSide.reduce((sum, plate) => sum + plate, 0) * 2);
    const loaded = round2(bar + plateTotal);
    return {target: round2(target), barKg: bar, perSide, perSideCount: perSide.length,
        platesTotal: perSide.length * 2, plateTotal, loaded, remainder: round2(target - loaded),
        exact: Math.abs(target - loaded) < 0.005, belowBar: target < bar};
}

/** kg/lb 화면 단위에 맞는 빠른 조절 폭. 저장은 항상 kg입니다. */
export function massStep(unit) {
    return unit === 'lb' ? 5 : 2.5;
}

/** 운동도감 빠른 보기: 최근 한 운동·즐겨찾기·전체. 최근은 최신 세션 순서를 유지합니다. */
/** @param {any[]} exercises @param {string} view @param {{favorites?: string[], recent?: string[]}} [options] @returns {any[]} */
export function libraryPool(exercises, view, {favorites = [], recent = []} = {}) {
    if (view === 'favorite') return (exercises ?? []).filter(item => favorites.includes(item.id));
    if (view === 'recent') {
        const order = new Map((recent ?? []).map((id, index) => [id, index]));
        return (exercises ?? []).filter(item => order.has(item.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
    }
    return [...(exercises ?? [])];
}

/** 최근 완료 세션에서 운동 id를 최신순으로 중복 없이 뽑습니다. */
/** @param {any[]} history @param {number} [limit] @returns {string[]} */
export function recentExerciseIds(history, limit = 10) {
    const ids = [];
    const ordered = [...(history ?? [])].sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
    for (const session of ordered) {
        if (!session?.exercises?.length) continue;
        for (const exercise of session.exercises) {
            if (exercise?.id && !ids.includes(exercise.id)) ids.push(exercise.id);
            if (ids.length >= limit) return ids;
        }
    }
    return ids;
}

/** 즐겨찾기 별표를 켜고 끕니다. */
/** @param {string[]} list @param {string} id @returns {string[]} */
export function toggleFavorite(list = [], id) {
    return list.includes(id) ? list.filter(item => item !== id) : [...list, id];
}

/** 꺾은선 그래프 좌표. 값이 하나거나 모두 같아도 가운데 선으로 그립니다. */
/** @param {(number|null|undefined)[]} values @param {{width?: number, height?: number}} [options]
 *  @returns {{points:{x:number,y:number|null,value:number|null,index:number}[], min:number, max:number, width:number, height:number}} */
export function lineGeometry(values, {width = 280, height = 100} = {}) {
    const finite = (values ?? []).map(value => value === null || value === undefined || String(value).trim() === '' ? null
        : Number.isFinite(Number(value)) ? Number(value) : null);
    const known = finite.filter(value => value !== null);
    if (!known.length) return {points: [], min: 0, max: 0, width, height};
    let min = Math.min(...known);
    let max = Math.max(...known);
    if (max === min) { min -= 1; max += 1; }
    const span = max - min;
    const count = finite.length;
    const points = finite.map((value, index) => ({
        x: count === 1 ? width / 2 : Math.round(index * width / (count - 1) * 100) / 100,
        y: value === null ? null : Math.round((height - (value - min) / span * height) * 100) / 100,
        value, index,
    }));
    return {points, min: round2(min), max: round2(max), width, height};
}

/** 백업·이전 기록에 없는 필드(즐겨찾기)를 기본값과 합칩니다. */
export function normalizeFavorites(value) {
    return [...new Set((Array.isArray(value) ? value : []).filter(id => typeof id === 'string' && id))];
}

/** 오늘 날짜 키. 최근 운동 필터·홈 요약에서 날짜 비교에 씁니다. */
export function todayKey(reference = new Date()) {
    return localDateInput(reference);
}

/** 추천 문구를 화면 폭에 맞는 두 조각으로 나눕니다.
 *  긴 한 문장을 그대로 두면 320pt 폭에서 `첫 기록입 / 니다.`처럼 단어 중간이 잘리고,
 *  목적·반복·세트·휴식이 한 줄에 뭉쳐 읽히지 않습니다.
 *  배지에는 목적과 강도(예: `근비대 75% 1RM`), 아래 줄에는 처방(반복·세트·휴식)과 근거만 남깁니다. */
export function recommendationLines(rec) {
    if (!rec) return {badge: '', detail: ''};
    const badge = [rec.label, rec.percentLabel].filter(Boolean).join(' ');
    const parts = [];
    if (rec.repsLabel) parts.push(`${rec.repsLabel} × ${rec.sets}세트`);
    else if (rec.sets) parts.push(`${rec.sets}세트`);
    if (rec.rest) parts.push(`휴식 ${rec.rest}초`);
    if (rec.source === 'history' && rec.oneRm) parts.push(`이전 추정 1RM ${rec.oneRm}kg 기준`);
    else if (rec.source === 'body') parts.push('체성분 기반 초기 추정');
    else parts.push('첫 기록');
    return {badge, detail: parts.join(' · ')};
}
