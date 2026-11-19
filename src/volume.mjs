// 주간 근육 볼륨 집계. 완료한 세트를 근육별로 나눠 세트 수와 볼륨(kg)으로 환산합니다.
// 세트를 채운 주동근은 1, 보조근은 0.5로 셉니다. 3D 근육 매핑이 없는 운동은 운동도감의 부위명으로 대신합니다.
import {muscles, muscleRoles} from './muscle-map.mjs';

/** 운동도감 부위명이 가리키는 근육. 3D 관절 가이드가 없는 운동을 집계할 때 씁니다. */
export const catalogPartMuscles = {
  '가슴': ['pec'],
  '등': ['lats', 'traps'],
  '하체': ['quads', 'hamstrings'],
  '둔근': ['glute'],
  '종아리': ['calves', 'soleus'],
  '어깨': ['delt-front', 'delt-lat', 'delt-rear'],
  '팔': ['biceps', 'triceps'],
  '코어': ['abs', 'erectors'],
};

/** 주동근과 보조근의 세트 가중치입니다. */
const ROLE_WEIGHT = {primary: 1, secondary: .5};
const DAYS = 7;
const round1 = value => Math.round(value * 10) / 10;

/** 완료해서 기록으로 인정하는 세트. 워밍업과 미완료 세트는 볼륨에서 뺍니다. */
export function completedSets(session) {
  return (session?.exercises ?? []).flatMap(exercise => (exercise.sets ?? [])
    .filter(set => set.done && set.kind !== 'warmup')
    .map(set => ({exercise, set})));
}

/** 한 운동이 자극하는 근육과 가중치. 3D 매핑이 있으면 그대로, 없으면 부위명으로 추정합니다. */
export function exerciseMuscleWeights(exercise) {
  const roles = muscleRoles[exercise?.id];
  if (roles) return [
    ...roles.primary.map(id => ({id, weight: ROLE_WEIGHT.primary})),
    ...roles.secondary.map(id => ({id, weight: ROLE_WEIGHT.secondary})),
  ];
  return (catalogPartMuscles[exercise?.muscle] ?? []).map(id => ({id, weight: 1}));
}

/** 세트 하나의 볼륨. 중량×횟수이며 맨몸처럼 중량이 없으면 0입니다. */
export function setVolume(set) {
  const weight = Number(set?.weight), reps = Number(set?.reps);
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return 0;
  return weight * reps;
}

/**
 * 최근 7일(오늘 포함, 자정 기준) 완료 세트를 근육별로 집계합니다.
 * level은 이번 주 가장 많이 쓴 근육을 1로 둔 상대 강도라 히트맵 색 농도에 그대로 씁니다.
 */
export function weeklyMuscleLoad(history, now = new Date()) {
  const end = new Date(now);
  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (DAYS - 1));
  const endMs = +end, startMs = +start;
  const sessions = (history ?? []).filter(session => {
    const started = Date.parse(session?.startedAt);
    return Number.isFinite(started) && started >= startMs && started <= endMs;
  });
  const rows = new Map(muscles.map(muscle => [muscle.id, {
    id: muscle.id, name: muscle.name, latin: muscle.latin, region: muscle.region,
    sets: 0, volume: 0, primarySets: 0, secondarySets: 0,
  }]));
  for (const session of sessions) {
    for (const {exercise, set} of completedSets(session)) {
      for (const {id, weight} of exerciseMuscleWeights(exercise)) {
        const row = rows.get(id);
        if (!row) continue;
        row.sets += weight;
        row.volume += weight * setVolume(set);
        if (weight === ROLE_WEIGHT.primary) row.primarySets += 1;
        else row.secondarySets += 1;
      }
    }
  }
  const list = [...rows.values()].map(row => ({...row, sets: round1(row.sets), volume: Math.round(row.volume)}));
  const totalSets = round1(list.reduce((sum, row) => sum + row.sets, 0));
  const maxSets = Math.max(0, ...list.map(row => row.sets));
  const musclesWithShare = list.map(row => ({
    ...row,
    share: totalSets ? row.sets / totalSets : 0,
    level: maxSets ? row.sets / maxSets : 0,
  }));
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    days: DAYS,
    sessions: sessions.length,
    totalSets,
    totalVolume: Math.round(list.reduce((sum, row) => sum + row.volume, 0)),
    maxSets,
    muscles: musclesWithShare,
    top: [...musclesWithShare].filter(row => row.sets > 0)
      .sort((a, b) => b.sets - a.sets).slice(0, 3).map(row => row.id),
    untrained: musclesWithShare.filter(row => row.sets === 0).map(row => row.id),
    hasData: totalSets > 0,
  };
}

/** 히트맵 색 단계. 0은 회색, 4는 가장 진한 강조색입니다. */
export function heatLevel(level) {
  if (!Number.isFinite(level) || level <= 0) return 0;
  if (level < .2) return 1;
  if (level < .45) return 2;
  if (level < .75) return 3;
  return 4;
}

/** 단계별 근육 불투명도. 0단계는 몸 실루엣과 같은 색으로 남깁니다. */
export const HEAT_ALPHA = [0, .28, .45, .66, .9];
