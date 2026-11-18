/** SQLCipher로 상태를 암호화하고, 쓰기를 직렬화하여 오래된 상태가 덮어쓰지 않게 합니다. */
import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import type { State } from './types';
import data from './exercises.json';
let db: SQLite.SQLiteDatabase;
let writes = Promise.resolve();
export const freshState = (): State => ({ schema: 1, customExercises: [], history: [], body: [], routines: data.routines, active: null, seen: [], settings: { goal: 3, rest: 90, health: false, contrast: false, units: 'kg', theme: 'system', glass: false } });
export async function loadState(): Promise<State> {
    let key = await SecureStore.getItemAsync('form.database.key');
    if (!key) {
        key = (await Crypto.getRandomBytesAsync(32)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
        await SecureStore.setItemAsync('form.database.key', key, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
    if (!/^[a-f0-9]{64}$/.test(key))
        throw Error('데이터 암호화 키를 읽을 수 없습니다.');
    db = await SQLite.openDatabaseAsync('form.db');
    await db.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL);`);
    const row = await db.getFirstAsync<{
        payload: string;
    }>('SELECT payload FROM state WHERE id=1');
    if (!row)
        return freshState();
    const saved = JSON.parse(row.payload);
    if (saved.schema !== 1)
        throw Error('앱 업데이트가 필요한 데이터 형식입니다.');
    return { ...freshState(), ...saved, settings: { ...freshState().settings, ...saved.settings } };
}
/** 상태 반영과 워치 ACK 전에 이 Promise가 성공해야 합니다. */
export function persist(state: State): Promise<void> { const payload = JSON.stringify(state); const next = writes.catch(() => { }).then(async () => { await db.runAsync('INSERT INTO state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload', payload); }); writes = next; return next; }
