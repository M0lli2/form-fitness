# 아키텍처

## 저장과 화면

React Native 네이티브 UI → 직렬화된 변경 큐 → SQLCipher DB commit → 화면 상태 갱신.
DB 쓰기 실패 시 저장 성공으로 표시하지 않습니다. 진행 중 세션도 같은 상태에 저장하므로 정상적인 앱 재시작 시 복원합니다. 저장된 상태 버전은 1이며 향후 스키마 변경은 명시적 migration으로 구현해야 합니다.

## 워치 통신

휴대폰 → 워치: 현재 세션 ID, 다음 운동/세트 ID, 중량·횟수·시간, 휴식 종료 시각.
워치 → 휴대폰: 고유 이벤트 ID를 가진 completeSet 또는 workoutFinished.

Apple은 WatchConnectivity application context와 transferUserInfo를 사용합니다. Wear는 DataClient의 영속 data item을 사용합니다. 수신 큐를 휴대폰에 저장한 뒤, 앱 도메인 DB에 이벤트를 반영하고 ACK합니다. 이미 본 이벤트 ID 또는 다른 세션의 명령은 무시합니다. 추가 작업: 큐 크기 상한·보관 기간·암호화 및 앱 간 버전 협상.

## 건강 연결

Swift/Kotlin 브리지는 권한, 읽기, 쓰기만 수행합니다. JS 화면은 사용자 동작에 따라 요청합니다. 데이터 없음과 권한 부족을 가능한 범위에서 안내합니다. 건강 데이터를 자동으로 원격 전송하지 않습니다.

HealthKit SyncIdentifier / Health Connect clientRecordId는 중복 방지 키입니다. 앱 내부 체성분 변경은 건강 앱에 자동 반영되지 않습니다. 버전 증가·삭제 정책을 확정하기 전에는 자동 양방향 동기화를 활성화하지 않습니다.

## 선택 이유

- 공유 UI와 도메인은 TypeScript로 유지해 두 휴대폰 플랫폼의 입력·검증 차이를 줄입니다.
- 건강·워치 접근은 플랫폼 SDK를 직접 사용하는 작은 네이티브 모듈로 분리합니다.
- 워치 UI는 작은 화면과 OS 운동 생명주기에 맞춰 SwiftUI/Compose로 구현합니다.
- 클라우드 계정은 현재 포함하지 않습니다. 추가 시 사용자별 접근제어·암호화·삭제·충돌 해결을 먼저 설계합니다.
