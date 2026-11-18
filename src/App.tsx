/** FORM 네이티브 앱 진입점. UI는 React Native 뷰이며 WebView를 사용하지 않습니다. */
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FS from 'expo-file-system/legacy';
import { ThemeProvider, useTheme, Glass, Label, Button } from './theme';
import { freshState, loadState, persist } from './storage';
import { uid, makeSession, validateSession, volume, estimated1RM, validateBody, weekStart, bmi, applyWatchCommand, validateBackup } from './core.mjs';
import { connectHealth, readHealth, exportBody, exportWorkout } from './health';
import Device from '../modules/form-device';
import catalog from './exercises.json';
import {measurementDate, localDateInput, nextBodyRevision, validateCustomExercise} from './core.mjs';
import {FormTheme} from './ui-v2/Theme';
import {FocusedWorkout} from './ui-v2/FocusedWorkout';
import {Surface} from './ui-v2/Primitives';
import type { State, Exercise, Session, BodyEntry } from './types';
const catalogExercises = catalog.exercises as Exercise[];
const tabs = [['home', '◉', '오늘'], ['workout', '▥', '루틴'], ['progress', '↗', '기록'], ['settings', '◎', '내 정보']];
const dateText = (v: string) => new Date(v).toLocaleDateString('ko-KR');
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });
export default function App() {
    const [state, setState] = useState<State | null>(null), [failure, setFailure] = useState('');
    useEffect(() => { loadState().then(setState).catch(e => setFailure(errorText(e))); }, []);
    if (!state)
        return <SafeAreaProvider><SafeAreaView style={s.loading}><Label size={35} bold>form.</Label><Label>{failure || '나의 트레이닝 공간을 준비합니다.'}</Label>{failure && <Label muted>기존 기록 보호를 위해 초기화하지 않았습니다.</Label>}</SafeAreaView></SafeAreaProvider>;
    return <SafeAreaProvider><ThemeProvider mode={state.settings.theme} contrast={state.settings.contrast || !state.settings.glass}><FormTheme preferences={{mode:state.settings.theme,glass:state.settings.glass && !state.settings.contrast}}><Main state={state} setState={setState}/></FormTheme></ThemeProvider></SafeAreaProvider>;
}
function Main({ state, setState }: {
    state: State;
    setState: React.Dispatch<React.SetStateAction<State | null>>;
}) {
    const { colors, dark } = useTheme();
    const exercises = [...catalogExercises, ...(state.customExercises ?? [])];
    const [focused, setFocused] = useState(false);
    const [page, setPage] = useState('home'), [modal, setModal] = useState<{
        type: string;
        item?: any;
    } | null>(null), [query, setQuery] = useState(''), [muscle, setMuscle] = useState('전체'), [equipment, setEquipment] = useState('전체'), [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [health, setHealth] = useState<any>(null), [watch, setWatch] = useState<any>(null);
    const stateRef = useRef(state);
    stateRef.current = state;
    const queue = useRef(Promise.resolve());
    const notification = useRef<string | null>(null);
    /** 단일 쓰기 큐가 UI 편집·워치 이벤트 사이의 경쟁을 방지합니다. */
    function change(update: (current: State) => State): Promise<void> { const next = queue.current.catch(() => { }).then(async () => { const updated = update(stateRef.current); await persist(updated); stateRef.current = updated; setState(updated); }); queue.current = next; next.catch(e => Alert.alert('저장하지 못했습니다', errorText(e))); return next; }
    async function run(action: () => Promise<void>) { if (busy)
        return; setBusy(true); try {
        await action();
    }
    catch (e) {
        Alert.alert('확인이 필요합니다', errorText(e));
    }
    finally {
        setBusy(false);
    } }
    /** 타이머는 남은 초를 감소시키지 않고 종료 시각으로 계산해 백그라운드 복귀에도 정확합니다. */
    // 운동이 없는 홈·설정에서는 전체 화면을 매초 다시 그리지 않습니다.
    useEffect(() => {
        if (!state.active) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [state.active?.id]);
    useEffect(() => { const end = state.active?.restEndsAt; if (end && now >= end) {
        change(x => ({ ...x, active: x.active ? { ...x.active, restEndsAt: null } : null }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    } }, [now, state.active?.restEndsAt]);
    useEffect(() => { const sub = AppState.addEventListener('change', v => { if (v === 'active') {
        setNow(Date.now());
        pollWatch();
    } }); return () => sub.remove(); }, []);
    /** 수신 데이터를 DB에 확정한 뒤 ACK. 앱 종료 후에도 같은 이벤트를 안전하게 재처리합니다. */
    async function pollWatch() { try {
        const messages = await Device.drainWatch();
        for (const text of messages) {
            let cmd: any;
            try {
                cmd = JSON.parse(text);
            }
            catch {
                continue;
            }
            if (typeof cmd.id !== 'string')
                continue;
            await change(current => { if (current.seen.includes(cmd.id))
                return current; const next = { ...current, seen: [...current.seen, cmd.id] }; if (cmd.action === 'completeSet') {
                const result = applyWatchCommand(current.active, cmd, current.seen);
                if (result.accepted)
                    next.active = { ...result.session, restEndsAt: Date.now() + current.settings.rest * 1000 };
            }
            else if (cmd.action === 'workoutFinished' && typeof cmd.start === 'string' && typeof cmd.end === 'string' && Date.parse(cmd.end) > Date.parse(cmd.start) && !current.history.some(x => x.id === cmd.id)) {
                next.history = [{ id: cmd.id, name: '워치 근력 운동', startedAt: cmd.start, endedAt: cmd.end, restEndsAt: null, exercises: [], external: true, sync: cmd.healthSaved ? 'synced' : 'watch' }, ...current.history];
            } return next; });
            await Device.ackWatch([cmd.id]);
        }
    }
    catch { /* 연결되지 않은 기기에서는 로컬 기록을 계속 사용합니다. */ } }
    useEffect(() => { pollWatch(); const id = setInterval(pollWatch, 5000); return () => clearInterval(id); }, []);
    useEffect(() => { const active = state.active; const target = active?.exercises.flatMap(e => e.sets.filter(x => !x.done).map(set => ({ exerciseId: e.id, exerciseName: e.name, setId: set.id, weight: set.weight, reps: set.reps, seconds: set.seconds, type: e.type }))).at(0); Device.sendWatch(JSON.stringify({ sessionId: active?.id ?? null, name: active?.name ?? '진행 중인 운동 없음', startedAt: active?.startedAt, next: target ?? null, restEndsAt: active?.restEndsAt ?? null })).catch(() => { }); }, [state.active]);
    async function start(name: string, ids: string[]) { if (state.active) {
        setPage('workout');
        return;
    } await change(x => ({ ...x, active: makeSession(name, ids.map(id => exercises.find(e => e.id === id)).filter(Boolean), x.history) as Session })); setPage('workout'); setFocused(true); }
    function patchActive(fn: (session: Session) => Session) { return change(x => ({ ...x, active: x.active ? fn(structuredClone(x.active)) : null })); }
    async function completeSet(exerciseId: string, setId: string, values?: {weight:number;reps:number}) { await patchActive(active => { const e = active.exercises.find(x => x.id === exerciseId)!; const set = e.sets.find(x => x.id === setId)!; if(values) Object.assign(set,values); set.done = values ? true : !set.done; active.restEndsAt = null; if (set.done) {
        validateSession(active);
        active.restEndsAt = Date.now() + state.settings.rest * 1000;
    } return active; }); await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); if (notification.current)
        await Notifications.cancelScheduledNotificationAsync(notification.current); if (stateRef.current.active?.restEndsAt && (await Notifications.getPermissionsAsync()).granted) {
        notification.current = await Notifications.scheduleNotificationAsync({ content: { title: '다음 세트를 시작할 시간', body: '호흡을 정리하고 준비하세요.', sound: true }, trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: state.settings.rest } });
    } }
    async function finish() { const active = stateRef.current.active; if (!active)
        return; validateSession(active); const ended = { ...active, endedAt: new Date().toISOString(), restEndsAt: null }; await change(x => ({ ...x, history: [ended, ...x.history], active: null })); if (notification.current)
        await Notifications.cancelScheduledNotificationAsync(notification.current); setPage('progress'); Alert.alert('오늘의 운동을 기록했습니다', `${ended.exercises.reduce((n, e) => n + e.sets.filter(s => s.done).length, 0)}세트 · ${volume(ended).toLocaleString()} kg 볼륨`); }
    const recent = state.history.filter(x => new Date(x.startedAt) >= weekStart()), totalVolume = recent.reduce((n, x) => n + volume(x), 0);
    const title = ({ home: '오늘도, 나의 페이스로.', workout: '운동에 집중할 시간', library: '좋은 자세가 좋은 시작', progress: '기록이 쌓이는 곳', body: '숫자로 만나는 변화', settings: '나에게 맞춘 FORM' } as any)[page];
    const unit = state.settings.units;
    const displayWeight = (v: number) => unit === 'lb' ? Math.round(v * 2.2046226218 * 10) / 10 : v;
    // 홈: 비어 있는 새 계정에 가짜 성과 대신 바로 시작할 수 있는 루틴을 제시합니다.
    function home() { return <><LinearGradient colors={dark ? ['#303036', '#171719'] : ['#242428', '#494950']} style={s.hero}><Label size={10} style={{ color: '#E6E6EA', letterSpacing: 2 }}>A LITTLE STRONGER, EVERY DAY</Label><Label size={30} bold style={{ color: '#fff', marginVertical: 17 }}>오늘의 움직임이{'\n'}내일의 나를 만듭니다.</Label><Label style={{ color: '#D1D1D8', marginBottom: 22 }}>완벽한 하루보다, 꾸준한 한 세트.</Label><Button title={state.active ? '진행 중인 운동 이어하기 →' : '운동 시작하기 →'} onPress={() => state.active ? setPage('workout') : setModal({ type: 'start' })}/></LinearGradient><View style={s.row}><Metric label="이번 주 운동" value={`${recent.length}`} unit="회"/><Metric label="누적 볼륨" value={Math.round(totalVolume / 100) / 10} unit="t"/><Metric label="이번 주 목표" value={`${Math.min(recent.length, state.settings.goal)}/${state.settings.goal}`} unit="회"/></View><Glass><Section title="이번 주의 리듬" right={`${Math.round(Math.min(1, recent.length / state.settings.goal) * 100)}%`}/><View style={[s.track, { backgroundColor: colors.soft }]}><View style={{ width: `${Math.min(100, recent.length / state.settings.goal * 100)}%`, height: 7, backgroundColor: '#81818B', borderRadius: 8 }}/></View><View style={s.spread}>{['월', '화', '수', '목', '금', '토', '일'].map((day, i) => { const d = weekStart(); d.setDate(d.getDate() + i); const done = recent.some(x => new Date(x.startedAt).toDateString() === d.toDateString()); return <View key={day} style={s.day}><Label muted size={11}>{day}</Label><View style={[s.dayCircle, { backgroundColor: done ? colors.lime : colors.soft }]}><Label style={{ color: done ? '#171719' : colors.ink }}>{done ? '✓' : d.getDate()}</Label></View></View>; })}</View></Glass><Section title="나의 루틴" right="흔들림 없는 기본"/>{state.routines.slice(0, 3).map(r => <RoutineCard key={r.id} routine={r}/>)}<Glass><Label size={11} muted>TRAINING NOTE</Label><Label size={19} bold>무게보다 먼저, 움직임을.</Label><Label muted>가벼운 중량으로 자세를 익히고, 이전 기록을 기준으로 천천히 성장하세요.</Label><Button secondary title={`${exercises.length}가지 운동법 살펴보기`} onPress={() => setPage('library')}/></Glass></>; }
    function RoutineCard({ routine }: {
        routine: State['routines'][number];
    }) { return <Glass><View style={s.spread}><View style={s.flex}><Label size={17} bold>{routine.name}</Label><Label muted size={12}>{routine.subtitle} · {routine.ids.length}개 운동</Label></View><Pressable accessibilityRole="button" accessibilityLabel={`${routine.name} 시작`} onPress={() => run(() => start(routine.name, routine.ids))} style={[s.play, { backgroundColor: colors.soft }]}><Label>▶</Label></Pressable></View><Label muted size={11}>{routine.ids.map(id => exercises.find(e => e.id === id)?.name).filter(Boolean).join(' · ')}</Label></Glass>; }
    function workout() {
        const active = state.active;
        if (!active)
            return <><Button secondary title="운동법 검색" onPress={()=>setPage('library')}/><Button title="+ 새 루틴 만들기" onPress={() => setModal({ type: 'routine' })}/><Button secondary title="빈 운동 시작" onPress={() => run(() => start('자유 운동', []))}/>{state.routines.map(r => <View key={r.id} style={{ gap: 5 }}><RoutineCard routine={r}/><Pressable accessibilityRole="button" onPress={() => setModal({ type: 'routine', item: r })}><Label muted size={12} style={{ textAlign: 'right', padding: 8 }}>루틴 편집</Label></Pressable></View>)}</>;
        const target = active.exercises.find(e => e.sets.some(set => !set.done));
        if (focused && target?.type === 'strength') {
            const detail = exercises.find(e => e.id === target.id);
            const previous = state.history.flatMap(h => h.exercises).find(e => e.id === target.id)?.sets.find(s => s.done);
            return <View style={{minHeight:650}}><FocusedWorkout key={target.id} exercise={{...target,equipment:detail?.equipment ?? '',position:active.exercises.indexOf(target)+1,total:active.exercises.length,previous:previous ? displayWeight(previous.weight)+' '+unit+' × '+previous.reps : null}} units={unit} startedAt={Date.parse(active.startedAt)} restDeadline={active.restEndsAt} guide={<Label>{detail?.steps[0] ?? '편안한 자세에서 시작하세요.'}</Label>} onComplete={async (id, values) => {
                await completeSet(target.id,id,values);
            }} onSkipRest={()=>run(async()=>{await patchActive(x=>({...x,restEndsAt:null}));if(notification.current)await Notifications.cancelScheduledNotificationAsync(notification.current);})} onOpenList={()=>setFocused(false)} onOpenGuide={()=>setModal({type:'exercise',item:detail})} onNext={()=>setFocused(false)}/></View>;
        }
        return <><Button secondary title="한 운동에 집중하기" onPress={()=>setFocused(true)}/><Glass><View style={s.spread}><Label bold size={19}>{active.name}</Label><Label bold>{clock(Math.max(0, Math.floor((now - Date.parse(active.startedAt)) / 1000)))}</Label></View><Label muted>{active.exercises.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)}세트 완료 · {volume(active).toLocaleString()} kg</Label>{active.restEndsAt && <View style={[s.rest, { backgroundColor: colors.soft }]}><Label>휴식 {clock(Math.max(0, Math.ceil((active.restEndsAt - now) / 1000)))}</Label><Button secondary title="건너뛰기" onPress={() => run(async () => { await patchActive(x => ({ ...x, restEndsAt: null })); if (notification.current)
            await Notifications.cancelScheduledNotificationAsync(notification.current); })}/></View>}</Glass>{active.exercises.map(e => <Glass key={e.id}><View style={s.spread}><Pressable accessibilityRole="button" onPress={() => setModal({ type: 'exercise', item: exercises.find(x => x.id === e.id) })}><Label bold size={17}>{e.name} ⓘ</Label></Pressable><Pressable accessibilityLabel={`${e.name} 삭제`} onPress={() => Alert.alert('운동 삭제', `${e.name}의 진행 기록도 삭제됩니다.`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => patchActive(x => ({ ...x, exercises: x.exercises.filter(a => a.id !== e.id) })) }])}><Label muted>×</Label></Pressable></View><View style={s.setRow}><Label size={10} style={{ width: 27 }}>세트</Label><Label size={10} style={s.flex}>{e.type === 'strength' ? unit : '초'}</Label><Label size={10} style={s.flex}>{e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리 km' : 'RPE'}</Label><Label size={10} style={{ width: 48 }}>완료</Label></View>{e.sets.map((set, i) => <View key={set.id}><View style={s.setRow}><Label style={{ width: 27 }}>{i + 1}</Label><Numeric value={e.type === 'strength' ? displayWeight(set.weight) : set.seconds} label={e.type === 'strength' ? '중량' : '시간(초)'} onChange={value => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; if (e.type === 'strength')
            st.weight = unit === 'lb' ? value / 2.2046226218 : value;
        else
            st.seconds = value; return x; })}/><Numeric value={e.type === 'strength' ? set.reps : e.type === 'cardio' ? set.distance : Number(set.rpe || 0)} label={e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리 km' : 'RPE'} onChange={value => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; if (e.type === 'strength')
            st.reps = value;
        else if (e.type === 'cardio')
            st.distance = value;
        else
            st.rpe = String(value); return x; })}/><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.done }} accessibilityLabel={`${e.name} ${i + 1}세트 완료`} onPress={() => run(() => completeSet(e.id, set.id))} style={[s.check, { backgroundColor: set.done ? colors.lime : colors.soft }]}><Label style={{ color: set.done ? '#26422d' : colors.ink }}>{set.done ? '✓' : '○'}</Label></Pressable></View><View style={[s.row, { marginTop: 5 }]}><Pressable onPress={() => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; st.kind = st.kind === 'normal' ? 'warmup' : st.kind === 'warmup' ? 'drop' : 'normal'; return x; })}><Label size={11} muted>{({ normal: '일반', warmup: '워밍업', drop: '드롭' } as any)[set.kind]} ↻</Label></Pressable><Pressable onPress={() => patchActive(x => { x.exercises.find(a => a.id === e.id)!.sets.splice(i, 1); return x; })}><Label size={11} muted>세트 삭제</Label></Pressable></View></View>)}<Button secondary title="+ 세트 추가" onPress={() => patchActive(x => { const ex = x.exercises.find(a => a.id === e.id)!; ex.sets.push({ ...ex.sets.at(-1) ?? { weight: 0, reps: 10, seconds: 30, distance: 0, rpe: '', kind: 'normal' }, id: uid(), done: false }); return x; })}/><TextInput placeholder="자세, 컨디션, 다음 운동을 위한 메모" placeholderTextColor={colors.muted} value={e.note} onChangeText={note => patchActive(x => { x.exercises.find(a => a.id === e.id)!.note = note; return x; })} style={[s.input, { color: colors.ink, borderColor: colors.line }]}/></Glass>)}<Button secondary title="+ 운동 추가" onPress={() => setModal({ type: 'add' })}/><Button title="운동 마치고 저장" disabled={busy} onPress={() => run(finish)}/><Button secondary danger title="운동 취소" onPress={() => Alert.alert('진행 중인 운동을 취소할까요?', '완료하지 않은 운동 기록이 삭제됩니다.', [{ text: '계속 운동' }, { text: '취소하기', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, active: null })); if (notification.current)
                    await Notifications.cancelScheduledNotificationAsync(notification.current); }) }])}/></>;
    }
    function library() { const filtered = exercises.filter(e => (muscle === '전체' || e.muscle === muscle) && (equipment === '전체' || e.equipment === equipment) && `${e.name} ${e.muscle} ${e.equipment}`.includes(query)); return <><Button secondary title="+ 사용자 운동 등록" onPress={() => setModal({type:'custom-exercise'})}/><Input value={query} onChangeText={setQuery} placeholder="운동명, 부위, 장비 검색"/><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.row}>{['전체', ...new Set(exercises.map(e => e.muscle))].map(m => <Chip key={m} active={muscle === m} title={m} onPress={() => setMuscle(m)}/>)}</View></ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false}><View style={s.row}>{['전체', ...new Set(exercises.map(e => e.equipment))].map(m => <Chip key={m} active={equipment === m} title={m} onPress={() => setEquipment(m)}/>)}</View></ScrollView><Label muted size={12}>{filtered.length}개 운동 · 자세와 주의사항</Label>{filtered.map(e => <Pressable key={e.id} accessibilityRole="button" onPress={() => setModal({ type: 'exercise', item: e })}><Glass><View style={s.spread}><View><Label bold size={17}>{e.name}</Label><Label muted size={12}>{e.muscle} · {e.equipment} · {e.level}</Label></View><Label>↗</Label></View></Glass></Pressable>)}{!filtered.length && <Empty text="조건에 맞는 운동이 없습니다. 검색어나 필터를 바꿔보세요."/>}</>; }
    function progress() { const history = state.history; const pr = history.flatMap(h => h.exercises.flatMap(e => e.sets.filter(s => s.done && s.kind !== 'warmup').map(s => ({ name: e.name, value: estimated1RM(s.weight, s.reps) ?? 0 })))).sort((a, b) => b.value - a.value)[0]; return <><View style={s.row}><Metric label="전체 운동" value={history.length} unit="회"/><Metric label="최고 추정 1RM" value={pr ? Math.round(pr.value) : '—'} unit="kg"/></View>{pr && <Label muted size={12}>{pr.name} · 12회 이하 세트 기준 추정치</Label>}<Glass><Section title="최근 6주 운동 볼륨"/><View style={[s.row, { height: 120, alignItems: 'flex-end' }]}>{Array.from({ length: 6 }, (_, i) => { const a = weekStart(); a.setDate(a.getDate() - (5 - i) * 7); const b = new Date(a); b.setDate(b.getDate() + 7); const v = history.filter(h => new Date(h.startedAt) >= a && new Date(h.startedAt) < b).reduce((n, h) => n + volume(h), 0); const max = Math.max(1, ...Array.from({ length: 6 }, (_, j) => { const x = weekStart(); x.setDate(x.getDate() - (5 - j) * 7); const y = new Date(x); y.setDate(y.getDate() + 7); return history.filter(h => new Date(h.startedAt) >= x && new Date(h.startedAt) < y).reduce((n, h) => n + volume(h), 0); })); return <View key={i} style={[s.flex, { alignItems: 'center', gap: 6 }]}><Label size={9} muted>{Math.round(v / 100) / 10}t</Label><View style={{ width: '75%', height: Math.max(3, v / max * 80), backgroundColor: i === 5 ? '#88a76e' : colors.soft, borderRadius: 6 }}/><Label size={9} muted>{a.getMonth() + 1}/{a.getDate()}</Label></View>; })}</View></Glass><Section title="운동 히스토리" right={`${history.length}개 기록`}/>{history.length ? history.map(h => <Pressable key={h.id} onPress={() => setModal({ type: 'history', item: h })}><Glass><Label bold>{h.name}</Label><Label muted size={12}>{dateText(h.startedAt)} · {Math.max(1, Math.round((Date.parse(h.endedAt!) - Date.parse(h.startedAt)) / 60000))}분 · {volume(h).toLocaleString()} kg {h.external ? '· 워치' : ''}</Label></Glass></Pressable>) : <Empty text="첫 운동을 마치면 여기에 변화가 쌓입니다."/>}</>; }
    function body() { const entries = [...state.body].sort((a, b) => b.date.localeCompare(a.date)), last = entries[0], previous = entries[1]; return <><Button title="+ 인바디 기록 등록" onPress={() => setModal({ type: 'body' })}/>{last ? <><View style={s.row}><Metric label="체중" value={last.weight} unit="kg"/><Metric label="골격근량" value={last.muscle ?? '—'} unit="kg"/><Metric label="체지방률" value={last.bodyFat ?? '—'} unit="%"/></View>{previous && <Label muted size={12}>이전 측정 대비 체중 {(last.weight - previous.weight) > 0 ? '+' : ''}{(last.weight - previous.weight).toFixed(1)} kg</Label>}<Glass><Section title="체성분 변화" right="최근 8회"/><View style={[s.row, { height: 115, alignItems: 'flex-end' }]}>{entries.slice(0, 8).reverse().map(e => <View key={e.id} style={[s.flex, { alignItems: 'center', gap: 5 }]}><Label size={9}>{e.weight}</Label><View style={{ height: e.weight / Math.max(...entries.slice(0, 8).map(x => x.weight)) * 70, width: '70%', backgroundColor: '#8fa879', borderRadius: 5 }}/><Label size={8} muted>{new Date(e.date).getMonth() + 1}/{new Date(e.date).getDate()}</Label></View>)}</View></Glass></> : <Empty text="인바디 수치를 직접 입력하고 결과지 사진도 함께 보관하세요."/>}{entries.map(e => <Pressable key={e.id} onPress={() => setModal({ type: 'body', item: e })}><Glass><View style={s.spread}><Label bold>{dateText(e.date)}</Label><Label muted size={11}>편집 ↗</Label></View><Label>{e.weight} kg · 골격근 {e.muscle ?? '—'} kg · 체지방 {e.bodyFat ?? '—'}%</Label>{e.height && <Label size={12} muted>BMI {bmi(e.weight, e.height)?.toFixed(1)}</Label>}{e.photo && <Image source={{ uri: e.photo }} style={{ height: 150, borderRadius: 12 }} resizeMode="cover"/>}</Glass></Pressable>)}</>; }
    /** 사용자 선택 없이 권한 팝업이나 건강 읽기를 시작하지 않습니다. */
    function settings() { return <><Button secondary title="인바디·체성분 기록" onPress={()=>setPage('body')}/><Glass><Section title="화면 스타일"/><View style={s.row}>{[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([key, label]) => <Chip key={key} title={label} active={state.settings.theme === key} onPress={() => change(x => ({ ...x, settings: { ...x.settings, theme: key as any } }))}/>)}</View><View style={s.spread}><Label>Liquid Glass</Label><Switch accessibilityLabel="Liquid Glass 효과" value={state.settings.glass} onValueChange={glass => change(x => ({ ...x, settings: { ...x.settings, glass } }))}/></View><View style={s.spread}><Label>투명도 줄이기</Label><Switch value={state.settings.contrast} onValueChange={contrast => change(x => ({ ...x, settings: { ...x.settings, contrast } }))}/></View><Label muted size={12}>네이티브 Liquid Glass 지원 기기에서는 실제 유리 효과를 사용합니다. Android·이전 iOS는 반투명 패널을 사용합니다.</Label></Glass><Glass><Section title="운동 설정"/><View style={s.spread}><Label>무게 표시</Label><View style={s.row}>{['kg', 'lb'].map(u => <Chip key={u} title={u} active={unit === u} onPress={() => change(x => ({ ...x, settings: { ...x.settings, units: u as any } }))}/>)}</View></View><View style={s.spread}><Label>주간 목표</Label><Stepper value={state.settings.goal} min={1} max={7} onChange={goal => change(x => ({ ...x, settings: { ...x.settings, goal } }))}/></View><View style={s.spread}><Label>휴식 시간 (초)</Label><Stepper value={state.settings.rest} min={15} max={600} step={15} onChange={rest => change(x => ({ ...x, settings: { ...x.settings, rest } }))}/></View><Button secondary title="휴식 알림 권한 설정" onPress={() => run(async () => { const p = await Notifications.requestPermissionsAsync(); Alert.alert(p.granted ? '알림이 허용되었습니다' : '알림이 허용되지 않았습니다'); })}/></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple 건강 · 피트니스' : 'Health Connect · Samsung Health'}/><Label muted size={12}>읽기: 걸음·심박·체중·체지방·최근 30일 운동. 쓰기: 선택한 운동·체중·체지방. 기기 및 앱이 공유하는 데이터만 표시됩니다.</Label><Button disabled={busy} title="권한 요청 및 데이터 읽기" onPress={() => run(async () => { setHealth(await connectHealth()); await change(x => ({ ...x, settings: { ...x.settings, health: true } })); })}/>{health && <><Label>오늘 걸음 {health.steps ?? '데이터 없음'} · 최근 심박 {health.heartRate ?? '—'} bpm</Label><Label>체중 {health.weight ?? '—'} kg · 체지방 {health.bodyFat ?? '—'}%</Label><Label muted size={11}>권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다.</Label>{health.workouts?.slice(0, 5).map((h: any) => <Label key={h.id} muted size={11}>{dateText(h.start)} · {h.name}</Label>)}<Button secondary title="새로고침" onPress={() => run(async () => setHealth(await readHealth()))}/></>}<Label muted size={11}>피트니스 링은 Apple이 실제 측정 데이터와 정책에 따라 반영합니다. 골격근량은 건강 앱 제지방량으로 내보내지 않습니다.</Label></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple Watch' : 'Galaxy Watch · Wear OS'}/><Label muted size={12}>동일한 앱을 워치에도 설치해야 합니다. Galaxy Watch4 이후 Wear OS 기기가 대상이며 Tizen 기기는 지원하지 않습니다.</Label><Button secondary title="워치 연결 확인" onPress={() => run(async () => setWatch(await Device.watchStatus()))}/>{watch && <Label>{watch.connected ? '워치와 연결되어 있습니다.' : watch.paired ? '페어링됨 · 현재 연결 대기' : '연결된 워치 앱이 없습니다.'}</Label>}<Label muted size={11}>휴대폰 운동의 다음 세트 확인·완료 전송, 워치 단독 운동 기록을 지원하는 코드가 포함되어 있습니다. 실기기 검증이 필요합니다.</Label></Glass><Glass><Section title="내 데이터"/><Button secondary title="백업 파일 내보내기" onPress={() => Alert.alert('백업 파일', '백업은 암호화되지 않은 건강 기록을 포함합니다. 결과지 사진은 제외됩니다. 안전한 위치에 저장하세요.', [{ text: '취소' }, { text: '내보내기', onPress: () => run(async () => { const path = FS.cacheDirectory + 'form-backup.json'; await FS.writeAsStringAsync(path, JSON.stringify({ ...state, active: null, body: state.body.map(x => ({ ...x, photo: null })) }, null, 2)); await Sharing.shareAsync(path, { mimeType: 'application/json' }); }) }])}/><Button secondary title="백업 가져오기" onPress={() => run(async () => { const file = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true }); if (file.canceled)
        return; const parsed = validateBackup(JSON.parse(await FS.readAsStringAsync(file.assets[0].uri))); Alert.alert('백업 병합', '동일한 ID는 현재 기록을 유지하고, 새로운 기록만 가져옵니다.', [{ text: '취소' }, { text: '병합', onPress: () => change(x => ({ ...x, history: [...x.history, ...parsed.history.filter((h: Session) => !x.history.some(a => a.id === h.id))], body: [...x.body, ...parsed.body.filter((h: BodyEntry) => !x.body.some(a => a.id === h.id)).map((h: BodyEntry) => ({ ...h, photo: null }))], customExercises: [...(x.customExercises ?? []), ...(parsed.customExercises ?? []).filter((e: Exercise) => !(x.customExercises ?? []).some(a => a.id === e.id))], routines: [...x.routines, ...parsed.routines.filter((r: any) => !x.routines.some(a => a.id === r.id))] })) }]); })}/><Button secondary danger title="이 기기의 앱 기록 삭제" onPress={() => Alert.alert('앱 기록 삭제', '이 기기의 운동·체성분 기록을 삭제합니다. 건강 앱에 내보낸 기록은 해당 앱에서 별도로 삭제해야 합니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(() => freshState()); if (notification.current)
                await Notifications.cancelScheduledNotificationAsync(notification.current); const folder = FS.documentDirectory + 'inbody/'; await FS.deleteAsync(folder, { idempotent: true }); }) }])}/><Label muted size={11}>건강 데이터는 암호화된 로컬 DB에 저장됩니다. 사진은 앱 전용 폴더에 저장되며 별도 파일 암호화는 적용하지 않았습니다. 로그인·서버·광고 SDK는 없습니다.</Label></Glass></>; }
    return <SafeAreaView style={[s.screen, { backgroundColor: colors.bg }]}><StatusBar barStyle={dark ? 'light-content' : 'dark-content'}/><View style={s.header}><Label size={30} bold style={{ letterSpacing: -2 }}>form<Label style={{ color: '#91919B' }}>.</Label></Label><Label size={10} muted>BUILD YOUR EVERYDAY</Label></View><ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled"><View style={{ marginBottom: 5 }}><Label size={25} bold>{title}</Label><Label muted size={12}>{new Date().toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })} · 당신만의 속도로</Label></View>{page === 'home' ? home() : page === 'workout' ? workout() : page === 'library' ? library() : page === 'progress' ? progress() : page === 'body' ? body() : settings()}<Label size={9} muted style={{ textAlign: 'center', letterSpacing: 2, marginVertical: 16 }}>MOVE WITH INTENTION.</Label></ScrollView><Surface role="navigation" style={[s.nav,{padding:6}]}>{tabs.map(([key, icon, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: (page === key || (page === 'library' && key === 'workout') || (page === 'body' && key === 'settings')) }} accessibilityLabel={label} onPress={() => setPage(key)} style={[s.navItem, { backgroundColor: (page === key || (page === 'library' && key === 'workout') || (page === 'body' && key === 'settings')) ? colors.soft : 'transparent' }]}><Label size={19}>{icon}</Label><Label size={9} bold={(page === key || (page === 'library' && key === 'workout') || (page === 'body' && key === 'settings'))}>{label}</Label></Pressable>)}</Surface><Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}><View style={[s.modal, { backgroundColor: colors.solid }]}><View style={s.spread}><Label bold size={19}>{({ start: '어떤 운동을 할까요?', routine: '나의 루틴', exercise: '운동 자세 가이드', body: '인바디 기록', history: '운동 상세', add: '운동 추가', 'custom-exercise': '사용자 운동 등록' } as any)[modal?.type ?? '']}</Label><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setModal(null)} style={s.close}><Label size={24}>×</Label></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 17, paddingBottom: 22 }}>{modal?.type === 'custom-exercise' && <CustomExerciseForm onSave={entry => run(async () => {
    await change(x => ({...x, customExercises: [...(x.customExercises ?? []), entry]}));
    setModal(null);
})}/>} {modal?.type === 'start' && state.routines.map(r => <Button key={r.id} secondary title={r.name} onPress={() => run(async () => { await start(r.name, r.ids); setModal(null); })}/>)}{modal?.type === 'exercise' && modal.item && <><Label size={24} bold>{modal.item.name}</Label><Label muted>{modal.item.muscle} · {modal.item.equipment} · {modal.item.level}</Label>{modal.item.steps.map((step: string, i: number) => <View key={i} style={s.row}><Label bold>{String(i + 1).padStart(2, '0')}</Label><Label style={s.flex}>{step}</Label></View>)}<Glass><Label bold>자세 체크</Label><Label>{modal.item.caution}</Label><Label muted size={12}>통증이 나면 중단하고 전문가에게 자세를 확인하세요.</Label></Glass><Button title="이 운동 기록하기" onPress={() => run(async () => { if (!state.active)
        await start(modal.item.name, [modal.item.id]);
    else
        await addExercise(modal.item); setModal(null); setPage('workout'); })}/></>}{modal?.type === 'add' && <ExercisePicker items={exercises} onPick={e => run(async () => { await addExercise(e); setModal(null); })}/>} {modal?.type === 'routine' && <RoutineForm items={exercises} item={modal.item} onSave={r => run(async () => { await change(x => ({ ...x, routines: [r, ...x.routines.filter(v => v.id !== r.id)] })); setModal(null); })}/>} {modal?.type === 'body' && <BodyForm item={modal.item} onSave={entry => run(async () => { await change(x => ({ ...x, body: [{...entry, revision: nextBodyRevision(x.body.find(v => v.id === entry.id))}, ...x.body.filter(v => v.id !== entry.id)] })); setModal(null); })} onExport={entry => run(async () => { await exportBody(entry); Alert.alert('건강 데이터로 저장했습니다'); })}/>} {modal?.type === 'history' && <><Label size={22} bold>{modal.item.name}</Label><Label muted>{dateText(modal.item.startedAt)}</Label>{modal.item.exercises.map((e: any) => <View key={e.id}><Label bold>{e.name}</Label>{e.sets.filter((x: any) => x.done).map((x: any, i: number) => <Label key={x.id} muted>{i + 1}세트 · {e.type === 'strength' ? `${x.weight} kg × ${x.reps}회` : `${x.seconds}초`} {x.kind === 'warmup' ? '워밍업' : ''}</Label>)}{e.note && <Label>{e.note}</Label>}</View>)}{(!modal.item.external || modal.item.sync === 'watch') && <Button title="건강 앱에 운동 내보내기" onPress={() => run(async () => { await exportWorkout(modal.item); Alert.alert('운동을 내보냈습니다'); })}/>}<Button secondary title="같은 구성으로 다시 운동" onPress={() => run(async () => { await start(modal.item.name, modal.item.exercises.map((x: any) => x.id)); setModal(null); })}/><Button secondary danger title="이 기록 삭제" onPress={() => Alert.alert('기록 삭제', '건강 앱으로 내보낸 기록은 별도로 남아 있습니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, history: x.history.filter(h => h.id !== modal.item.id) })); setModal(null); }) }])}/></>}</ScrollView></View></KeyboardAvoidingView></Modal></SafeAreaView>;
    async function addExercise(e: Exercise) { if (stateRef.current.active?.exercises.some(x => x.id === e.id))
        throw Error('이미 추가된 운동입니다.'); await patchActive(x => ({ ...x, exercises: [...x.exercises, (makeSession('', [e], stateRef.current.history) as Session).exercises[0]] })); }
}
// 작은 UI 단위는 동일한 터치 크기·색상·입력 동작을 재사용합니다.
function Section({ title, right }: {
    title: string;
    right?: string;
}) { return <View style={s.spread}><Label bold size={17}>{title}</Label>{right && <Label size={10} muted>{right}</Label>}</View>; }
function Metric({ label, value, unit }: {
    label: string;
    value: string | number;
    unit: string;
}) { return <Glass style={{ flex: 1, padding: 14, gap: 7 }}><Label size={10} muted>{label}</Label><Label size={23} bold>{value}<Label size={10} muted> {unit}</Label></Label></Glass>; }
function Empty({ text }: {
    text: string;
}) { return <Glass style={{ paddingVertical: 35 }}><Label muted style={{ textAlign: 'center' }}>{text}</Label></Glass>; }
function Chip({ title, active, onPress }: {
    title: string;
    active: boolean;
    onPress: () => void;
}) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, { backgroundColor: active ? colors.lime : colors.soft }]}><Label size={12} style={{ color: active ? '#274229' : colors.ink }}>{title}</Label></Pressable>; }
function Input({ value, onChangeText, placeholder, numeric = false }: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder: string;
    numeric?: boolean;
}) { const { colors } = useTheme(); return <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric ? 'decimal-pad' : 'default'} style={[s.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.glass }]}/>; }
function Numeric({ value, label, onChange }: {
    value: number;
    label: string;
    onChange: (n: number) => void;
}) { const { colors } = useTheme(); const [text, setText] = useState(String(value)); useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]); return <TextInput accessibilityLabel={label} value={text} selectTextOnFocus keyboardType="decimal-pad" onChangeText={setText} onEndEditing={() => { const n = Number(text.replace(',', '.')); if (Number.isFinite(n) && n >= 0)
    onChange(n);
else
    setText(String(value)); }} style={[s.input, s.flex, { color: colors.ink, borderColor: colors.line, textAlign: 'center' }]}/>; }
function Stepper({ value, min, max, step = 1, onChange }: {
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (n: number) => void;
}) { return <View style={s.row}><Button secondary title="−" disabled={value <= min} onPress={() => onChange(Math.max(min, value - step))}/><Label>{value}</Label><Button secondary title="+" disabled={value >= max} onPress={() => onChange(Math.min(max, value + step))}/></View>; }
function ExercisePicker({ onPick, items }: {
    items: Exercise[];
    onPick: (e: Exercise) => void;
}) { const [q, setQ] = useState(''); return <><Input value={q} onChangeText={setQ} placeholder="추가할 운동 검색"/>{items.filter(e => `${e.name} ${e.muscle} ${e.equipment}`.includes(q)).map(e => <Button secondary key={e.id} title={`${e.name} · ${e.equipment}`} onPress={() => onPick(e)}/>)}</>; }
function RoutineForm({ item, onSave, items }: {
    items: Exercise[];
    item?: any;
    onSave: (r: any) => void;
}) { const [name, setName] = useState(item?.name || ''), [ids, setIds] = useState<string[]>(item?.ids || []), [q, setQ] = useState(''); return <><Input value={name} onChangeText={setName} placeholder="루틴 이름"/><Input value={q} onChangeText={setQ} placeholder="운동 검색"/><Label muted>{ids.length}개 선택 · 선택한 순서로 진행</Label>{items.filter(e => e.name.includes(q)).map(e => <Chip key={e.id} title={`${ids.includes(e.id) ? '✓ ' : ''}${e.name}`} active={ids.includes(e.id)} onPress={() => setIds(x => x.includes(e.id) ? x.filter(v => v !== e.id) : [...x, e.id])}/>)}<Button title="루틴 저장" disabled={!name.trim() || !ids.length} onPress={() => onSave({ id: item?.id || uid(), name: name.trim(), subtitle: '나만의 트레이닝', ids })}/></>; }

/** Custom movements extend the catalog without pretending the bundled library contains every exercise. */
function CustomExerciseForm({onSave}: {onSave: (exercise: Exercise) => void}) {
    const [name,setName] = useState(''), [muscle,setMuscle] = useState('전신');
    const [equipment,setEquipment] = useState('맨몸'), [type,setType] = useState('strength');
    const [steps,setSteps] = useState(''), [caution,setCaution] = useState('');
    return <>
        <Input value={name} onChangeText={setName} placeholder="운동 이름"/>
        <Input value={muscle} onChangeText={setMuscle} placeholder="주요 운동 부위"/>
        <Input value={equipment} onChangeText={setEquipment} placeholder="사용 장비"/>
        <View style={{gap:8}}>{[['strength','중량·횟수'],['cardio','시간·거리'],['isometric','시간']].map(([key,label]) =>
            <Chip key={key} title={label} active={type===key} onPress={()=>setType(key)}/>)}</View>
        <Input value={steps} onChangeText={setSteps} placeholder="운동 방법 (단계는 | 로 구분)"/>
        <Input value={caution} onChangeText={setCaution} placeholder="주의사항"/>
        <Label muted size={12}>직접 등록한 운동입니다. 통증이 있으면 중단하고 전문가에게 자세를 확인하세요.</Label>
        <Button title="사용자 운동 저장" disabled={!name.trim() || !steps.trim()} onPress={()=>{
            try { onSave(validateCustomExercise({name,muscle,equipment,type,steps:steps.split('|'),caution}) as Exercise); }
            catch(error) { Alert.alert('입력 확인',errorText(error)); }
        }}/>
    </>;
}

/** 인바디는 수동 등록 및 결과지 첨부. OCR이나 제조사 계정 연동으로 오인하지 않게 합니다. */
function BodyForm({ item, onSave, onExport }: {
    item?: BodyEntry;
    onSave: (e: BodyEntry) => void;
    onExport: (e: BodyEntry) => void;
}) { const [form, setForm] = useState<any>({ ...item, date: localDateInput(item?.date ?? new Date()), weight: item?.weight?.toString() || '', photo: item?.photo || null }); function field(key: string, label: string) { return <View key={key} style={{ gap: 6 }}><Label size={12} muted>{label}</Label><Input placeholder={label} numeric={key !== 'date' && key !== 'note'} value={String(form[key] ?? '')} onChangeText={value => setForm((x: any) => ({ ...x, [key]: value }))}/></View>; } return <>{[['date', '측정일 (YYYY-MM-DD)'], ['weight', '체중 (kg) · 필수'], ['muscle', '골격근량 (kg)'], ['bodyFat', '체지방률 (%)'], ['height', '키 (cm)'], ['waist', '허리둘레 (cm)'], ['visceralFat', '내장지방 레벨'], ['bmr', '기초대사량 (kcal)'], ['note', '메모']].map(([key, label]) => field(key, label))}<Button secondary title="결과지 사진 첨부" onPress={async () => { try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .85 });
    if (!result.canceled) {
        const directory = FS.documentDirectory + 'inbody/';
        await FS.makeDirectoryAsync(directory, { intermediates: true });
        const photo = directory + uid() + '.jpg';
        await FS.copyAsync({ from: result.assets[0].uri, to: photo });
        setForm((x: any) => ({ ...x, photo }));
    }
}
catch (e) {
    Alert.alert('사진을 추가하지 못했습니다', errorText(e));
} }}/>{form.photo && <Image source={{ uri: form.photo }} style={{ height: 230, borderRadius: 15 }} resizeMode="contain"/>}<Label muted size={11}>수치를 직접 입력하세요. 결과지 자동 인식·인바디 계정 자동 연동은 아직 제공하지 않습니다.</Label><Button title="기록 저장" onPress={() => { try {
    onSave(validateBody({ ...form, date: measurementDate(form.date) }) as BodyEntry);
}
catch (e) {
    Alert.alert('입력 확인', errorText(e));
} }}/>{item && <Button secondary title="저장된 체중·체지방을 건강 앱에 내보내기" onPress={() => onExport(item)}/>}</>; }
const s = StyleSheet.create({ screen: { flex: 1 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 30, backgroundColor: '#F4F4F5' }, header: { paddingHorizontal: 24, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, content: { padding: 20, paddingTop: 9, gap: 17, paddingBottom: 25, maxWidth: 900, width: '100%', alignSelf: 'center' }, row: { flexDirection: 'row', gap: 10, alignItems: 'center' }, spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, flex: { flex: 1 }, hero: { borderRadius: 27, padding: 25 }, track: { height: 7, borderRadius: 8, overflow: 'hidden' }, day: { gap: 8, alignItems: 'center' }, dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }, play: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, nav: { marginHorizontal: 12, marginBottom: 6, borderWidth: 1, borderRadius: 24, padding: 6, flexDirection: 'row', justifyContent: 'space-around' }, navItem: { alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52, flex: 1, borderRadius: 18 }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, padding: 12, fontSize: 15 }, check: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, rest: { padding: 11, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, minHeight: 44, justifyContent: 'center' }, modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' }, modal: { maxHeight: '92%', padding: 24, paddingBottom: 18, borderTopLeftRadius: 30, borderTopRightRadius: 30, gap: 20 }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
