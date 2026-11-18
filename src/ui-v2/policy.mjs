/**
 * 렌더러와 분리한 테마 정책. 내용 영역은 언제나 opaque여야 한다.
 * Android의 blur fallback은 Apple의 광학적 Liquid Glass와 동등하지 않다.
 */
export function resolveMode(preference, systemMode) {
  return preference === 'dark' || (preference === 'system' && systemMode === 'dark') ? 'dark' : 'light';
}
export function resolveMaterial({enabled, reduceTransparency, role, platform, nativeAvailable}) {
  if (!enabled || reduceTransparency || role === 'content') return 'opaque';
  return platform === 'ios' && nativeAvailable ? 'native-glass' : 'frosted';
}
export function remainingSeconds(deadline, now) {
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}
export function parseSetInput(weight, reps) {
  const w = String(weight).trim().replace(',', '.');
  const r = String(reps).trim();
  if (!/^\d+(?:\.\d+)?$/.test(w) || !/^\d+$/.test(r)) throw Error('중량과 횟수를 숫자로 입력하세요.');
  const weightValue = Number(w), repsValue = Number(r);
  if (weightValue < 0 || weightValue > 1000 || repsValue < 1 || repsValue > 1000) throw Error('중량은 0~1000, 횟수는 1~1000 범위여야 합니다.');
  return {weight: weightValue, reps: repsValue};
}


/** All persisted weights stay in kg; display units never change the stored quantity.
 * @param {number} kg
 * @param {'kg' | 'lb'} unit
 */
export function displayMass(kg, unit) {
  return Math.round(kg * (unit === 'lb' ? 2.2046226218 : 1) * 100) / 100;
}
/** @param {string | number} input @param {'kg' | 'lb'} unit */
export function parseMass(input, unit) {
  const value = Number(String(input).trim().replace(',', '.'));
  const kg = value / (unit === 'lb' ? 2.2046226218 : 1);
  if (!String(input).trim() || !Number.isFinite(kg) || kg < 0 || kg > 1000) throw Error('중량 범위를 확인하세요.');
  return kg;
}
