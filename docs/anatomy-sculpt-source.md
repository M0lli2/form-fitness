# Form 운동 근육 모델 출처

[Male Full Body Ecorche](https://sketchfab.com/3d-models/male-full-body-ecorche-ab11ebff89224f03bd75efede1164cf6), Diego Luján García (diegoluga), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 원본 아카이브 SHA-256은 `4809f332eddccfcd57e042a16a89b1b30cb61262d6a8f151f88b05342b009864`입니다.

Form은 원본의 16개 표면을 유지하면서 삼각형 수를 640,470개에서 10,020개로 줄였습니다. 위치, 정점 법선, 면 인덱스를 압축하고 기존 운동의 관절 좌표에 맞춰 변형합니다. 운동별 보라색 강조를 렌더링 시점에 적용합니다.

`scripts/recolor-anatomy-sculpt.mjs`로 검토 GLB를 만든 뒤 다음 명령으로 앱의 데이터를 생성합니다. 단순화 도구는 [meshoptimizer 0.25](https://github.com/zeux/meshoptimizer/tree/v0.25/js)의 `meshopt_simplifier.js`이며 Node CJS 모듈로 저장합니다. 빌드된 앱에는 정리된 데이터와 Form의 모델 코드가 포함됩니다.

```sh
node scripts/prepare-anatomy-model.mjs Form-Anatomy-Color-Review.glb src/anatomy-sculpt-data.mjs meshopt_simplifier.cjs
```
