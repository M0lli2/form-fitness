/** 피클(Pickle) ↔ Form 연계의 순수 로직 (0.3.8).
 *
 *  두 방향을 한 파일에서 다룹니다.
 *  1) 피클 → Form: 피클이 만든 `form://` 링크(또는 같은 형식의 JSON)를 읽어
 *     완료된 운동 기록(session)이나 루틴(routine)으로 바꾸고, 기존 기록을 지우지 않고 병합합니다.
 *  2) Form → 피클: 끝낸 운동을 피클 채팅에 붙여넣을 한국어 브리핑과 JSON으로 만듭니다.
 *
 *  화면(React Native)과 저장소에서 분리해 `node --test`로 검증합니다.
 *  링크·JSON 형식은 docs/PROGRESS-2026-11-28-v038.md에 그대로 적혀 있습니다.
 */
import {bmi, calendarWeekVolume, localDateInput, measurementDate, nextBodyRevision, parseRpe, validateBody, validateSession, volume} from './core.mjs';
import {sessionSummary} from './workout-features.mjs';

/** 피클이 만들고 Form이 읽는 데이터 형식의 버전입니다. */
export const PICKLE_SCHEMA_VERSION = 1;

/** 앱이 실행될 때 읽는 피클 인박스 주소입니다. 설정에서 바꿀 수 있습니다.
 *  공개 저장소의 파일이라 이름·연락처 같은 개인 정보는 넣지 않습니다. */
export const PICKLE_INBOX_URL = 'https://raw.githubusercontent.com/M0lli2/form-fitness/main/sync/pickle-inbox.json';

/** 같은 파일을 캐시에서 읽지 않도록 시각을 붙입니다. */
export function inboxUrl(base = PICKLE_INBOX_URL, now = Date.now()) {
    const url = String(base ?? '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) return '';
    return `${url}${url.includes('?') ? '&' : '?'}t=${Math.round(now)}`;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** UTF-8 바이트. Hermes에는 TextEncoder가 없어 직접 계산합니다. */
function utf8Bytes(text) {
    const bytes = [];
    for (let index = 0; index < text.length; index++) {
        let code = text.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
            const next = text.charCodeAt(index + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
                index++;
            }
        }
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
    return bytes;
}

function utf8Text(bytes) {
    let text = '';
    for (let index = 0; index < bytes.length;) {
        const first = bytes[index++];
        let code;
        if (first < 0x80) code = first;
        else if (first >= 0xc0 && first < 0xe0) code = ((first & 31) << 6) | (bytes[index++] & 63);
        else if (first >= 0xe0 && first < 0xf0) code = ((first & 15) << 12) | ((bytes[index++] & 63) << 6) | (bytes[index++] & 63);
        else code = ((first & 7) << 18) | ((bytes[index++] & 63) << 12) | ((bytes[index++] & 63) << 6) | (bytes[index++] & 63);
        text += String.fromCodePoint(code);
    }
    return text;
}

/** base64url(패딩 없음)로 감쌉니다. 링크 안에서 `+`·`/`·`=` 없이 그대로 쓸 수 있습니다. */
export function base64urlEncode(text) {
    const bytes = utf8Bytes(String(text ?? ''));
    let out = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const a = bytes[index];
        const b = bytes[index + 1];
        const c = bytes[index + 2];
        const block = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
        out += ALPHABET[(block >> 18) & 63] + ALPHABET[(block >> 12) & 63];
        if (b !== undefined) out += ALPHABET[(block >> 6) & 63];
        if (c !== undefined) out += ALPHABET[block & 63];
    }
    return out;
}

/** base64url을 풀어 UTF-8 문자열로 돌려줍니다. 잘못된 글자는 형식 오류로 알립니다. */
export function base64urlDecode(text) {
    const clean = String(text ?? '').trim().replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (!clean || /[^A-Za-z0-9\-_]/.test(clean)) throw Error('링크에 담긴 데이터를 읽지 못했습니다. 링크 전체를 다시 복사해 주세요.');
    const bytes = [];
    let buffer = 0;
    let bits = 0;
    for (const char of clean) {
        const value = ALPHABET.indexOf(char);
        if (value < 0) throw Error('링크에 담긴 데이터를 읽지 못했습니다. 링크 전체를 다시 복사해 주세요.');
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes.push((buffer >> bits) & 255);
            buffer &= (1 << bits) - 1;
        }
    }
    return utf8Text(bytes);
}

/** 운동 이름 비교용 키: 띄어쓰기·괄호·가운뎃점·대소문자를 없앱니다. */
function nameKey(value) {
    return String(value ?? '').toLowerCase().replace(/[\s()·._\-\/]+/g, '');
}

/** 피클이 짧게 부르는 이름을 운동도감 이름으로 이어 줍니다. 확실한 것만 넣습니다. */
const ALIASES = {
    '벤치': '바벨 벤치 프레스',
    '벤치프레스': '바벨 벤치 프레스',
    '바벨벤치': '바벨 벤치 프레스',
    '덤벨벤치': '덤벨 벤치 프레스',
    '덤벨벤치프레스': '덤벨 벤치 프레스',
    '인클라인벤치': '인클라인 덤벨 프레스',
    '인클라인벤치프레스': '인클라인 덤벨 프레스',
    '스쿼트': '바벨 백 스쿼트',
    '백스쿼트': '바벨 백 스쿼트',
    '데드': '컨벤셔널 데드리프트',
    '데드리프트': '컨벤셔널 데드리프트',
    '오버헤드프레스': '바벨 오버헤드 프레스',
    'ohp': '바벨 오버헤드 프레스',
    '밀리터리프레스': '바벨 오버헤드 프레스',
    '숄더프레스': '덤벨 숄더 프레스',
    '랫풀다운': '랫 풀다운',
    '풀다운': '랫 풀다운',
    '레터럴레이즈': '사이드 레터럴 레이즈',
    '사이드레이즈': '사이드 레터럴 레이즈',
    '사이드레터럴': '사이드 레터럴 레이즈',
    '푸시다운': '트라이셉스 푸시다운',
    '바이셉컬': '덤벨 바이셉 컬',
    '트레드밀': '트레드밀',
    '러닝': '트레드밀',
    '자전거': '실내 자전거',
    '플랭크': '플랭크',
};

function cleanText(value, limit = 120) {
    return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function hashId(parts) {
    const text = parts.filter(part => part !== null && part !== undefined && part !== '').join('|');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(36).padStart(7, '0');
}

/** 이름 또는 ID로 운동도감 종목을 찾습니다. 못 찾거나 여럿이면 후보를 알려 줍니다. */
export function resolveExercise(entry, library) {
    const list = (Array.isArray(library) ? library : []).filter(item => item?.id && item?.name);
    const raw = typeof entry === 'string' ? entry : entry?.id ?? entry?.name ?? '';
    const key = nameKey(raw);
    if (!key) throw Error('운동 이름이 비어 있습니다.');
    const byId = list.find(item => item.id === String(raw) || nameKey(item.id) === key);
    if (byId) return byId;
    const exact = list.find(item => nameKey(item.name) === key);
    if (exact) return exact;
    const alias = ALIASES[key];
    if (alias) {
        const target = list.find(item => nameKey(item.name) === nameKey(alias));
        if (target) return target;
    }
    const partial = list.filter(item => {
        const name = nameKey(item.name);
        return name && (name.includes(key) || key.includes(name));
    });
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
        const names = partial.slice(0, 4).map(item => item.name);
        throw Error(`'${raw}' 운동이 여러 개입니다(${names.join(', ')}). 정확한 이름이나 ID로 다시 보내 주세요.`);
    }
    const sample = list.slice(0, 4).map(item => item.name);
    throw Error(`'${raw}' 운동을 운동도감에서 찾지 못했습니다. 예: ${sample.join(', ')}`);
}

/** JSON 하나가 운동 기록인지 루틴인지 정합니다. `type`이 있으면 그것을 먼저 믿습니다. */
export function payloadKind(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('데이터 형식을 확인해 주세요.');
    const declared = String(payload.type ?? payload.kind ?? '').toLowerCase();
    if (/inbody|composition|measurement|^body$|^bodyfat$/.test(declared)) return 'body';
    if (/session|workout|log|record|feedback/.test(declared)) return 'session';
    if (/routine|template|plan/.test(declared)) return 'routine';
    const exercises = Array.isArray(payload.exercises) ? payload.exercises : null;
    if (exercises?.length && exercises.every(item => item && typeof item === 'object' && Array.isArray(item.sets))) return 'session';
    if (exercises || Array.isArray(payload.ids)) return 'routine';
    if (Number(payload.weight) > 0 && (payload.date || payload.measuredAt || payload.at)) return 'body';
    throw Error('운동 기록(session)·루틴(routine)·체성분(body) 데이터가 아닙니다.');
}

function splitOnce(text, separator) {
    const at = text.indexOf(separator);
    return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + separator.length)];
}

function parseQuery(text) {
    const params = {};
    for (const pair of String(text ?? '').split('&')) {
        if (!pair) continue;
        const [rawKey, rawValue] = splitOnce(pair, '=');
        let value = rawValue;
        if (/%[0-9a-f]{2}/i.test(value)) {
            try {
                value = decodeURIComponent(value);
            }
            catch {
                /* 잘못된 인코딩은 원문 그대로 두고 아래에서 형식 오류로 알립니다. */
            }
        }
        params[rawKey] = value;
    }
    return params;
}

const LINK_PATHS = ['start', 'workout-start', 'prepare', 'import-session', 'session', 'record', 'import-routine', 'routine', 'import-body', 'body', 'inbody', ''];

/** `data`/`json`/`payload` 값을 JSON으로 풉니다. base64url과 URL 인코딩 JSON을 모두 받습니다. */
function decodePayloadParam(value) {
    if (!value) throw Error('링크에 데이터가 없습니다. 피클에서 링크를 다시 받아 주세요.');
    let text = value;
    if (/%[0-9a-f]{2}/i.test(text)) {
        try {
            text = decodeURIComponent(text);
        }
        catch {
            /* 인코딩이 일부만 적용된 링크는 아래에서 한 번 더 시도합니다. */
        }
    }
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) return parseJson(trimmed);
    try {
        return parseJson(base64urlDecode(trimmed));
    }
    catch (error) {
        throw Error(`링크에 담긴 기록을 읽지 못했습니다. (${error instanceof Error ? error.message : String(error)})`);
    }
}

function parseJson(text) {
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object') throw Error('빈 데이터입니다.');
        return value;
    }
    catch (error) {
        throw Error(`JSON을 읽지 못했습니다. ${error instanceof Error ? error.message : String(error)}`);
    }
}

/** 피클이 보낸 링크(`form://…`)를 종류와 데이터로 나눕니다. */
function parseLink(link) {
    const body = link.replace(/^form:(\/\/)?/i, '');
    const [beforeHash, afterHash = ''] = splitOnce(body, '#');
    const [pathRaw, queryRaw] = splitOnce(beforeHash, '?');
    const path = pathRaw.replace(/^\/+|\/+$/g, '').toLowerCase();
    if (!LINK_PATHS.includes(path)) throw Error(`알 수 없는 피클 링크입니다. (${path})`);
    const hashQuery = afterHash.includes('=') ? afterHash : '';
    const params = parseQuery([queryRaw, hashQuery].filter(Boolean).join('&'));
    if (afterHash && !hashQuery && !params.data) params.data = afterHash;
    if (path === 'start' || path === 'workout-start' || path === 'prepare') {
        const payloadText = params.data ?? params.json ?? params.payload;
        const target = params.routine ?? params.name ?? params.id ?? '';
        const payload = payloadText ? decodePayloadParam(payloadText) : null;
        if (!target && !payload) throw Error('어떤 루틴이나 운동으로 시작할지 링크에 없습니다.');
        return {kind: 'start', payload, target: target || null, raw: link};
    }
    const payloadText = params.data ?? params.json ?? params.payload;
    const payload = decodePayloadParam(payloadText);
    if (path === 'import-session' || path === 'session' || path === 'record' || path === '') {
        if (payloadKind(payload) !== 'session') throw Error('운동 기록이 아닌 데이터입니다. 운동 기록 링크인지 확인해 주세요.');
        return {kind: 'session', payload, raw: link};
    }
    if (path === 'import-routine' || path === 'routine') {
        if (payloadKind(payload) !== 'routine') throw Error('루틴이 아닌 데이터입니다. 루틴 링크인지 확인해 주세요.');
        return {kind: 'routine', payload, raw: link};
    }
    if (path === 'import-body' || path === 'body' || path === 'inbody') {
        if (payloadKind(payload) !== 'body') throw Error('체성분 기록이 아닌 데이터입니다. 인바디 링크인지 확인해 주세요.');
        return {kind: 'body', payload, raw: link};
    }
    throw Error(`알 수 없는 피클 링크입니다. (${path})`);
}

/** 붙여넣은 글(링크 또는 JSON)을 종류와 데이터로 나눕니다.
 *  @returns {{kind: 'session' | 'routine' | 'body' | 'start', payload: any, target?: string | null, raw: string}} */
export function parsePickleInput(text) {
    const source = String(text ?? '').trim();
    if (!source) throw Error('피클에서 받은 링크나 JSON을 붙여넣어 주세요.');
    if (/^form:/i.test(source)) return parseLink(source);
    if (source.startsWith('{') || source.startsWith('[')) {
        const payload = parseJson(source);
        return {kind: payloadKind(payload), payload, raw: source};
    }
    if (/^https?:/i.test(source)) throw Error('form://로 시작하는 피클 링크나 JSON을 붙여넣어 주세요.');
    throw Error('form:// 링크나 JSON을 붙여넣어 주세요.');
}

function numberIn(value, min, max, label) {
    const number = Number(value);
    if (String(value ?? '').trim() === '' || !Number.isFinite(number) || number < min || number > max)
        throw Error(`${label}: ${min}~${max} 범위로 보내 주세요.`);
    return number;
}

function minutesOf(value, setCount) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 1 && number <= 1440) return Math.round(number);
    return Math.max(10, setCount * 3);
}

/** 운동 시작 시각. `startedAt` → `date`(그날 19시) → 지금 순서로 정합니다. */
function startInstant(payload, minutes) {
    for (const [key, offset] of [['startedAt', 0], ['endedAt', minutes], ['at', 0]]) {
        const direct = payload?.[key];
        if (direct === undefined || direct === null || String(direct).trim() === '') continue;
        const parsed = Date.parse(direct);
        if (!Number.isFinite(parsed)) throw Error('운동 시각(startedAt)을 확인해 주세요. ISO 8601 형식이어야 합니다.');
        return new Date(parsed - offset * 60000);
    }
    const day = payload?.date;
    if (typeof day === 'string' && day.trim() !== '') {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
        if (!match) throw Error('날짜는 YYYY-MM-DD 형식으로 보내 주세요.');
        const [, year, month, date] = match.map(Number);
        const value = new Date(year, month - 1, date, 19, 0, 0, 0);
        if (value.getFullYear() !== year || value.getMonth() !== month - 1 || value.getDate() !== date)
            throw Error('존재하지 않는 날짜입니다.');
        return value;
    }
    return new Date(Date.now() - minutes * 60000);
}

function setValues(entry, exercise, index, label) {
    const source = Array.isArray(entry) ? (exercise.type === 'strength' ? {weight: entry[0], reps: entry[1]} : {seconds: entry[0]}) : (entry ?? {});
    if (typeof source !== 'object') throw Error(`${label} ${index + 1}세트 형식을 확인해 주세요.`);
    const kind = ['warmup', 'drop', 'normal'].includes(source.kind) ? source.kind : 'normal';
    const rpeText = source.rpe === undefined || source.rpe === null ? '' : source.rpe;
    let rpe = '';
    if (String(rpeText).trim() !== '') {
        try {
            rpe = parseRpe(rpeText);
        }
        catch {
            throw Error(`${label} ${index + 1}세트의 RPE ${rpeText}는 1~10 사이가 아닙니다.`);
        }
    }
    if (exercise.type === 'strength') {
        const weight = source.weight === undefined || source.weight === null || String(source.weight).trim() === '' ? 0 : numberIn(source.weight, 0, 1000, `${label} ${index + 1}세트 중량`);
        const reps = numberIn(source.reps, 1, 1000, `${label} ${index + 1}세트 횟수`);
        if (!Number.isInteger(reps)) throw Error(`${label} ${index + 1}세트 횟수는 정수로 보내 주세요.`);
        return {weight, reps, seconds: 0, distance: Number(source.distance) || 0, rpe, kind, done: true};
    }
    const seconds = source.seconds !== undefined && String(source.seconds).trim() !== ''
        ? numberIn(source.seconds, 1, 86400, `${label} ${index + 1}세트 시간(초)`)
        : source.minutes !== undefined && String(source.minutes).trim() !== ''
            ? Math.round(numberIn(source.minutes, 0.1, 1440, `${label} ${index + 1}세트 시간(분)`) * 60)
            : numberIn(source.reps, 1, 86400, `${label} ${index + 1}세트 시간(초)`);
    return {weight: Number(source.weight) || 0, reps: 0, seconds, distance: Number(source.distance) || 0, rpe, kind, done: true};
}

/** 피클이 보낸 JSON을 Form의 완료된 운동 기록(session)으로 바꿉니다.
 *  운동은 ID 또는 도감 이름으로 찾고, 값은 저장 전에 validateSession으로 다시 검사합니다.
 *  @returns {{session: any, warnings: string[], minutes: number}} */
export function buildSessionFromPayload(payload, library, options = {}) {
    if (!payload || typeof payload !== 'object') throw Error('운동 기록 데이터가 비어 있습니다.');
    const input = Array.isArray(payload.exercises) ? payload.exercises : null;
    if (!input?.length) throw Error('운동 기록에 운동이 하나도 없습니다.');
    if (input.length > 40) throw Error('한 번에 가져올 수 있는 운동은 40개까지입니다.');
    const warnings = [];
    const name = cleanText(payload.name ?? payload.title, 40) || '피클 운동';
    const seen = new Set();
    const rows = input.map(item => {
        const exercise = resolveExercise(item, library);
        if (seen.has(exercise.id)) throw Error(`${exercise.name} 운동이 두 번 들어 있습니다. 한 번으로 합쳐 보내 주세요.`);
        seen.add(exercise.id);
        const rawSets = Array.isArray(item?.sets) ? item.sets : (item && (item.weight !== undefined || item.reps !== undefined || item.seconds !== undefined) ? [item] : []);
        if (!rawSets.length) throw Error(`${exercise.name}에 세트 기록이 없습니다.`);
        if (rawSets.length > 20) throw Error(`${exercise.name} 세트는 20개까지 가져올 수 있습니다.`);
        const note = cleanText(item?.note, 1000);
        return {exercise, note, sets: rawSets};
    });
    const setCount = rows.reduce((count, row) => count + row.sets.length, 0);
    const minutes = minutesOf(payload.minutes ?? payload.durationMinutes, setCount);
    const start = startInstant(payload, minutes);
    const id = cleanText(payload.id, 80) || `pickle-${hashId([name, start.toISOString(), rows.map(row => row.exercise.id).join(','), setCount])}`;
    const session = {
        id,
        name,
        startedAt: start.toISOString(),
        endedAt: new Date(start.getTime() + minutes * 60000).toISOString(),
        restEndsAt: null,
        pausedMs: 0,
        source: 'pickle',
        importedAt: new Date().toISOString(),
        exercises: rows.map(row => ({
            id: row.exercise.id,
            name: row.exercise.name,
            type: row.exercise.type,
            muscle: row.exercise.muscle,
            note: row.note,
            sets: row.sets.map((entry, index) => ({
                id: `${id}-${row.exercise.id}-${index + 1}`,
                ...setValues(entry, row.exercise, index, row.exercise.name),
            })),
        })),
    };
    try {
        validateSession(session);
    }
    catch (error) {
        throw Error(`운동 기록을 확인해 주세요. ${error instanceof Error ? error.message : String(error)}`);
    }
    return {session, warnings, minutes};
}

/** 피클이 보낸 JSON을 Form 루틴으로 바꿉니다. 운동은 ID 또는 도감 이름으로 찾습니다. */
export function buildRoutineFromPayload(payload, library) {
    if (!payload || typeof payload !== 'object') throw Error('루틴 데이터가 비어 있습니다.');
    const name = cleanText(payload.name ?? payload.title, 40);
    if (!name) throw Error('루틴 이름을 입력하세요.');
    const entries = Array.isArray(payload.exercises) ? payload.exercises : Array.isArray(payload.ids) ? payload.ids : [];
    if (!entries.length) throw Error('루틴에 운동을 하나 이상 넣으세요.');
    if (entries.length > 20) throw Error('루틴 운동은 20개까지 가져올 수 있습니다.');
    const ids = [];
    for (const entry of entries) {
        const exercise = resolveExercise(entry, library);
        if (!ids.includes(exercise.id)) ids.push(exercise.id);
    }
    const routine = {
        id: cleanText(payload.id, 80) || `pickle-routine-${hashId([name, ids.join(',')])}`,
        name,
        subtitle: cleanText(payload.subtitle, 40) || '피클에서 보낸 루틴',
        ids,
        recommended: payload.recommended !== false,
    };
    return {routine, warnings: []};
}

/** 같은 운동을 두 번 가져오지 않도록 ID와 시작 시각으로 확인하고, 새 기록은 맨 앞에 넣습니다. */
export function mergePickleSession(history = [], session) {
    const list = Array.isArray(history) ? history : [];
    if (!session?.id) throw Error('가져올 운동 기록이 없습니다.');
    const duplicate = list.find(item => item?.id === session.id
        || (item?.startedAt === session.startedAt && nameKey(item?.name) === nameKey(session.name)));
    if (duplicate) return {history: list, added: false, duplicate};
    return {history: [session, ...list], added: true, duplicate: null};
}

/** 같은 ID는 내용을 갱신하고, 같은 이름의 루틴은 운동 목록을 합칩니다. 그 밖에는 새로 추가합니다. */
export function mergePickleRoutine(routines = [], routine) {
    const list = Array.isArray(routines) ? routines : [];
    if (!routine?.id) throw Error('가져올 루틴이 없습니다.');
    const key = nameKey(routine.name);
    const sameId = list.findIndex(item => item?.id === routine.id);
    const sameName = list.findIndex(item => nameKey(item?.name) === key);
    const index = sameId >= 0 ? sameId : sameName;
    if (index < 0) return {routines: [routine, ...list], mode: 'added', name: routine.name};
    const current = list[index];
    const ids = [...(current.ids ?? [])];
    for (const id of routine.ids ?? []) if (!ids.includes(id)) ids.push(id);
    const next = list.map((item, at) => at === index
        ? {...item, name: routine.name || item.name, subtitle: routine.subtitle || item.subtitle, ids}
        : item);
    return {routines: next, mode: sameId >= 0 ? 'updated' : 'merged', name: current.name, added: ids.length - (current.ids ?? []).length};
}

/** 측정일은 `YYYY-MM-DD`(그날 측정) 또는 ISO 8601 시각을 받습니다. */
function bodyDate(payload) {
    const direct = payload?.date ?? payload?.measuredAt ?? payload?.at;
    if (direct === undefined || direct === null || String(direct).trim() === '')
        throw Error('측정일이 없습니다. date(YYYY-MM-DD) 또는 measuredAt을 함께 보내 주세요.');
    const text = String(direct).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return measurementDate(text);
    const parsed = Date.parse(text);
    if (!Number.isFinite(parsed)) throw Error('측정일을 확인해 주세요. YYYY-MM-DD 또는 ISO 8601 형식이어야 합니다.');
    return new Date(parsed).toISOString();
}

/** 인바디 결과에서 읽은 값을 Form 체성분 기록(BodyEntry)으로 바꿉니다.
 *  체지방량만 있으면 체지방률을 계산하고, 키가 있으면 BMI를 함께 채웁니다.
 *  @returns {{entry: any, warnings: string[]}} */
export function buildBodyFromPayload(payload) {
    if (!payload || typeof payload !== 'object') throw Error('체성분 데이터가 비어 있습니다.');
    const read = (...keys) => {
        for (const key of keys) {
            const value = payload[key];
            if (value !== undefined && value !== null && String(value).trim() !== '') return value;
        }
        return undefined;
    };
    const weight = read('weight', 'bodyWeight', 'mass');
    if (weight === undefined) throw Error('체중(weight)이 없습니다. 인바디 결과지의 체중을 함께 보내 주세요.');
    const muscle = read('muscleMass', 'muscle', 'skeletalMuscleMass', 'skeletalMuscle', 'smm');
    const bodyFat = read('bodyFat', 'bodyFatPercent', 'bodyFatRate', 'bodyFatPercentage', 'pbf');
    const fatMass = read('bodyFatMass', 'fatMass', 'bfm');
    const input = {date: bodyDate(payload), weight, note: cleanText(payload.note ?? payload.memo, 2000)};
    if (muscle !== undefined) input.muscle = muscle;
    if (bodyFat !== undefined) input.bodyFat = bodyFat;
    else if (fatMass !== undefined && Number(weight) > 0) {
        const percent = Number(fatMass) / Number(weight) * 100;
        if (Number.isFinite(percent)) input.bodyFat = Math.round(percent * 10) / 10;
    }
    for (const [key, ...aliases] of [['height', 'heightCm'], ['bmr', 'basalMetabolicRate'], ['visceralFat', 'visceralFatLevel'], ['waist', 'waistCircum']]) {
        const value = read(key, ...aliases);
        if (value !== undefined) input[key] = value;
    }
    let entry;
    try {
        entry = validateBody(input);
    }
    catch (error) {
        throw Error(`체성분 값을 확인해 주세요. ${error instanceof Error ? error.message : String(error)}`);
    }
    entry.source = 'pickle';
    const fat = Number(fatMass);
    if (Number.isFinite(fat) && fat > 0 && fat < 300) entry.bodyFatMass = Math.round(fat * 10) / 10;
    const score = Number(read('inbodyScore', 'inbodyScorePoint', 'score'));
    if (Number.isFinite(score) && score > 0 && score <= 100) entry.inbodyScore = Math.round(score);
    const given = Number(read('bmi'));
    const value = Number.isFinite(given) && given > 0 ? given : entry.height ? bmi(entry.weight, entry.height) : null;
    if (value && value > 5 && value < 80) entry.bmi = Math.round(value * 10) / 10;
    return {entry, warnings: []};
}

/** 같은 날(기기 기준) 측정이 이미 있으면 그 기록을 새로 고치고, 없으면 추가합니다.
 *  사진·메모·건강 앱 동기화 표시는 지우지 않고, 수정할 때마다 revision을 올립니다. */
export function mergePickleBody(body = [], entry) {
    const list = Array.isArray(body) ? body : [];
    if (!entry?.date) throw Error('가져올 체성분 기록이 없습니다.');
    const day = localDateInput(entry.date);
    const index = list.findIndex(item => item?.date && localDateInput(item.date) === day);
    if (index < 0) {
        const added = {...entry, id: entry.id || `pickle-body-${hashId([day])}`, revision: entry.revision ?? 1};
        return {body: [added, ...list], mode: 'added', entry: added};
    }
    const current = list[index];
    const merged = {
        ...current,
        ...entry,
        id: current.id,
        revision: nextBodyRevision(current),
        note: entry.note || current.note || '',
        photo: current.photo ?? entry.photo ?? null,
        source: entry.source ?? current.source,
    };
    return {body: list.map((item, at) => at === index ? merged : item), mode: 'updated', entry: merged};
}

/** `sync/pickle-inbox.json`을 읽습니다. 항목 단위로 검사해 잘못된 항목만 건너뜁니다.
 *  @returns {{items: {id: string, kind: 'body' | 'session' | 'routine', payload: any, createdAt: string | null}[], skipped: {id: string | null, reason: string}[], version: number}} */
export function parsePickleInbox(text) {
    let value;
    try {
        value = typeof text === 'string' ? JSON.parse(text) : text;
    }
    catch {
        throw Error('동기화 파일을 읽지 못했습니다. JSON 형식을 확인해 주세요.');
    }
    const list = Array.isArray(value) ? value : value?.items;
    if (!Array.isArray(list)) throw Error('동기화 파일에 items 목록이 없습니다.');
    const version = Number(Array.isArray(value) ? 1 : value?.version ?? 1);
    if (version !== 1) throw Error('지원하지 않는 동기화 파일 버전입니다.');
    const items = [];
    const skipped = [];
    for (const raw of list) {
        const id = typeof raw?.id === 'string' ? raw.id.trim() : '';
        if (!id) {
            skipped.push({id: null, reason: 'id가 없습니다.'});
            continue;
        }
        const payload = raw?.payload;
        if (!payload || typeof payload !== 'object') {
            skipped.push({id, reason: 'payload가 없습니다.'});
            continue;
        }
        let kind = String(raw?.kind ?? '').toLowerCase();
        if (!['body', 'session', 'routine'].includes(kind)) {
            try {
                kind = payloadKind(payload);
            }
            catch (error) {
                skipped.push({id, reason: error instanceof Error ? error.message : String(error)});
                continue;
            }
        }
        items.push({id, kind, payload, createdAt: typeof raw?.createdAt === 'string' ? raw.createdAt : null});
    }
    return {items, skipped, version};
}

/** 아직 적용하지 않은 항목만 body·history·routines에 병합합니다.
 *  실패한 항목은 그대로 남겨 두고(다음 동기화에서 재시도) 나머지를 먼저 반영합니다. */
export function applyPickleInbox(state, inbox, options = {}) {
    const library = Array.isArray(options.library) ? options.library : [];
    const applied = new Set((Array.isArray(state?.appliedSyncIds) ? state.appliedSyncIds : []).filter(id => typeof id === 'string'));
    const patch = {
        history: Array.isArray(state?.history) ? state.history : [],
        body: Array.isArray(state?.body) ? state.body : [],
        routines: Array.isArray(state?.routines) ? state.routines : [],
        appliedSyncIds: [...applied],
    };
    const summary = {body: 0, session: 0, routine: 0};
    const skipped = [...(inbox?.skipped ?? [])];
    const errors = [];
    for (const item of inbox?.items ?? []) {
        if (applied.has(item.id)) {
            skipped.push({id: item.id, reason: '이미 반영된 항목입니다.'});
            continue;
        }
        try {
            if (item.kind === 'session') {
                const {session} = buildSessionFromPayload(item.payload, library);
                const merged = mergePickleSession(patch.history, session);
                patch.history = merged.history;
                if (merged.added) summary.session++;
            }
            else if (item.kind === 'routine') {
                const {routine} = buildRoutineFromPayload(item.payload, library);
                patch.routines = mergePickleRoutine(patch.routines, routine).routines;
                summary.routine++;
            }
            else if (item.kind === 'body') {
                const {entry} = buildBodyFromPayload(item.payload);
                patch.body = mergePickleBody(patch.body, entry).body;
                summary.body++;
            }
            else {
                skipped.push({id: item.id, reason: '알 수 없는 종류입니다.'});
                continue;
            }
            applied.add(item.id);
            patch.appliedSyncIds.push(item.id);
        }
        catch (error) {
            errors.push({id: item.id, reason: error instanceof Error ? error.message : String(error)});
        }
    }
    // 목록이 무한정 길어지지 않게 최근 200개만 남깁니다.
    patch.appliedSyncIds = patch.appliedSyncIds.slice(-200);
    return {patch, summary, count: summary.body + summary.session + summary.routine, errors, skipped};
}

function round1(value) {
    return Math.round(Number(value) * 10) / 10;
}

function grouped(value) {
    const number = round1(value);
    const [whole, decimal] = String(number).split('.');
    const text = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decimal ? `${text}.${decimal}` : text;
}

function secondsText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    if (total < 60) return `${total}초`;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${minutes}분 ${rest}초` : `${minutes}분`;
}

const WEEKDAYS = '일월화수목금토';

function dayText(iso) {
    const date = new Date(iso);
    if (!Number.isFinite(+date)) return '';
    return `${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

/** 운동 하나를 피클 채팅에 붙여넣을 한국어 브리핑으로 만듭니다.
 *  종목별 세트·중량·횟수·RPE·메모와 주간 볼륨, 최근 체성분을 담습니다. */
export function feedbackText(session, history = [], options = {}) {
    if (!session) throw Error('보낼 운동 기록이 없습니다.');
    const unit = options.unit === 'lb' ? 'lb' : 'kg';
    const factor = unit === 'lb' ? 2.20462 : 1;
    const weightText = value => (Number(value) > 0 ? `${grouped(Number(value) * factor)} ${unit}` : `0 ${unit}`);
    const summary = sessionSummary(history, session, options.goal ?? 3);
    const week = calendarWeekVolume(history, options.reference ?? new Date());
    const lines = [];
    lines.push(`[Form] ${dayText(session.startedAt)} · ${session.name}`);
    const head = [`${summary.sets}세트`, `총 볼륨 ${grouped(summary.volume * factor)} ${unit}`];
    if (summary.minutes) head.push(`${summary.minutes}분`);
    lines.push(head.join(' · '));
    if (summary.prs?.length) lines.push(summary.prs.map(pr => `${pr.first ? '첫 기록' : 'PR'} ${pr.name} ${weightText(pr.value)}`).join(' · '));
    if (summary.volumeDelta !== null && summary.volumeDelta !== undefined)
        lines.push(`직전 운동 대비 ${summary.volumeDelta > 0 ? '+' : ''}${grouped(summary.volumeDelta * factor)} ${unit}`);
    lines.push('');
    const exercises = Array.isArray(session.exercises) ? session.exercises : [];
    if (!exercises.length) lines.push('세트 기록 없이 저장된 운동입니다.');
    for (const exercise of exercises) {
        const done = (exercise.sets ?? []).filter(set => set.done);
        if (!done.length && !exercise.note) continue;
        lines.push(`■ ${exercise.name}${exercise.muscle ? ` · ${exercise.muscle}` : ''}`);
        done.forEach((set, index) => {
            const parts = [exercise.type === 'strength'
                ? `${weightText(set.weight)} × ${set.reps}회`
                : secondsText(set.seconds)];
            if (set.kind === 'warmup') parts.push('워밍업');
            if (set.kind === 'drop') parts.push('드롭세트');
            if (set.rpe !== '' && set.rpe !== undefined && set.rpe !== null) parts.push(`RPE ${set.rpe}`);
            lines.push(`${index + 1}세트 ${parts.join(' · ')}`);
        });
        if (exercise.note) lines.push(`메모: ${exercise.note}`);
    }
    lines.push('');
    lines.push(`이번 주 ${summary.weekCount}/${summary.weekGoal}회 · 주간 볼륨 ${grouped(week.volume * factor)} ${unit}`);
    const body = options.body;
    if (body && Number(body.weight) > 0) {
        const parts = [`체중 ${body.weight} ${unit === 'lb' ? 'lb' : 'kg'}`];
        if (Number(body.muscle) > 0) parts.push(`골격근 ${body.muscle} kg`);
        if (Number(body.bodyFat) > 0) parts.push(`체지방 ${body.bodyFat}%`);
        lines.push(`체성분 ${dayText(body.date).replace(/ \(.\)$/, '')} · ${parts.join(' · ')}`);
    }
    lines.push('');
    lines.push(options.footer ?? '이 기록으로 오늘 운동 피드백과 다음 운동 계획을 부탁해.');
    return lines.join('\n');
}

/** 같은 내용을 JSON으로 만듭니다. 그대로 피클에 붙여넣거나 파일로 보관할 수 있습니다. */
export function feedbackPayload(session, history = [], options = {}) {
    if (!session) throw Error('보낼 운동 기록이 없습니다.');
    const summary = sessionSummary(history, session, options.goal ?? 3);
    const week = calendarWeekVolume(history, options.reference ?? new Date());
    return {
        type: 'session',
        app: 'form',
        schemaVersion: PICKLE_SCHEMA_VERSION,
        name: session.name,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        minutes: summary.minutes,
        exercises: (session.exercises ?? []).map(exercise => ({
            id: exercise.id,
            name: exercise.name,
            muscle: exercise.muscle,
            type: exercise.type,
            note: exercise.note ?? '',
            sets: (exercise.sets ?? []).filter(set => set.done).map(set => exercise.type === 'strength'
                ? {weight: set.weight, reps: set.reps, kind: set.kind ?? 'normal', rpe: set.rpe || undefined}
                : {seconds: set.seconds, kind: set.kind ?? 'normal', rpe: set.rpe || undefined}),
        })),
        summary: {
            sets: summary.sets,
            volume: summary.volume,
            previousVolume: summary.previousVolume,
            volumeDelta: summary.volumeDelta,
            prs: (summary.prs ?? []).map(pr => ({name: pr.name, value: pr.value, first: pr.first === true})),
            weekCount: summary.weekCount,
            weekGoal: summary.weekGoal,
            weekVolume: week.volume,
        },
        body: options.body ? {
            date: options.body.date,
            weight: options.body.weight,
            bodyFat: options.body.bodyFat ?? null,
            muscle: options.body.muscle ?? null,
        } : null,
    };
}

/** 피클이 그대로 만들 수 있는 링크를 되돌려 줍니다(문서·테스트용). */
export function encodePickleLink(kind, payload) {
    const path = kind === 'routine' ? 'import-routine' : kind === 'body' ? 'import-body' : kind === 'start' ? 'start' : 'import-session';
    return `form://${path}?data=${base64urlEncode(JSON.stringify(payload))}`;
}

/** 피클이 붙여넣을 안내 문구. 같은 형식을 다시 만들 때 참고합니다. */
export function pickleGuide() {
    return [
        '형식: form://import-session?data=<base64url(JSON)> 또는 form://import-session?json=<URL 인코딩 JSON>',
        '{"type":"session","name":"가슴·삼두","date":"2026-11-28","minutes":52,',
        ' "exercises":[{"name":"바벨 벤치 프레스","sets":[{"weight":80,"reps":8},{"weight":80,"reps":8}]}]}',
        '루틴: form://import-routine — {"type":"routine","name":"푸시 A","exercises":["바벨 벤치 프레스","덤벨 숄더 프레스"]}',
        '시작: form://start?routine=푸시 A',
        '인바디: form://import-body — {"type":"body","date":"2026-11-28","weight":78.4,"muscleMass":36.2,"bodyFat":16.1}',
    ].join('\n');
}

/** 운동 기록에서 지금까지의 최고 볼륨을 참고용으로 돌려줍니다(피클 미리보기용). */
export function sessionVolumeText(session) {
    return grouped(volume(session));
}
