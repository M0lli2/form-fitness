/** 의존성 없이 실행하는 정적 자산 및 네이티브 계약 검사입니다. 빌드 검증을 대체하지 않습니다. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
for (const file of ['package.json', 'app.json', 'tsconfig.json', 'eas.json', 'src/exercises.json', 'modules/form-device/expo-module.config.json'])
    JSON.parse(read(file));
const ios = read('modules/form-device/ios/FormDeviceModule.swift'), android = read('modules/form-device/android/src/main/java/com/mori/form/device/FormDeviceModule.kt');
for (const name of ['healthAvailable', 'authorize', 'readHealth', 'saveBody', 'saveWorkout', 'watchStatus', 'sendWatch', 'drainWatch', 'ackWatch']) {
    assert.ok(ios.includes(`"${name}"`), `iOS missing ${name}`);
    assert.ok(android.includes(`"${name}"`), `Android missing ${name}`);
}
assert.equal(JSON.parse(read('app.json')).expo.android.package, 'com.mori.form');
assert.ok(read('wearos/app/build.gradle.kts').includes('applicationId = "com.mori.form"'));
assert.ok(read('watchos/project.yml').includes('WKCompanionAppBundleIdentifier: com.mori.form'));
console.log('JSON, bridge methods, companion identifiers: OK');
