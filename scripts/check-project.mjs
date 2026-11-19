/** 의존성 없이 실행하는 정적 자산 및 네이티브 계약 검사입니다. 빌드 검증을 대체하지 않습니다. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {declaredEvents, methodParity, missingTokens} from './ios-parity.mjs';
const root = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

for (const file of ['package.json', 'app.json', 'tsconfig.json', 'eas.json', 'src/exercises.json', 'modules/form-device/expo-module.config.json'])
    JSON.parse(read(file));

// 1. 휴대폰 브리지: 두 플랫폼이 같은 메서드·이벤트를 내보내야 합니다.
const iosPath = 'modules/form-device/ios/FormDeviceModule.swift';
const androidPath = 'modules/form-device/android/src/main/java/com/mori/form/device/FormDeviceModule.kt';
const ios = read(iosPath), android = read(androidPath);
// 계약 목록을 함께 고정해 두 플랫폼에서 동시에 사라지는 회귀도 잡습니다.
const contract = ['ackWatch', 'authorize', 'drainWatch', 'healthAvailable', 'readHealth', 'saveBody', 'saveWorkout', 'sendWatch', 'watchStatus'];
const methods = methodParity(android, ios);
assert.deepEqual(methods.missingOnIos, [], 'iOS missing ' + methods.missingOnIos.join(', '));
assert.deepEqual(methods.missingOnAndroid, [], 'Android missing ' + methods.missingOnAndroid.join(', '));
assert.deepEqual(methods.android, contract, 'Android bridge contract changed');
assert.deepEqual(methods.ios, contract, 'iOS bridge contract changed');
assert.deepEqual(declaredEvents(ios), declaredEvents(android), 'native event contract differs');
assert.ok(ios.includes('Name("FormDevice")') && android.includes('Name("FormDevice")'), 'module name differs');

// 2. 건강 레코드 대응: 같은 종류를 읽고 써야 합니다.
const healthPairs = [
    ['StepsRecord', 'stepCount'],
    ['HeartRateRecord', 'heartRate'],
    ['WeightRecord', 'bodyMass'],
    ['BodyFatRecord', 'bodyFatPercentage'],
    ['ExerciseSessionRecord', 'workoutType'],
];
for (const [kotlin, swift] of healthPairs) {
    assert.ok(android.includes(kotlin), `Android missing ${kotlin}`);
    assert.ok(ios.includes(swift), `iOS missing ${swift}`);
}
// 심박은 Android와 같은 최근 30일 범위에서만 읽습니다(오래된 값을 '최근 심박'으로 쓰지 않음).
assert.ok(/latest\(\.heartRate[^\n]*since:/.test(ios), 'iOS heart rate must be bounded to a recent window');

// 3. 워치 앱: 두 플랫폼이 같은 명령을 주고받고 같은 정보를 표시해야 합니다.
const watch = read('watchos/Sources/FORMWatchApp.swift');
const wear = read('wearos/app/src/main/java/com/mori/form/wear/MainActivity.kt')
    + '\n' + read('wearos/app/src/main/java/com/mori/form/wear/WorkoutService.kt');
for (const action of ['completeSet', 'workoutFinished']) {
    assert.ok(watch.includes(`"${action}"`), `watchOS missing ${action}`);
    assert.ok(wear.includes(`"${action}"`), `Wear OS missing ${action}`);
}
assert.deepEqual(missingTokens(watch, ['sessionId', 'exerciseId', 'setId', 'restEndsAt', 'healthSaved']), [], 'watchOS state fields incomplete');
assert.deepEqual(missingTokens(wear, ['sessionId', 'exerciseId', 'setId', 'healthSaved']), [], 'Wear OS state fields incomplete');
// 근력 외 세트는 시간으로 표시하고, 심박이 없을 때 0 bpm을 보여주지 않습니다.
assert.ok(watch.includes('next["type"]'), 'watchOS must branch on set type');
assert.ok(wear.includes('optString("type")'), 'Wear OS must branch on set type');
assert.ok(watch.includes('next["seconds"]'), 'watchOS must show seconds for timed sets');
assert.ok(watch.includes('심박 측정 대기'), 'watchOS must not report 0 bpm before the first sample');

// 4. 설정·권한: iOS 사용 설명과 엔타이틀먼트, Android 권한이 같은 건강 범위를 덮어야 합니다.
const app = JSON.parse(read('app.json')).expo;
for (const key of ['NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription', 'NSPhotoLibraryUsageDescription'])
    assert.ok(app.ios.infoPlist?.[key], `app.json iOS infoPlist missing ${key}`);
assert.equal(app.ios.entitlements?.['com.apple.developer.healthkit'], true, 'app.json iOS HealthKit entitlement missing');
assert.deepEqual(missingTokens(read('watchos/FORMWatch.entitlements'), ['com.apple.developer.healthkit']), [], 'watchOS HealthKit entitlement missing');
for (const file of ['watchos/project.yml', 'scripts/embed-watch.rb'])
    assert.deepEqual(missingTokens(read(file), ['NSHealthShareUsageDescription', 'NSHealthUpdateUsageDescription', 'WKCompanionAppBundleIdentifier']), [], `${file} watch metadata incomplete`);
const permissions = app.android.permissions ?? [];
for (const permission of ['READ_STEPS', 'READ_HEART_RATE', 'READ_WEIGHT', 'READ_BODY_FAT', 'READ_EXERCISE', 'WRITE_WEIGHT', 'WRITE_BODY_FAT', 'WRITE_EXERCISE', 'POST_NOTIFICATIONS'])
    assert.ok(permissions.some(name => name.endsWith(permission)), `app.json Android permission missing ${permission}`);
// 네이티브 모듈은 두 플랫폼에 모두 autolink되어야 합니다.
assert.deepEqual(JSON.parse(read('modules/form-device/expo-module.config.json')).platforms, ['apple', 'android']);
const plugins = (app.plugins ?? []).map(plugin => Array.isArray(plugin) ? plugin[0] : plugin);
assert.ok(plugins.includes('./plugins/withFormNative.cjs'), 'withFormNative plugin missing');

// 5. 동반 앱 식별자.
assert.equal(app.android.package, 'com.mori.form');
assert.ok(read('wearos/app/build.gradle.kts').includes('applicationId = "com.mori.form"'));
assert.ok(read('watchos/project.yml').includes('WKCompanionAppBundleIdentifier: com.mori.form'));
console.log('JSON, iOS/Android bridge, health types, watch actions, entitlements and companion identifiers: OK');
