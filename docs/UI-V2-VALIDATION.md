# UI v2 검증

2026-11-17: policy.mjs의 실제 소스에서 export 선언만 제거하여 호스팅 JavaScript 환경에서 실행했습니다.

- PASS: system dark
- PASS: explicit light
- PASS: content opaque
- PASS: toggle off
- PASS: accessibility overrides
- PASS: native iOS
- PASS: android fallback
- PASS: deadline clamp
- PASS: deadline ceil
- PASS: decimal comma
- PASS: reject ["","10"]
- PASS: reject ["NaN","10"]
- PASS: reject ["20","1.5"]
- PASS: reject ["20","0"]
- PASS: reject ["-1","10"]

15개 정책/입력 검사 통과. React Native 렌더링, 네이티브 SDK, 타입 검사는 실행하지 못했습니다. 이전 로컬 테스트 11개와 별개이며 전체 앱 검증을 의미하지 않습니다.

