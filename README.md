# FORM — Native Fitness App
iOS · Android · Apple Watch · Wear OS 운동 기록 앱 개발 프로젝트.

## 현재 저장소 상태 (2026-11-17)
이전 세션에서 로컬에 작성했던 전체 앱 소스는 원격 업로드가 완료되지 않았습니다. 현재 원격 저장소에는 이번에 직접 커밋한 **Planfit 벤치마크 문서와 UI v2 컴포넌트**만 있습니다. 이 저장소만으로 전체 앱을 빌드할 수 있다고 주장하지 않습니다.

로컬 소스 회수 대상: src/App.tsx, 암호화 DB, 63종 운동 데이터, HealthKit/Health Connect 모듈, watchOS/Wear OS 프로젝트, 기존 테스트, 빌드 구성. 이 파일들은 기존 대화 작업 환경의 form-native 폴더에서 확인한 뒤 충돌을 비교하여 추가해야 합니다. 최신 원격 UI를 오래된 로컬 파일로 덮어쓰지 마세요.

## 최신 요구사항
- Planfit UI와 운동 사용 흐름을 주 벤치마크로 삼음.
- 미니멀·무채색, 라이트/다크/시스템 모드.
- Liquid Glass ON/OFF. Apple 재질은 조작/탐색층에 적용.
- 인바디 수동 기록/사진, 건강 플랫폼 연결, 두 워치 지원.
- 중간 디자인 승인, 설명 주석, 실제 검증과 계획을 구분한 README.

## 이번 커밋
- [Planfit 화면·기능 대응표](docs/PLANFIT-BENCHMARK.md)
- [디자인 출처와 적용 이유](docs/DESIGN-SOURCES.md)
- [UI v2 통합 안내](src/ui-v2/README.md)
- [집중 운동 화면](src/ui-v2/FocusedWorkout.tsx)
- [색상·폰트 토큰](src/ui-v2/tokens.ts)
- [테마 및 재질](src/ui-v2/Primitives.tsx)

## 완료 기준
화면/기능 99% 동일을 검증한 상태가 아닙니다. 공개 자료에서 확인한 범위, 추론한 설계, 미확인 기능을 구분합니다. 경쟁사의 로고·영상·운동 이미지는 포함하지 않습니다. 건강 연동·워치·네이티브 빌드와 스토어 배포는 아직 검증 완료가 아닙니다.
