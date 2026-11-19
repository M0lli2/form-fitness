// 근육 타깃 필터와 검색. 세부 근육 16종과 큰 부위 그룹을 모두 받아 운동도감을 걸러 냅니다.
// 운동도감 부위명만 있는 운동은 부위명으로 근육을 추정해 큰 부위 필터와 검색에 함께 걸리게 합니다.
import {catalogPartMuscles, muscleGroups, muscleRoles, muscles} from './muscle-map.mjs';

/** 운동도감에서 근육과 무관하게 쓰는 부위 이름입니다. */
export const bodyParts = ['전신', '유산소', '스트레칭'];
const groupById = new Map(muscleGroups.map(group => [group.id, group]));

/**
 * @typedef {Object} TargetFilter
 * @property {string} [query] 검색어
 * @property {string[]} [muscles] 고른 세부 근육 id
 * @property {string[]} [groups] 고른 큰 부위 그룹 id
 * @property {string[]} [parts] 고른 운동도감 부위명
 * @property {boolean} [includeSecondary] 보조근까지 타깃으로 볼지
 */
const normalize = value => String(value ?? '').toLocaleLowerCase().replace(/\s+/g, '');

/**
 * 운동 하나의 타깃 근육. 3D 매핑이 있으면 주동근·보조근을 그대로 쓰고, 없으면 부위명으로 추정합니다.
 * @param {{id?:string, muscle?:string} | null} exercise
 * @returns {{primary:string[], secondary:string[], muscles:string[], parts:string[]}}
 */
export function exerciseTargets(exercise) {
  const roles = muscleRoles[exercise?.id];
  const primary = roles ? [...roles.primary] : [...(catalogPartMuscles[exercise?.muscle] ?? [])];
  const secondary = roles ? [...roles.secondary] : [];
  return {
    primary,
    secondary,
    muscles: [...new Set([...primary, ...secondary])],
    parts: exercise?.muscle ? [exercise.muscle] : [],
  };
}

/** 근육 목록이 속한 큰 부위 그룹. 승모근처럼 두 그룹에 속한 근육은 둘 다 돌려줍니다. */
/** @param {string[]} ids @returns {string[]} */
export function groupsForMuscles(ids) {
  const set = new Set(ids ?? []);
  return muscleGroups.filter(group => group.muscles.some(id => set.has(id))).map(group => group.id);
}

/** 그룹 하나에 속한 세부 근육 id. */
/** @param {string} groupId @returns {string[]} */
export function musclesOfGroup(groupId) {
  return groupById.get(groupId)?.muscles ?? [];
}

/**
 * 검색어 한 조각이 가리키는 근육·그룹·부위명. '어깨'는 그룹, '삼각근'은 세부 근육 3종,
 * '대둔근'은 근육 하나, '종아리'는 종아리 근육만 가리킵니다. 두 글자 이상이면 이름 일부로도 찾습니다.
 */
/** @param {string} term @returns {{muscles:string[], groups:string[], parts:string[], labels:string[]} | null} */
export function resolveMuscleTerm(term) {
  const q = normalize(term);
  if (!q) return null;
  const foundMuscles = new Set(), foundGroups = new Set(), foundParts = new Set(), labels = new Set();
  const matches = name => name === q || (q.length >= 2 && name.includes(q));
  for (const muscle of muscles) {
    if ([normalize(muscle.name), normalize(muscle.latin), normalize(muscle.region)].some(matches)) {
      foundMuscles.add(muscle.id);
      labels.add(muscle.name);
    }
  }
  for (const group of muscleGroups) {
    if ([normalize(group.name), ...(group.aliases ?? []).map(normalize)].some(matches)) {
      foundGroups.add(group.id);
      group.muscles.forEach(id => foundMuscles.add(id));
      labels.add(group.name);
    }
  }
  for (const part of [...Object.keys(catalogPartMuscles), ...bodyParts]) {
    if (matches(normalize(part))) { foundParts.add(part); labels.add(part); }
  }
  if (!foundMuscles.size && !foundGroups.size && !foundParts.size) return null;
  return {muscles: [...foundMuscles], groups: [...foundGroups], parts: [...foundParts], labels: [...labels]};
}

/**
 * 운동 하나가 검색어와 맞는지 봅니다. 근육·그룹·부위 이름은 타깃 근육으로, 나머지 말은
 * 운동명·부위·장비 글자로 비교합니다. 여러 단어를 넣으면 모두 만족해야 합니다.
 */
/**
 * @param {{id?:string, name?:string, muscle?:string, equipment?:string} | null} exercise
 * @param {string} query
 * @param {{includeSecondary?:boolean}} [options]
 * @returns {boolean}
 */
export function searchExercise(exercise, query, {includeSecondary = true} = {}) {
  const terms = String(query ?? '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const targets = exerciseTargets(exercise);
  const pool = new Set(includeSecondary ? targets.muscles : targets.primary);
  const haystack = `${exercise?.name ?? ''} ${exercise?.muscle ?? ''} ${exercise?.equipment ?? ''}`.toLocaleLowerCase();
  return terms.every(term => {
    const hit = resolveMuscleTerm(term);
    if (!hit) return haystack.includes(term);
    if (hit.muscles.some(id => pool.has(id))) return true;
    if (hit.parts.some(part => targets.parts.includes(part))) return true;
    return hit.labels.some(label => haystack.includes(normalize(label)));
  });
}

/** 고른 근육·그룹·부위 중 하나라도 운동의 타깃과 겹치면 통과시킵니다. 아무것도 고르지 않으면 모두 통과합니다. */
/**
 * @param {{id?:string, name?:string, muscle?:string, equipment?:string} | null} exercise
 * @param {TargetFilter} [options]
 * @returns {boolean}
 */
export function matchesMuscleSelection(exercise, {muscles: picked = [], groups = [], parts = [], includeSecondary = true} = {}) {
  if (!picked.length && !groups.length && !parts.length) return true;
  const targets = exerciseTargets(exercise);
  const pool = includeSecondary ? targets.muscles : targets.primary;
  if (picked.some(id => pool.includes(id))) return true;
  if (groups.length) {
    const owned = groupsForMuscles(pool);
    if (groups.some(id => owned.includes(id))) return true;
  }
  if (parts.some(part => targets.parts.includes(part))) return true;
  return false;
}

/** 운동도감 목록에 근육 타깃 필터와 검색어를 함께 적용합니다. */
/**
 * @template T
 * @param {T[]} exercises
 * @param {TargetFilter} [options]
 * @returns {T[]}
 */
export function filterExercises(exercises, {query = '', muscles: picked = [], groups = [], parts = [], includeSecondary = true} = {}) {
  return (exercises ?? []).filter(exercise =>
    matchesMuscleSelection(exercise, {muscles: picked, groups, parts, includeSecondary})
    && searchExercise(exercise, query, {includeSecondary}));
}

/** 화면에 그릴 세부 근육 칩. 부위 순서대로 16종을 돌려줍니다. */
/** @returns {{id:string, name:string, region:string}[]} */
export function muscleChips() {
  return muscles.map(muscle => ({id: muscle.id, name: muscle.name, region: muscle.region}));
}

/** 화면에 그릴 큰 부위 칩. */
/** @returns {{id:string, name:string}[]} */
export function groupChips() {
  return muscleGroups.map(group => ({id: group.id, name: group.name}));
}
