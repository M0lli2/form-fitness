// Test local calendar editing in both positive and negative UTC offsets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localDateInput } from '../src/core.mjs';

test('measurement input rejects invalid dates', () => {
    assert.throws(() => localDateInput('invalid'));
});

for (const zone of ['Asia/Seoul', 'America/Los_Angeles', 'UTC']) {
    test('measurement edit preserves local date in ' + zone, () => {
        const source = `
            import assert from 'node:assert/strict';
            import { measurementDate, localDateInput } from './src/core.mjs';
            for (const day of ['2026-01-01', '2026-03-08', '2026-11-01', '2024-02-29']) {
                assert.equal(localDateInput(measurementDate(day)), day);
            }
            assert.equal(localDateInput(new Date(2026, 0, 1, 0, 1)), '2026-01-01');
            assert.throws(() => measurementDate('2026-02-29'));
            assert.throws(() => measurementDate('2026-02-30'));
        `;
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
            cwd: new URL('..', import.meta.url),
            env: { ...process.env, TZ: zone }, encoding: 'utf8'
        });
        assert.equal(result.status, 0, result.stderr);
    });
}
