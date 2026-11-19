import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {declaredEvents, exportedMethods, methodParity, missingTokens} from '../scripts/ios-parity.mjs';

const read = file => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const ios = read('modules/form-device/ios/FormDeviceModule.swift');
const android = read('modules/form-device/android/src/main/java/com/mori/form/device/FormDeviceModule.kt');

test('native method names are read from AsyncFunction declarations only', () => {
    const source = 'AsyncFunction("alpha") { }\nAsyncFunction( "beta") { }\n// AsyncFunction("gamma")\nEvents("delta")';
    assert.deepEqual(exportedMethods(source), ['alpha', 'beta']);
    assert.deepEqual(declaredEvents(source), ['delta']);
});

test('a method that exists only on Android is reported as missing on iOS', () => {
    const parity = methodParity('AsyncFunction("keep") {}\nAsyncFunction("loss") {}', 'AsyncFunction("keep") {}');
    assert.deepEqual(parity.missingOnIos, ['loss']);
    assert.deepEqual(parity.missingOnAndroid, []);
    assert.deepEqual(parity.android, ['keep', 'loss']);
});

test('a method that exists only on iOS is reported as missing on Android', () => {
    const parity = methodParity('AsyncFunction("keep") {}', 'AsyncFunction("extra") {}');
    assert.deepEqual(parity.missingOnAndroid, ['extra']);
});

test('missingTokens lists every absent capability without false positives', () => {
    assert.deepEqual(missingTokens('next["type"] and next["seconds"]', ['next["type"]', 'restEndsAt']), ['restEndsAt']);
});

test('the shipped phone bridge exposes the same methods on both platforms', () => {
    const parity = methodParity(android, ios);
    assert.deepEqual(parity.missingOnIos, []);
    assert.deepEqual(parity.missingOnAndroid, []);
    assert.deepEqual(declaredEvents(ios), declaredEvents(android));
});

test('both phone bridges read the same health record families', () => {
    for (const [kotlin, swift] of [['StepsRecord', 'stepCount'], ['HeartRateRecord', 'heartRate'], ['WeightRecord', 'bodyMass'], ['BodyFatRecord', 'bodyFatPercentage'], ['ExerciseSessionRecord', 'workoutType']]) {
        assert.ok(android.includes(kotlin), 'Android missing ' + kotlin);
        assert.ok(ios.includes(swift), 'iOS missing ' + swift);
    }
});

test('both watch apps handle set completion and finished workouts', () => {
    const watch = read('watchos/Sources/FORMWatchApp.swift');
    const wear = read('wearos/app/src/main/java/com/mori/form/wear/MainActivity.kt')
        + read('wearos/app/src/main/java/com/mori/form/wear/WorkoutService.kt');
    for (const action of ['completeSet', 'workoutFinished']) {
        assert.ok(watch.includes('"' + action + '"'), 'watchOS missing ' + action);
        assert.ok(wear.includes('"' + action + '"'), 'Wear OS missing ' + action);
    }
});
