# 디자인 출처와 적용 기록
검토일: 2026-11-17. 현재 주 벤치마크는 Planfit. 타 앱은 보조 참고다.

| 출처 | 관찰/가이드 | FORM 적용 |
|---|---|---|
| [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | 유리는 내용 위 조작/탐색층, 과도한 중첩 회피 | 카드 전체 유리화 철회, 바/주 조작에만 적용 |
| [Meet Liquid Glass, WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/) | 굴절·하이라이트·환경 적응을 포함하는 동적 재질 | iOS native regular 사용. CSS blur를 같은 효과라고 부르지 않음 |
| [New design system, WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/) | 명료한 계층, 둥근 형태와 글자 체계 | 큰 제목과 조작층의 일관된 곡률 |
| [Apple Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 시스템 글꼴, Dynamic Type, 레이아웃 적응 | 시스템 글꼴, 글자 확대 허용, 작은 설명 최소화 |
| [Material 3 typography](https://m3.material.io/styles/typography/applying-type) | 역할 기반 타입 스케일 | title/body/label/metric 토큰 분리 |
| [Hevy 공식 기록 흐름](https://www.hevyapp.com/features/track-workouts/) | 이전 기록 참고, 세트 완료와 휴식 연결 | 이전 기록 열과 완료 행동의 일관성 |
| [Strong timer](https://help.strongapp.io/article/231-rest-timer) | 세트 완료 후 휴식 시작, 변경/건너뛰기 | 현재 휴식·스킵·남은 시간 명확히 표시 |
| [Fitbod exercise details](https://help.fitbod.me/hc/en-us/articles/30721437384215-How-to-Navigate-the-Exercise-Details-Screen) | 상세 운동과 운동 강도 기록 | 보조 정보는 상세로 분리, 핵심 기록 집중 |
| [Dropset](https://www.getdropset.app/) | 공개 다크 화면의 낮은 장식 밀도 | 다크의 순수 검정/차콜 단계 참고 |

## 글꼴
경쟁사 사용 폰트를 스크린샷으로 단정하지 않는다. iOS는 시스템 서체/언어 fallback, Android는 시스템 sans-serif/한국어 fallback을 사용한다. Apple 시스템 폰트를 Android에 복사하거나 앱에 재배포하지 않는다. 추후 Pretendard를 채택한다면 정식 배포본·라이선스를 함께 관리한다.

본문 17, 보조 13, 화면 제목 30, 핵심 수치 36pt를 출발점으로 한다. 숫자는 tabular-nums, 한글 본문에는 과한 음수 자간을 적용하지 않는다. 200% 글자 확대에서 고정 높이 행 대신 세로 배치를 허용한다.

## 표현 강도
Glass ON의 선명함은 native 재질·외곽 하이라이트·층 분리로 표현한다. 모든 배경 투명도를 낮춰 가독성을 희생하지 않는다. OFF 및 시스템 Reduce Transparency에서 단색으로 전환한다. Reduce Motion에서 장식 애니메이션을 제거한다. 큰 세트표/인바디 표는 두 모드 모두 단색이다.

