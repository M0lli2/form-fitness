/** 건강 데이터는 명시적인 사용자 동작에서만 읽거나 씁니다. 서버 전송은 하지 않습니다. */
import Device from '../modules/form-device';
import type { BodyEntry, Session } from './types';
export async function connectHealth() { if (!await Device.healthAvailable())
    throw Error('이 기기에서 건강 데이터 서비스를 사용할 수 없습니다. Android에서는 Health Connect 설치/업데이트를 확인하세요.'); if (!await Device.authorize())
    throw Error('허용된 건강 권한이 없습니다.'); return Device.readHealth(); }
export const readHealth = () => Device.readHealth();
/** 안정적인 ID로 재시도를 하므로 플랫폼에서 같은 기록을 중복 생성하지 않습니다. */
export async function exportBody(entry: BodyEntry) { await Device.saveBody(entry.id, entry.date, entry.weight, entry.bodyFat ?? null, entry.revision ?? 1); }
export async function exportWorkout(session: Session) { if (!session.endedAt)
    throw Error('완료되지 않은 운동입니다.'); if (session.external && session.sync !== 'watch')
    throw Error('워치/외부에서 가져온 기록은 다시 내보내지 않습니다.'); await Device.saveWorkout(session.id, session.name, session.startedAt, session.endedAt); }
