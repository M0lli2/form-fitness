# UI v2 — integration contract
이 폴더는 Planfit 벤치마크 기반의 승인 전 네이티브 컴포넌트입니다. 완성 앱이나 독립 실행 프로젝트가 아닙니다.

## 필요한 의존성
react, react-native, expo-glass-effect, expo-blur. 기존 Expo SDK와 호환되는 버전을 expo install로 설치하세요. 이 원격 작업에서는 설치/네이티브 컴파일을 실행하지 못했습니다.

## 통합
1. 앱의 저장된 설정을 FormTheme의 preferences에 전달합니다. mode와 glass는 독립 설정입니다.
2. content 패널은 Surface 기본값, 조작 바는 role="control", 탐색 바는 role="navigation"을 사용합니다.
3. FocusedWorkout에 현재 운동과 세트 배열을 전달합니다.
4. onComplete는 DB 저장과 휴식 시각 변경이 성공한 뒤 resolve해야 합니다.
5. 저장 오류는 reject하면 화면이 오류를 표시하고 입력값을 유지합니다.
6. 상위 화면에서 safe area 및 keyboard avoiding을 적용합니다. OS별 실제 키보드 테스트 필요.
7. 기존 세션 입력 단위가 lb이면 경계에서 kg로 변환하거나 컴포넌트에 단위 파라미터를 추가합니다. 현재 컴포넌트는 kg만 표시합니다.
8. 현재 strength 기록용입니다. 유산소·시간 기반 종목은 별도 입력 컴포넌트가 필요합니다.

## 검증 구분
policy.mjs의 순수 함수만 호스팅 JS 환경에서 검증했습니다. React Native 렌더링·TypeScript 전체 타입 검사·접근성 실기기 검증은 미실행입니다.

