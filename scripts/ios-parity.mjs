/**
 * iOS/Android 네이티브 계약을 소스에서 직접 읽어 비교하는 순수 함수 모음입니다.
 * 빌드나 실행 없이 계약 표면(메서드·이벤트·건강 레코드·워치 화면)의 누락만 잡습니다.
 * 네이티브 컴파일 성공을 대신하지 않습니다.
 */

/** 주석에 적힌 선언을 계약으로 세지 않도록 줄 주석을 먼저 지웁니다. */
function withoutComments(source) {
  return String(source).replace(/(^|\s)\/\/.*$/gm, '$1');
}

/** `AsyncFunction("name")` 선언 이름을 중복 없이 정렬해 돌려줍니다. */
export function exportedMethods(source) {
  const names = [...withoutComments(source).matchAll(/AsyncFunction\(\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(match => match[1]);
  return [...new Set(names)].sort();
}

/** `Events("name")` 선언 이름입니다. 두 플랫폼 모두 비어 있어야 계약이 같습니다. */
export function declaredEvents(source) {
  const names = [...withoutComments(source).matchAll(/Events\(\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(match => match[1]);
  return [...new Set(names)].sort();
}

/** Android 기준으로 iOS에서 빠진 메서드와 그 반대를 함께 돌려줍니다. */
export function methodParity(android, ios) {
  const a = exportedMethods(android);
  const i = exportedMethods(ios);
  return {
    android: a,
    ios: i,
    missingOnIos: a.filter(name => !i.includes(name)),
    missingOnAndroid: i.filter(name => !a.includes(name)),
  };
}

/** 소스 문자열에 전부 들어 있는지 확인하고 빠진 항목만 돌려줍니다. */
export function missingTokens(source, tokens) {
  return tokens.filter(token => !String(source).includes(token));
}
