/** FORM 네이티브 앱 진입점. UI는 React Native 뷰이며 WebView를 사용하지 않습니다. */
import {MotionGuide} from './MotionGuide';
import {WeeklyVolume} from './WeeklyVolume';
import {motions} from './motion-guide.mjs';
import {filterExercises, groupChips, muscleChips, searchExercise} from './muscle-filter.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as FS from 'expo-file-system/legacy';
import { ThemeProvider, useTheme, Glass, Label, Button } from './theme';
import { freshState, loadState, persist } from './storage';
import { uid, makeSession, validateSession, volume, estimated1RM, validateBody, weekStart, calendarWeekVolume, bmi, applyWatchCommand, validateBackup } from './core.mjs';
import { connectHealth, readHealth, exportBody, exportWorkout } from './health';
import Device from '../modules/form-device';
import catalog from './exercises.json';
import {closeWorkout, toggleWorkoutPause, workoutElapsedSeconds, prepareWorkout, beginPreparedWorkout, measurementDate, localDateInput, nextBodyRevision, validateCustomExercise} from './core.mjs';
import {FormTheme} from './ui-v2/Theme';
import {FocusedWorkout} from './ui-v2/FocusedWorkout';
import {Surface} from './ui-v2/Primitives';
import type { State, Exercise, Session, BodyEntry } from './types';
const catalogExercises = catalog.exercises as Exercise[];
const tabs = [['home', '◉', '오늘'], ['workout', '▥', '루틴'], ['library', '◇', '운동도감'], ['progress', '↗', '기록'], ['settings', '◎', '내 정보']];
const pageDescriptions: Record<string,string> = {
    workout: '저장한 루틴으로 운동을 시작하고 세트를 기록하세요.',
    library: '운동을 찾고 자세를 익히세요.',
    progress: '운동 기록과 체성분 변화를 확인하세요.',
    body: '측정값과 결과지를 한곳에 모으세요.',
    settings: '화면, 운동 기본값과 연결 기기를 관리하세요.',
};
const matchesExercise = (exercise: Exercise, query: string) => searchExercise(exercise, query);
const hasMotion = (id: string) => Object.prototype.hasOwnProperty.call(motions,id);
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
    const {bottom:bottomInset} = useSafeAreaInsets();
    const [tabBoxHeight,setTabBoxHeight] = useState(66);
    const tabBottom = bottomInset + 6;
    const contentEnd = tabBoxHeight + tabBottom;
    const [selectedWorkoutDay,setSelectedWorkoutDay] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const [page, setPage] = useState('home'), [modal, setModal] = useState<{
        type: string;
        item?: any;
        fromPicker?: boolean;
    } | null>(null), [query, setQuery] = useState(''), [muscle, setMuscle] = useState('전체'), [equipment, setEquipment] = useState('전체'), [targets, setTargets] = useState<string[]>([]), [includeSecondary, setIncludeSecondary] = useState(true), [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [health, setHealth] = useState<any>(null), [watch, setWatch] = useState<any>(null);
    const stateRef = useRef(state);
    stateRef.current = state;
    const queue = useRef(Promise.resolve());
    const notification = useRef<string | null>('form-rest');
    const restNotifications = useRef(Promise.resolve());
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
        if (!state.active || state.active.preparing || state.active.pausedAt !== undefined) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, [state.active?.id, state.active?.preparing, state.active?.pausedAt]);
    useEffect(() => { const end = state.active?.restEndsAt; if (end && now >= end) {
        change(x => ({ ...x, active: x.active?.restEndsAt === end && x.active.pausedAt === undefined ? { ...x.active, restEndsAt: null } : x.active }));
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
    useEffect(() => { const active = state.active?.preparing ? null : state.active; const target = active?.pausedAt === undefined ? active?.exercises.flatMap(e => e.sets.filter(x => !x.done).map(set => ({ exerciseId: e.id, exerciseName: e.name, setId: set.id, weight: set.weight, reps: set.reps, seconds: set.seconds, type: e.type }))).at(0) : undefined; Device.sendWatch(JSON.stringify({ sessionId: active?.id ?? null, name: active?.name ?? '진행 중인 운동 없음', startedAt: active?.startedAt, next: target ?? null, restEndsAt: active?.restEndsAt ?? null })).catch(() => { }); }, [state.active]);
    async function start(name: string, ids: string[]) {
        // Check the queued state so two entry points cannot replace an existing session.
        await change(current => current.active ? current : ({...current,
            active:makeSession(name,ids.map(id => exercises.find(e => e.id===id)).filter(Boolean),current.history) as Session}));
        setPage('workout');
        if (!stateRef.current.active?.preparing) setFocused(true);
    }
    async function prepareBlankWorkout() {
        await change(current => current.active ? current : {...current,active:prepareWorkout() as Session});
        setFocused(false);
        setPage('workout');
    }
    async function startPreparedWorkout() {
        await patchActive(active=>beginPreparedWorkout(active));
        setNow(Date.now());
    }
    function patchActive(fn: (session: Session) => Session) { return change(x => ({ ...x, active: x.active ? fn(structuredClone(x.active)) : null })); }
    // Serialize reminder updates so a late set save cannot recreate a paused reminder.
    function refreshRestReminder() {
        const sync = restNotifications.current.catch(()=>{}).then(async () => {
            if (notification.current) await Notifications.cancelScheduledNotificationAsync(notification.current);
            notification.current = null;
            if (!(await Notifications.getPermissionsAsync()).granted) return;
            const deadline = stateRef.current.active?.restEndsAt;
            if (!deadline || deadline <= Date.now()) return;
            notification.current = await Notifications.scheduleNotificationAsync({
                identifier:'form-rest',
                content:{title:'다음 세트를 시작할 시간',body:'호흡을 정리하고 준비하세요.',sound:true},
                trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(deadline)},
            });
        });
        restNotifications.current = sync;
        sync.catch(()=>{}); // Timing and saved sets remain usable if OS reminders fail.
    }
    async function completeSet(exerciseId: string, setId: string, values?: {weight:number;reps:number}) {
        await patchActive(active => {
            if (active.preparing || active.pausedAt !== undefined) return active;
            const set = active.exercises.find(e=>e.id===exerciseId)?.sets.find(s=>s.id===setId);
            if (!set) return active;
            if (values) Object.assign(set,values);
            set.done = values ? true : !set.done;
            if (set.done) validateSession(active);
            active.restEndsAt = set.done ? Date.now() + stateRef.current.settings.rest * 1000 : null;
            return active;
        });
        refreshRestReminder();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(()=>{});
    }
    async function pauseOrResume() {
        await patchActive(active=>toggleWorkoutPause(active));
        setNow(Date.now());
        refreshRestReminder();
    }
    async function skipRest() {
        await patchActive(active=>({...active,restEndsAt:null}));
        refreshRestReminder();
    }
    async function finish(sessionId: string) {
        const result: {record?:Session} = {};
        await change(current => {
            if (current.active?.id !== sessionId) return current;
            const record = closeWorkout(current.active);
            result.record = record;
            return {...current, history:[record,...current.history], active:null};
        });
        if (!result.record) return;
        refreshRestReminder();
        setPage('progress');
        Alert.alert('오늘의 운동을 기록했습니다', result.record.exercises.reduce((n,e)=>n+e.sets.filter(set=>set.done).length,0) + '세트 · ' + volume(result.record).toLocaleString() + ' kg 볼륨');
    }
    function requestStop(session: Session) {
        if (session.preparing) {
            const discard = ()=>run(async()=> {
                await change(current=>current.active?.id === session.id && current.active.preparing
                    ? {...current,active:null} : current);
            });
            if (!session.exercises.length) { void discard(); return; }
            Alert.alert('운동 준비를 닫을까요?', '준비한 운동 목록을 비웁니다.', [
                {text:'돌아가기',style:'cancel'},
                {text:'준비 닫기',style:'destructive',onPress:discard},
            ]);
            return;
        }
        const hasCompletedSets = session.exercises.some(e=>e.sets.some(set=>set.done));
        if (hasCompletedSets) {
            Alert.alert('운동을 종료할까요?', '완료한 세트를 운동 기록에 저장합니다.', [
                {text:'돌아가기',style:'cancel'},
                {text:'저장하고 종료',onPress:()=>run(()=>finish(session.id))},
            ]);
            return;
        }
        Alert.alert('운동을 종료할까요?', '완료한 세트가 없어 기록은 저장되지 않습니다.', [
            {text:'돌아가기',style:'cancel'},
            {text:'기록 없이 종료',style:'destructive',onPress:()=>run(async()=>{
                await change(current=>current.active?.id===session.id &&
                    !current.active.exercises.some(e=>e.sets.some(set=>set.done)) ? {...current,active:null} : current);
                refreshRestReminder();
            })},
        ]);
    }
    const title = ({ home: '오늘도, 나의 페이스로.', workout: '루틴', library: '운동도감', progress: '운동 기록', body: '인바디·체성분', settings: '내 정보' } as any)[page];
    const unit = state.settings.units;
    const displayWeight = (v: number) => unit === 'lb' ? Math.round(v * 2.2046226218 * 10) / 10 : v;
    // 홈: 비어 있는 새 계정에 가짜 성과 대신 바로 시작할 수 있는 루틴을 제시합니다.
    function home() {
        const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
        const week = calendarWeekVolume(state.history);
        const today = week.days.find(day=>day.isToday)!;
        const selected = selectedWorkoutDay === null ? undefined : week.days.find(day=>day.key===selectedWorkoutDay) ?? today;
        const totals = selected ?? week;
        const weekGoal = Math.max(1,state.settings.goal);
        const progress = Math.min(100,Math.round(week.count / weekGoal * 100));
        const nextRoutine = state.routines[0];
        return <>
            <LinearGradient colors={dark ? ['#282D3F', '#1D2030'] : ['#262D46', '#383E57']} style={s.hero}>
                <Label size={12} bold style={{color:'#C9D5FF'}}>{state.active?.preparing ? '준비 중' : state.active ? '진행 중' : nextRoutine ? '추천 루틴' : '오늘의 운동'}</Label>
                <Label size={24} bold style={{color:'#FFFFFF'}}>{state.active?.name ?? nextRoutine?.name ?? '새 운동을 기록하세요'}</Label>
                <Label size={14} style={{color:'#E0E4F2'}}>{state.active
                    ? state.active.preparing ? '운동을 추가하거나 시작할 수 있습니다.' : '기록하던 세트부터 이어서 시작하세요.'
                    : nextRoutine ? `${nextRoutine.ids.length}개 운동 · 루틴을 변경할 수 있어요` : '운동을 골라 첫 세트를 기록하세요.'}</Label>
                <Button title={state.active?.preparing ? '준비한 운동 열기' : state.active ? '운동 이어하기' : '운동 시작하기'} onPress={() => state.active ? setPage('workout') : setModal({type:'start'})}/>
            </LinearGradient>
            <Glass>
                <Section title="이번 주 운동" right={`목표 ${week.count}/${weekGoal}회`}/>
                <View accessible accessibilityRole="progressbar" accessibilityLabel="주간 운동 목표"
                    accessibilityValue={{min:0,max:100,now:progress}} style={[s.track,{backgroundColor:colors.soft}]}>
                    <View style={{width:`${progress}%`,height:7,backgroundColor:colors.accent,borderRadius:8}}/>
                </View>
                <View accessibilityRole="tablist" style={[s.row,s.periodSwitch]}>
                    <Pressable accessibilityRole="tab" accessibilityState={{selected:!selected}}
                        onPress={()=>setSelectedWorkoutDay(null)}
                        style={[s.periodButton,{backgroundColor:selected?colors.soft:colors.accentBase}]}>
                        <Label bold size={13}>주간</Label>
                    </Pressable>
                    <Pressable accessibilityRole="tab" accessibilityState={{selected:!!selected}}
                        onPress={()=>setSelectedWorkoutDay((selected ?? today).key)}
                        style={[s.periodButton,{backgroundColor:selected?colors.accentBase:colors.soft}]}>
                        <Label bold size={13}>일간</Label>
                    </Pressable>
                </View>
                <View style={s.weekDays}>
                    {week.days.map((day,i) => {
                        const selectedDay = day.key === selected?.key;
                        const trained = day.count > 0;
                        return <Pressable key={day.key} accessibilityRole="button" accessibilityState={{selected:selectedDay}}
                            accessibilityLabel={`${weekdays[i]}요일 ${day.date.getDate()}일${day.isToday?', 오늘':''}, 운동 ${day.count}회`}
                            onPress={()=>setSelectedWorkoutDay(day.key)}
                            style={({pressed})=>[s.day,{opacity:pressed ? .72 : 1,backgroundColor:selectedDay?colors.accentBase:'transparent'}]}>
                            <Label muted={!selectedDay} size={11} bold={selectedDay}>{weekdays[i]}</Label>
                            <View style={[s.dayCircle,{backgroundColor:trained?colors.accent:colors.soft,
                                borderWidth:day.isToday?1:0,borderColor:colors.accent}]}>
                                <Label size={13} bold={day.isToday||trained}
                                    style={{color:trained?(dark?'#182241':'#FFFFFF'):colors.ink}}>{day.date.getDate()}</Label>
                            </View>
                        </Pressable>;
                    })}
                </View>
                <View style={[s.volumeSummary,{borderColor:colors.line}]}>
                    <Label muted size={13}>{selected?`${selected.date.getMonth()+1}월 ${selected.date.getDate()}일 · 운동 ${totals.count}회`:`이번 주 · 운동 ${totals.count}회`}</Label>
                    <Label size={22} bold style={s.figure}>
                        {displayWeight(totals.volume).toLocaleString('ko-KR',{maximumFractionDigits:1})} {unit}
                    </Label>
                    {selected && totals.count===0 && <Label muted size={12}>이날 저장한 운동이 없습니다.</Label>}
                </View>
            </Glass>
            <View style={s.spread}>
                <Section title="나의 루틴"/>
                <Pressable accessibilityRole="button" onPress={()=>setPage('workout')} style={s.inlineLink}>
                    <Label size={13} bold>모두 보기</Label>
                </Pressable>
            </View>
            {state.routines.slice(0,2).map(r=><RoutineCard key={r.id} routine={r}/>)}
            <Button secondary title="운동도감 열기" onPress={()=>setPage('library')}/>
        </>;
    }
    function RoutineCard({routine,onEdit}: {routine:State['routines'][number];onEdit?:()=>void}) {
        return <Glass>
            <View style={s.spread}>
                <View style={s.flex}><Label size={18} bold>{routine.name}</Label>
                    <Label muted size={13}>{routine.subtitle} · {routine.ids.length}개 운동</Label></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${routine.name} 시작`} onPress={()=>run(()=>start(routine.name,routine.ids))}
                    style={({pressed})=>[s.play,{backgroundColor:colors.accentBase,opacity:pressed?0.72:1}]}><Label bold style={{color:colors.accent}}>▶</Label></Pressable>
            </View>
            <Label muted size={13}>{routine.ids.map(id=>exercises.find(e=>e.id===id)?.name).filter(Boolean).join(' · ')}</Label>
            {onEdit && <Pressable accessibilityRole="button" style={[s.inlineLink,s.editRoutine]} onPress={onEdit}><Label size={13} bold>루틴 편집 ›</Label></Pressable>}
        </Glass>;
    }
    function workout() {
        const active = state.active;
        if (!active) return <>
            <Glass><Section title="자유 운동"/><Label muted>운동을 고른 뒤 원하는 때 타이머를 시작하세요.</Label>
                <Button title="빈 운동 시작" disabled={busy} onPress={()=>run(prepareBlankWorkout)}/>
            </Glass>
            <View style={s.spread}><Section title="내 루틴" right={`${state.routines.length}개`}/>
                <Pressable accessibilityRole="button" style={s.inlineLink} onPress={()=>setModal({type:'routine'})}><Label bold size={13}>+ 새 루틴</Label></Pressable>
            </View>
            {state.routines.map(r => <RoutineCard key={r.id} routine={r} onEdit={()=>setModal({type:'routine',item:r})}/>)}
            <Button secondary title="운동 종목 검색" onPress={()=>setPage('library')}/>
        </>;
        if (active.preparing) return <Glass>
            <Section title="자유 운동" right={`${active.exercises.length}개 운동`}/>
            <Label muted>{active.exercises.length ? '준비되면 상단에서 운동을 시작하세요.' : '운동을 먼저 추가하거나 지금 시작하고 나중에 추가할 수 있습니다.'}</Label>
            {active.exercises.map(e=><View key={e.id} style={s.spread}>
                <Label bold style={s.flex}>{e.name}</Label>
                <Pressable accessibilityRole="button" accessibilityLabel={e.name+' 빼기'} style={s.inlineLink}
                    onPress={()=>run(()=>patchActive(current=>current.preparing
                        ? {...current,exercises:current.exercises.filter(item=>item.id!==e.id)} : current))}>
                    <Label muted>빼기</Label>
                </Pressable>
            </View>)}
            <Button secondary={active.exercises.length>0} title="운동 추가" onPress={()=>setModal({type:'add'})}/>
        </Glass>;
        const target = active.exercises.find(e => e.sets.some(set => !set.done));
        if (focused && target?.type === 'strength') {
            const detail = exercises.find(e => e.id === target.id);
            const previous = state.history.flatMap(h => h.exercises).find(e => e.id === target.id)?.sets.find(s => s.done);
            return <View style={{flex:1}}><FocusedWorkout key={target.id} exercise={{...target,equipment:detail?.equipment ?? '',position:active.exercises.indexOf(target)+1,total:active.exercises.length,previous:previous ? displayWeight(previous.weight)+' '+unit+' × '+previous.reps : null}} units={unit} elapsedSeconds={workoutElapsedSeconds(active,now)} paused={active.pausedAt !== undefined} now={now} restDeadline={active.restEndsAt} guide={<Label>{detail?.steps[0] ?? '편안한 자세에서 시작하세요.'}</Label>} onComplete={async (id, values) => {
                await completeSet(target.id,id,values);
            }} onSkipRest={()=>run(skipRest)} onOpenList={()=>setFocused(false)} onOpenGuide={()=>setModal({type:'exercise',item:detail})} onNext={()=>setFocused(false)}/></View>;
        }
        if (active.pausedAt !== undefined) return <Glass><Section title={active.name}/><Label muted>계속하기를 누르면 세트 기록을 이어갈 수 있습니다.</Label></Glass>;
        return <>{target?.type==='strength' && <Button secondary title="한 운동에 집중하기" onPress={()=>setFocused(true)}/>}
            {!active.exercises.length && <Glass><Label bold>첫 운동을 추가하세요</Label><Label muted>타이머가 진행 중입니다.</Label></Glass>}<Glass><View style={s.spread}><Label bold size={19}>{active.name}</Label></View><Label muted>{active.exercises.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)}세트 완료 · {volume(active).toLocaleString()} kg</Label>{active.restEndsAt && <View style={[s.rest, { backgroundColor: colors.soft }]}><Label>휴식 {clock(Math.max(0, Math.ceil((active.restEndsAt - now) / 1000)))}</Label><Button secondary title="건너뛰기" onPress={() => run(skipRest)}/></View>}</Glass>{active.exercises.map(e => <Glass key={e.id}><View style={s.spread}><Pressable accessibilityRole="button" onPress={() => setModal({ type: 'exercise', item: exercises.find(x => x.id === e.id) })}><Label bold size={17}>{e.name} ⓘ</Label></Pressable><Pressable accessibilityLabel={`${e.name} 삭제`} onPress={() => Alert.alert('운동 삭제', `${e.name}의 진행 기록도 삭제됩니다.`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => patchActive(x => ({ ...x, exercises: x.exercises.filter(a => a.id !== e.id) })) }])}><Label muted>×</Label></Pressable></View><View style={s.setRow}><Label size={10} style={{ width: 27 }}>세트</Label><Label size={10} style={s.flex}>{e.type === 'strength' ? unit : '초'}</Label><Label size={10} style={s.flex}>{e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리 km' : 'RPE'}</Label><Label size={10} style={{ width: 48 }}>완료</Label></View>{e.sets.map((set, i) => <View key={set.id}><View style={s.setRow}><Label style={{ width: 27 }}>{i + 1}</Label><Numeric value={e.type === 'strength' ? displayWeight(set.weight) : set.seconds} label={e.type === 'strength' ? '중량' : '시간(초)'} onChange={value => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; if (e.type === 'strength')
            st.weight = unit === 'lb' ? value / 2.2046226218 : value;
        else
            st.seconds = value; return x; })}/><Numeric value={e.type === 'strength' ? set.reps : e.type === 'cardio' ? set.distance : Number(set.rpe || 0)} label={e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리 km' : 'RPE'} onChange={value => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; if (e.type === 'strength')
            st.reps = value;
        else if (e.type === 'cardio')
            st.distance = value;
        else
            st.rpe = String(value); return x; })}/><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.done }} accessibilityLabel={`${e.name} ${i + 1}세트 완료`} onPress={() => run(() => completeSet(e.id, set.id))} style={[s.check, { backgroundColor: set.done ? colors.lime : colors.soft }]}><Label style={{ color: set.done ? '#26422d' : colors.ink }}>{set.done ? '✓' : '○'}</Label></Pressable></View><View style={s.row}><Pressable accessibilityRole="button" style={s.inlineLink} onPress={() => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)!.sets[i]; st.kind = st.kind === 'normal' ? 'warmup' : st.kind === 'warmup' ? 'drop' : 'normal'; return x; })}><Label size={13} muted>{({ normal: '일반', warmup: '워밍업', drop: '드롭' } as any)[set.kind]} ↻</Label></Pressable><Pressable accessibilityRole="button" style={s.inlineLink} onPress={() => patchActive(x => { x.exercises.find(a => a.id === e.id)!.sets.splice(i, 1); return x; })}><Label size={13} muted>세트 삭제</Label></Pressable></View></View>)}<Button secondary title="+ 세트 추가" onPress={() => patchActive(x => { const ex = x.exercises.find(a => a.id === e.id)!; ex.sets.push({ ...ex.sets.at(-1) ?? { weight: 0, reps: 10, seconds: 30, distance: 0, rpe: '', kind: 'normal' }, id: uid(), done: false }); return x; })}/><TextInput placeholder="자세, 컨디션, 다음 운동을 위한 메모" placeholderTextColor={colors.muted} value={e.note} onChangeText={note => patchActive(x => { x.exercises.find(a => a.id === e.id)!.note = note; return x; })} style={[s.input, { color: colors.ink, borderColor: colors.line }]}/></Glass>)}<Button secondary title="+ 운동 추가" onPress={() => setModal({ type: 'add' })}/><Button title="운동 마치고 저장" disabled={busy} onPress={() => run(()=>finish(active.id))}/><Button secondary danger title="운동 취소" onPress={() => Alert.alert('진행 중인 운동을 취소할까요?', '완료하지 않은 운동 기록이 삭제됩니다.', [{ text: '계속 운동' }, { text: '취소하기', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, active: null })); if (notification.current)
                    await Notifications.cancelScheduledNotificationAsync(notification.current); }) }])}/></>;
    }
    function library() {
        // 큰 부위 이름은 근육 그룹으로, '둔근'·'종아리'·'전신' 같은 나머지 부위명은 운동도감 부위로 걸러냅니다.
        const group = groupChips().find(g => g.name === muscle);
        const detailNames = muscleChips().filter(m => targets.includes(m.id)).map(m => m.name);
        const filtered = filterExercises(exercises, {
            query,
            muscles: targets,
            groups: group ? [group.id] : [],
            parts: group || muscle === '전체' ? [] : [muscle],
            includeSecondary,
        }).filter(e => equipment === '전체' || e.equipment === equipment);
        const filters = (label: string, values: string[], selected: string, onSelect: (value: string) => void) =>
            <View style={s.group}>
                <Label size={13} bold>{label}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.row}>{values.map(value => <Chip key={value} title={value} active={selected === value} onPress={() => onSelect(value)}/>)}</View>
                </ScrollView>
            </View>;
        return <>
            <Input value={query} onChangeText={setQuery} placeholder="운동명, 부위, 근육, 장비 검색" search/>
            {filters('부위', ['전체', ...new Set([...groupChips().map(g => g.name), ...exercises.map(e => e.muscle)])], muscle,
                value => { setMuscle(value); setTargets([]); })}
            <View style={s.group}>
                <View style={s.spread}>
                    <Label size={13} bold>타깃 근육</Label>
                    <Pressable accessibilityRole="switch" accessibilityState={{checked: includeSecondary}}
                        accessibilityLabel={includeSecondary ? '보조근 포함' : '주동근만'}
                        onPress={() => setIncludeSecondary(value => !value)} style={s.inlineLink}>
                        <Label size={12} muted>보조근 포함 {includeSecondary ? '✓' : '✗'}</Label>
                    </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.row}>{muscleChips().map(m => <Chip key={m.id} title={m.name} active={targets.includes(m.id)}
                        onPress={() => { setMuscle('전체'); setTargets(value => value.includes(m.id) ? value.filter(id => id !== m.id) : [...value, m.id]); }}/>)}</View>
                </ScrollView>
            </View>
            {(group || detailNames.length > 0) && <Label muted size={12}>
                {group ? `${group.name} 전체` : detailNames.join(' · ')}{includeSecondary ? ' · 보조근 포함' : ' · 주동근만'}
            </Label>}
            {filters('장비',['전체',...new Set(exercises.map(e=>e.equipment))],equipment,setEquipment)}
            <View style={s.spread}>
                <View style={s.flex}><Section title="운동 목록" right={`${filtered.length}개`}/></View>
                <Pressable style={s.inlineLink} accessibilityRole="button" onPress={()=>setModal({type:'custom-exercise'})}>
                    <Label bold size={13}>+ 내 운동</Label>
                </Pressable>
            </View>
            <Glass style={s.listCard}>{filtered.map(e => <ExerciseRow key={e.id} exercise={e} onPress={() => setModal({type:'exercise',item:e})}/>)}
                {!filtered.length && <Label muted>검색어나 필터를 바꿔보세요.</Label>}
            </Glass>
        </>;
    }
    function progress() {
        const history = state.history;
        const pr = history.flatMap(h => h.exercises.flatMap(e => e.sets
            .filter(set => set.done && set.kind !== 'warmup')
            .map(set => ({name:e.name,value:estimated1RM(set.weight,set.reps) ?? 0}))))
            .sort((a,b) => b.value - a.value).find(record => record.value > 0);
        // Generate each week's total once and share the scale between bars.
        const weeks = Array.from({length:6},(_,i) => {
            const start = weekStart();
            start.setDate(start.getDate() - (5 - i) * 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 7);
            return {label:`${start.getMonth()+1}/${start.getDate()}`,
                value:history.filter(h => new Date(h.startedAt) >= start && new Date(h.startedAt) < end).reduce((sum,h) => sum + volume(h),0)};
        });
        return <>
            <View style={s.metrics}><Metric label="전체 운동" value={history.length} unit="회"/>
                <Metric label="최고 추정 1RM" value={pr ? Math.round(displayWeight(pr.value)) : '—'} unit={unit}/></View>
            {pr && <Label muted size={13}>{pr.name} · 12회 이하 세트 기준</Label>}
            <Glass><Section title="최근 6주 운동 볼륨" right={unit}/>
                <BarChart points={weeks.map(w=>({...w,value:displayWeight(w.value)}))} unit={unit}/>
            </Glass>
            <Glass><WeeklyVolume history={history} unit={unit}/></Glass>
            <Button secondary title="인바디·체성분 기록" onPress={()=>setPage('body')}/>
            <Section title="운동 히스토리" right={`${history.length}개`}/>
            {history.length ? history.map(h => <Pressable key={h.id} accessibilityRole="button" onPress={()=>setModal({type:'history',item:h})}>
                <Glass><View style={s.spread}><Label bold style={s.flex}>{h.name}</Label><Label muted>›</Label></View>
                    <Label muted size={13}>{dateText(h.startedAt)} · {Math.max(1,Math.round(workoutElapsedSeconds(h)/60))}분 · {displayWeight(volume(h)).toLocaleString()} {unit}{h.external?' · 워치':''}</Label>
                </Glass></Pressable>) : <Empty text="첫 운동을 마치면 여기에 기록이 쌓입니다."/>}
        </>;
    }
    function body() {
        const entries = [...state.body].sort((a,b) => b.date.localeCompare(a.date));
        const [last, previous] = entries;
        const delta = previous && last ? last.weight - previous.weight : null;
        return <>
            <Button title="+ 인바디 기록 등록" onPress={()=>setModal({type:'body'})}/>
            {last ? <>
                <Glass>
                    <Section title="최근 측정" right={dateText(last.date)}/>
                    <Label size={36} bold style={s.figure}>{last.weight}<Label muted size={15}> kg</Label></Label>
                    {delta !== null && <Label muted size={13}>이전 측정 대비 {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg</Label>}
                </Glass>
                <View style={s.metrics}>
                    <Metric label="골격근량" value={last.muscle ?? '—'} unit="kg"/>
                    <Metric label="체지방률" value={last.bodyFat ?? '—'} unit="%"/>
                </View>
                <Glass><Section title="체중 변화" right="최근 8회"/>
                    <BarChart points={entries.slice(0,8).reverse().map(e => {
                        const day = new Date(e.date);
                        return {label:`${day.getMonth()+1}/${day.getDate()}`,value:e.weight};
                    })} unit="kg"/>
                </Glass>
                <Section title="측정 기록" right={`${entries.length}개`}/>
            </> : <Empty text="인바디 수치를 직접 입력하고 결과지 사진도 함께 보관하세요."/>}
            {entries.map(e => <Pressable key={e.id} accessibilityRole="button" onPress={()=>setModal({type:'body',item:e})}>
                <Glass><View style={s.spread}><Label bold>{dateText(e.date)}</Label><Label muted size={13}>편집 ›</Label></View>
                    <Label>{e.weight} kg · 골격근 {e.muscle ?? '—'} kg · 체지방 {e.bodyFat ?? '—'}%</Label>
                    {e.height && <Label size={13} muted>BMI {bmi(e.weight,e.height)?.toFixed(1)}</Label>}
                    {e.photo && <Image accessibilityLabel="인바디 결과지" source={{uri:e.photo}} style={s.bodyPhoto} resizeMode="cover"/>}
                </Glass>
            </Pressable>)}
        </>;
    }
    /** 사용자 선택 없이 권한 팝업이나 건강 읽기를 시작하지 않습니다. */
    function settings() { return <><Glass><Section title="화면 스타일"/><View style={s.metrics}>{[['system', '시스템'], ['light', '라이트'], ['dark', '다크']].map(([key, label]) => <Chip key={key} title={label} active={state.settings.theme === key} onPress={() => change(x => ({ ...x, settings: { ...x.settings, theme: key as any } }))}/>)}</View><View style={s.spread}><Label>Liquid Glass</Label><Switch accessibilityLabel="Liquid Glass 효과" value={state.settings.glass} onValueChange={glass => change(x => ({ ...x, settings: { ...x.settings, glass } }))}/></View><View style={s.spread}><Label>투명도 줄이기</Label><Switch accessibilityLabel="투명도 줄이기" value={state.settings.contrast} onValueChange={contrast => change(x => ({ ...x, settings: { ...x.settings, contrast } }))}/></View><Label muted size={13}>탭과 조작 영역에 유리 효과를 적용합니다. 투명도 줄이기를 켜면 단색을 사용합니다.</Label></Glass><Glass><Section title="운동 설정"/><View style={s.spread}><Label>무게 표시</Label><View style={s.row}>{['kg', 'lb'].map(u => <Chip key={u} title={u} active={unit === u} onPress={() => change(x => ({ ...x, settings: { ...x.settings, units: u as any } }))}/>)}</View></View><View style={s.settingStepperRow}><Label style={s.flex}>주간 목표</Label><Stepper name="주간 목표" value={state.settings.goal} min={1} max={7} onChange={goal => change(x => ({ ...x, settings: { ...x.settings, goal } }))}/></View><View style={s.settingStepperRow}><Label style={s.flex}>휴식 시간 (초)</Label><Stepper name="휴식 시간" value={state.settings.rest} min={15} max={600} step={15} onChange={rest => change(x => ({ ...x, settings: { ...x.settings, rest } }))}/></View><Button secondary title="휴식 알림 권한 설정" onPress={() => run(async () => { const p = await Notifications.requestPermissionsAsync(); Alert.alert(p.granted ? '알림이 허용되었습니다' : '알림이 허용되지 않았습니다'); })}/></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple 건강 · 피트니스' : 'Health Connect · Samsung Health'}/><Label muted size={12}>읽기: 걸음·심박·체중·체지방·최근 30일 운동. 쓰기: 선택한 운동·체중·체지방. 기기 및 앱이 공유하는 데이터만 표시됩니다.</Label><Button disabled={busy} title={health ? "건강 데이터 다시 연결" : "건강 앱 연결"} onPress={() => run(async () => { setHealth(await connectHealth()); await change(x => ({ ...x, settings: { ...x.settings, health: true } })); })}/>{health && <><Label>오늘 걸음 {health.steps ?? '데이터 없음'} · 최근 심박 {health.heartRate ?? '—'} bpm</Label><Label>체중 {health.weight ?? '—'} kg · 체지방 {health.bodyFat ?? '—'}%</Label><Label muted size={11}>권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다.</Label>{health.workouts?.slice(0, 5).map((h: any) => <Label key={h.id} muted size={11}>{dateText(h.start)} · {h.name}</Label>)}<Button secondary title="새로고침" onPress={() => run(async () => setHealth(await readHealth()))}/></>}<Label muted size={11}>피트니스 링은 Apple이 실제 측정 데이터와 정책에 따라 반영합니다. 골격근량은 건강 앱 제지방량으로 내보내지 않습니다.</Label></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple Watch' : 'Galaxy Watch · Wear OS'}/><Label muted size={12}>동일한 앱을 워치에도 설치해야 합니다. Galaxy Watch4 이후 Wear OS 기기가 대상이며 Tizen 기기는 지원하지 않습니다.</Label><Button secondary title="워치 연결 확인" onPress={() => run(async () => setWatch(await Device.watchStatus()))}/>{watch && <Label>{watch.connected ? '워치와 연결되어 있습니다.' : watch.paired ? '페어링됨 · 현재 연결 대기' : '연결된 워치 앱이 없습니다.'}</Label>}<Label muted size={13}>워치에서 다음 세트를 확인하고 완료를 기록할 수 있습니다.</Label></Glass><Glass><Section title="내 데이터"/><Button secondary title="인바디·체성분 기록" onPress={()=>setPage('body')}/><Button secondary title="백업 파일 내보내기" onPress={() => Alert.alert('백업 파일', '백업은 암호화되지 않은 건강 기록을 포함합니다. 결과지 사진은 제외됩니다. 안전한 위치에 저장하세요.', [{ text: '취소' }, { text: '내보내기', onPress: () => run(async () => { const path = FS.cacheDirectory + 'form-backup.json'; await FS.writeAsStringAsync(path, JSON.stringify({ ...state, active: null, body: state.body.map(x => ({ ...x, photo: null })) }, null, 2)); await Sharing.shareAsync(path, { mimeType: 'application/json' }); }) }])}/><Button secondary title="백업 가져오기" onPress={() => run(async () => { const file = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true }); if (file.canceled)
        return; const parsed = validateBackup(JSON.parse(await FS.readAsStringAsync(file.assets[0].uri))); Alert.alert('백업 병합', '동일한 ID는 현재 기록을 유지하고, 새로운 기록만 가져옵니다.', [{ text: '취소' }, { text: '병합', onPress: () => change(x => ({ ...x, history: [...x.history, ...parsed.history.filter((h: Session) => !x.history.some(a => a.id === h.id))], body: [...x.body, ...parsed.body.filter((h: BodyEntry) => !x.body.some(a => a.id === h.id)).map((h: BodyEntry) => ({ ...h, photo: null }))], customExercises: [...(x.customExercises ?? []), ...(parsed.customExercises ?? []).filter((e: Exercise) => !(x.customExercises ?? []).some(a => a.id === e.id))], routines: [...x.routines, ...parsed.routines.filter((r: any) => !x.routines.some(a => a.id === r.id))] })) }]); })}/><Button secondary danger title="이 기기의 앱 기록 삭제" onPress={() => Alert.alert('앱 기록 삭제', '이 기기의 운동·체성분 기록을 삭제합니다. 건강 앱에 내보낸 기록은 해당 앱에서 별도로 삭제해야 합니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(() => freshState()); if (notification.current)
                await Notifications.cancelScheduledNotificationAsync(notification.current); const folder = FS.documentDirectory + 'inbody/'; await FS.deleteAsync(folder, { idempotent: true }); }) }])}/><Label muted size={11}>건강 데이터는 암호화된 로컬 DB에 저장됩니다. 사진은 앱 전용 폴더에 저장되며 별도 파일 암호화는 적용하지 않았습니다. 로그인·서버·광고 SDK는 없습니다.</Label></Glass></>; }
    // A focused workout owns its scroll region; its controls must remain above the tab bar.
    const showFocused = page === 'workout' && focused && !state.active?.preparing && state.active?.exercises.find(e => e.sets.some(set => !set.done))?.type === 'strength';
    return <SafeAreaView edges={['top','left','right']} style={[s.screen, { backgroundColor: colors.bg }]}><StatusBar barStyle={dark ? 'light-content' : 'dark-content'}/><View style={s.header}>{page === 'body' ? <Pressable accessibilityRole="button" accessibilityLabel="운동 기록으로 돌아가기" onPress={()=>setPage('progress')} style={s.inlineLink}><Label size={14} bold>‹ 운동 기록</Label></Pressable> : <Label size={24} bold style={{letterSpacing:-1}}>form<Label style={{color:colors.accent}}>.</Label></Label>}</View>{page === 'workout' && state.active && <View style={{paddingHorizontal:20,paddingBottom:8,gap:6}}>
            <View style={[s.row,{flexWrap:'wrap'}]}>
                {state.active.preparing
                    ? <Button title="운동 시작" disabled={busy} onPress={()=>run(startPreparedWorkout)}/>
                    : <Button secondary title={state.active.pausedAt === undefined ? '일시정지' : '계속하기'}
                        disabled={busy} onPress={()=>run(pauseOrResume)}/>}
                <Button secondary danger={!state.active.preparing} title={state.active.preparing ? '준비 닫기' : '운동 종료'}
                    disabled={busy} onPress={()=>state.active && requestStop(state.active)}/>
            </View>
            <Label bold>{state.active.preparing ? '준비 중 · 0:00'
                : (state.active.pausedAt === undefined ? '진행 중' : '일시정지됨')+' · '+clock(workoutElapsedSeconds(state.active,now))}</Label>
        </View>}{showFocused ? <KeyboardAvoidingView style={[s.flex,{paddingBottom:contentEnd}]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>{workout()}</KeyboardAvoidingView> : <ScrollView key={page} style={s.flex} contentContainerStyle={[s.content,{paddingBottom:contentEnd+20}]} scrollIndicatorInsets={{bottom:contentEnd}} keyboardShouldPersistTaps="handled"><View style={s.pageTitle}><Label heading size={30} bold>{title}</Label><Label muted size={14}>{page === 'home' ? new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'}) : pageDescriptions[page]}</Label></View>{page === 'home' ? home() : page === 'workout' ? workout() : page === 'library' ? library() : page === 'progress' ? progress() : page === 'body' ? body() : settings()}</ScrollView>}{/* Only the tab box floats over the screen. The surrounding space remains part of the content. */}
    <View pointerEvents="box-none" style={[s.navFrame,{bottom:tabBottom}]}><Surface role="navigation"
        accessibilityRole="tablist" pointerEvents="box-none" style={s.nav}
        onLayout={event=>setTabBoxHeight(event.nativeEvent.layout.height)}>{tabs.map(([key, icon, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: (page === key || (page === 'body' && key === 'progress')) }} accessibilityLabel={label} onPress={() => setPage(key)} pressRetentionOffset={tabPressBounds} style={[s.navItem, { backgroundColor: (page === key || (page === 'body' && key === 'progress')) ? colors.soft : 'transparent' }]}><Label size={19}>{icon}</Label><Label size={11} bold={(page === key || (page === 'body' && key === 'progress'))}>{label}</Label></Pressable>)}</Surface></View><Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}><SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[s.modal,{backgroundColor:colors.solid}]}><View style={[s.sheetGrip,{backgroundColor:colors.line}]}/><View style={s.spread}><Label heading bold size={20} style={s.flex}>{({ start: '어떤 운동을 할까요?', routine: '나의 루틴', exercise: '운동 자세 가이드', body: '인바디 기록', history: '운동 상세', add: '운동 추가', 'custom-exercise': '사용자 운동 등록' } as any)[modal?.type ?? '']}</Label><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setModal(null)} style={s.close}><Label size={24}>×</Label></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 17, paddingBottom: 22 }}>{modal?.type === 'custom-exercise' && <CustomExerciseForm onSave={entry => run(async () => {
    await change(x => ({...x, customExercises: [...(x.customExercises ?? []), entry]}));
    setModal(null);
})}/>} {modal?.type === 'start' && state.routines.map(r => <Button key={r.id} secondary title={r.name} onPress={() => run(async () => { await start(r.name, r.ids); setModal(null); })}/>)}{modal?.type === 'exercise' && modal.item && <><Label size={24} bold>{modal.item.name}</Label><Label muted>{modal.item.muscle} · {modal.item.equipment} · {modal.item.level}</Label><MotionGuide key={modal.item.id} exerciseId={modal.item.id}/><Section title="운동 방법"/>{modal.item.steps.map((step: string, i: number) => <View key={i} style={[s.exerciseRow,{borderColor:colors.line}]}><Label bold style={{color:colors.accent}}>{i+1}</Label><Label style={s.flex}>{step}</Label></View>)}<Glass><Label bold>자세 체크</Label><Label>{modal.item.caution}</Label><Label muted size={12}>통증이 나면 중단하고 전문가에게 자세를 확인하세요.</Label></Glass>{modal.fromPicker && <Button secondary title="운동 목록으로 돌아가기" onPress={()=>setModal({type:'add'})}/>}<Button title={modal.fromPicker ? '이 운동 추가' : '이 운동 기록하기'} onPress={() => run(async () => { if (!state.active)
        await start(modal.item.name, [modal.item.id]);
    else
        await addExercise(modal.item); setModal(null); setPage('workout'); })}/></>}{modal?.type === 'add' && <ExercisePicker items={exercises} onPick={e => setModal({type:'exercise', item:e, fromPicker:true})}/>} {modal?.type === 'routine' && <RoutineForm items={exercises} item={modal.item} onSave={r => run(async () => { await change(x => ({ ...x, routines: [r, ...x.routines.filter(v => v.id !== r.id)] })); setModal(null); })}/>} {modal?.type === 'body' && <BodyForm item={modal.item} onSave={entry => run(async () => { await change(x => ({ ...x, body: [{...entry, revision: nextBodyRevision(x.body.find(v => v.id === entry.id))}, ...x.body.filter(v => v.id !== entry.id)] })); setModal(null); })} onExport={entry => run(async () => { await exportBody(entry); Alert.alert('건강 데이터로 저장했습니다'); })}/>} {modal?.type === 'history' && <><Label size={22} bold>{modal.item.name}</Label><Label muted>{dateText(modal.item.startedAt)}</Label>{modal.item.exercises.map((e: any) => <View key={e.id}><Label bold>{e.name}</Label>{e.sets.filter((x: any) => x.done).map((x: any, i: number) => <Label key={x.id} muted>{i + 1}세트 · {e.type === 'strength' ? `${x.weight} kg × ${x.reps}회` : `${x.seconds}초`} {x.kind === 'warmup' ? '워밍업' : ''}</Label>)}{e.note && <Label>{e.note}</Label>}</View>)}{(!modal.item.external || modal.item.sync === 'watch') && <Button title="건강 앱에 운동 내보내기" onPress={() => run(async () => { await exportWorkout(modal.item); Alert.alert('운동을 내보냈습니다'); })}/>}<Button secondary title="같은 구성으로 다시 운동" onPress={() => run(async () => { await start(modal.item.name, modal.item.exercises.map((x: any) => x.id)); setModal(null); })}/><Button secondary danger title="이 기록 삭제" onPress={() => Alert.alert('기록 삭제', '건강 앱으로 내보낸 기록은 별도로 남아 있습니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, history: x.history.filter(h => h.id !== modal.item.id) })); setModal(null); }) }])}/></>}</ScrollView></SafeAreaView></KeyboardAvoidingView></Modal></SafeAreaView>;
    async function addExercise(e: Exercise) {
        await patchActive(active => {
            if (active.exercises.some(item=>item.id===e.id)) throw Error('이미 추가된 운동입니다.');
            const entry = makeSession('',[e],stateRef.current.history).exercises[0] as Session['exercises'][number];
            return {...active,exercises:[...active.exercises,entry]};
        });
    }
}
// 작은 UI 단위는 동일한 터치 크기·색상·입력 동작을 재사용합니다.
function Section({ title, right }: {
    title: string;
    right?: string;
}) { return <View style={s.spread}><Label heading bold size={18}>{title}</Label>{right && <Label size={13} muted>{right}</Label>}</View>; }
function Metric({ label, value, unit }: {
    label: string;
    value: string | number;
    unit: string;
}) { return <Glass style={{ flex: 1, padding: 14, gap: 7 }}><Label size={11} muted>{label}</Label><Label size={25} bold style={s.figure}>{value}{value !== '—' && <Label size={12} muted> {unit}</Label>}</Label></Glass>; }
function Empty({ text }: {
    text: string;
}) { return <Glass style={{ paddingVertical: 35 }}><Label muted style={{ textAlign: 'center' }}>{text}</Label></Glass>; }
function Chip({ title, active, onPress }: {
    title: string;
    active: boolean;
    onPress: () => void;
}) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, { backgroundColor: active ? colors.accentBase : colors.soft }]}><Label size={12} style={{ color: active ? colors.accent : colors.ink, fontWeight:active?'700':'500' }}>{title}</Label></Pressable>; }
function Input({ value, onChangeText, placeholder, numeric = false, search = false }: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder: string;
    numeric?: boolean;
    search?: boolean;
}) { const { colors } = useTheme(); return <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric ? 'decimal-pad' : 'default'} returnKeyType={search?'search':'done'} autoCorrect={!search && !numeric} style={[s.input,{color:colors.ink,borderColor:colors.line,backgroundColor:colors.solid}]}/>; }
function Numeric({ value, label, onChange }: {
    value: number;
    label: string;
    onChange: (n: number) => void;
}) { const { colors } = useTheme(); const [text, setText] = useState(String(value)); useEffect(() => setText(String(Math.round(value * 100) / 100)), [value]); return <TextInput accessibilityLabel={label} value={text} selectTextOnFocus keyboardType="decimal-pad" onChangeText={setText} onEndEditing={() => { const n = Number(text.replace(',', '.')); if (Number.isFinite(n) && n >= 0)
    onChange(n);
else
    setText(String(value)); }} style={[s.input, s.flex, { color: colors.ink, borderColor: colors.line, textAlign: 'center' }]}/>; }
/** Both preferences share the same number column, even when one value has more digits. */
function Stepper({name,value,min,max,step=1,onChange}: {
    name:string;
    value:number;
    min:number;
    max:number;
    step?:number;
    onChange:(value:number)=>void;
}) {
    const {colors} = useTheme();
    const {fontScale} = useWindowDimensions();
    const valueWidth = Math.max(44,Math.ceil(36*fontScale));
    return <View style={s.stepper}>
        {[-1,1].map(direction => {
            const decreasing=direction<0;
            const disabled=decreasing?value<=min:value>=max;
            return <React.Fragment key={direction}>
                {!decreasing && <View style={[s.stepperValue,{width:valueWidth}]}>
                    <Label style={s.figure}>{value}</Label>
                </View>}
                <Pressable accessibilityRole="button" accessibilityLabel={name+(decreasing?' 줄이기':' 늘리기')}
                    accessibilityState={{disabled}} disabled={disabled}
                    onPress={()=>onChange(Math.max(min,Math.min(max,value+direction*step)))}
                    style={({pressed})=>[s.stepperButton,{backgroundColor:colors.soft,opacity:disabled ? .4 : pressed ? .75 : 1}]}>
                    <Label bold size={17}>{decreasing?'−':'+'}</Label>
                </Pressable>
            </React.Fragment>;
        })}
    </View>;
}
/** Shared exercise rows keep the picker and catalog aligned. */
function ExerciseRow({exercise,onPress}: {exercise:Exercise;onPress:()=>void}) {
    const {colors} = useTheme();
    return <Pressable accessibilityRole="button" accessibilityLabel={exercise.name} accessibilityHint={`${exercise.muscle}, ${exercise.equipment}`} onPress={onPress}
        style={({pressed})=>[s.exerciseRow,{borderColor:colors.line,backgroundColor:pressed?colors.soft:'transparent'}]}>
        <View style={s.flex}><Label size={16} bold>{exercise.name}</Label>
            <Label size={13} muted>{exercise.muscle} · {exercise.equipment}</Label></View>
        {hasMotion(exercise.id) && <Label size={12} bold style={{color:colors.accent}}>3D 자세</Label>}
        <Label muted size={18}>›</Label>
    </Pressable>;
}
function ExercisePicker({onPick,items}: {items:Exercise[];onPick:(e:Exercise)=>void}) {
    const [query,setQuery] = useState('');
    const matches = items.filter(e=>matchesExercise(e,query));
    return <>
        <Input value={query} onChangeText={setQuery} placeholder="추가할 운동 검색" search/>
        {matches.length ? matches.map(e=><ExerciseRow key={e.id} exercise={e} onPress={()=>onPick(e)}/>)
            : <Empty text="검색 결과가 없습니다."/>}
    </>;
}
function BarChart({points,unit}: {points:{label:string;value:number}[];unit:string}) {
    const {colors} = useTheme();
    const max = Math.max(1,...points.map(p=>p.value));
    return <View style={s.chart}>
        {points.map((p,i)=><View key={i} accessible accessibilityLabel={`${p.label}, ${p.value} ${unit}`} style={s.barColumn}>
            <View style={[s.bar,{height:Math.max(3,p.value/max*72),
                backgroundColor:i===points.length-1?colors.accent:colors.accentBase}]}/>
            <Label muted size={10}>{p.label}</Label>
        </View>)}
    </View>;
}
function RoutineForm({ item, onSave, items }: {
    items: Exercise[];
    item?: any;
    onSave: (r: any) => void;
}) { const [name, setName] = useState(item?.name || ''), [ids, setIds] = useState<string[]>(item?.ids || []), [q, setQ] = useState(''); return <><Input value={name} onChangeText={setName} placeholder="루틴 이름"/>
        <View style={s.spread}><Label muted style={s.flex}>{ids.length}개 선택 · 선택한 순서로 진행</Label>
            <Button title="루틴 저장" disabled={!name.trim() || !ids.length} onPress={() => onSave({id:item?.id || uid(),name:name.trim(),subtitle:'나만의 트레이닝',ids})}/>
        </View>
        <Input value={q} onChangeText={setQ} placeholder="운동 검색" search/>
        {items.filter(e => matchesExercise(e,q)).map(e => <Chip key={e.id} title={`${ids.includes(e.id) ? '✓ ' : ''}${e.name}`} active={ids.includes(e.id)}
            onPress={() => setIds(x => x.includes(e.id) ? x.filter(v => v !== e.id) : [...x,e.id])}/>)}</>; }

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
const tabPressBounds = {top:0,right:0,bottom:0,left:0};
const s = StyleSheet.create({
    settingStepperRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
    stepper:{flexDirection:'row',alignItems:'center',gap:8},
    stepperButton:{width:46,minHeight:50,borderRadius:15,alignItems:'center',justifyContent:'center',paddingVertical:6},
    stepperValue:{alignItems:'center',justifyContent:'center'},
    pageTitle:{gap:5,marginBottom:4},
    group:{gap:7},
    listCard:{paddingHorizontal:14,paddingVertical:8,gap:0},
    exerciseRow:{flexDirection:'row',alignItems:'center',minHeight:62,paddingHorizontal:8,paddingVertical:11,gap:12,borderBottomWidth:StyleSheet.hairlineWidth},
    metrics:{flexDirection:'row',flexWrap:'wrap',gap:10},
    figure:{fontVariant:['tabular-nums']},
    chart:{flexDirection:'row',alignItems:'flex-end',minHeight:94,gap:4},
    barColumn:{flex:1,minWidth:0,alignItems:'center',gap:6},
    bar:{width:'70%',borderRadius:6},
    bodyPhoto:{height:150,borderRadius:12},
    editRoutine:{alignSelf:'flex-end'},
    sheetGrip:{width:34,height:4,borderRadius:2,alignSelf:'center'},
    periodSwitch:{gap:6},
    periodButton:{flex:1,minHeight:44,borderRadius:12,alignItems:'center',justifyContent:'center'},
    volumeSummary:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:10,gap:4},
    navFrame:{position:'absolute',left:0,right:0,paddingHorizontal:12,alignItems:'center',zIndex:1},
    screen: { flex: 1 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 20, padding: 30, backgroundColor: '#F4F4F5' }, header: { minHeight: 49, paddingHorizontal: 20, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, content: { padding: 20, paddingTop: 9, gap: 16, paddingBottom: 28, maxWidth: 740, width: '100%', alignSelf: 'center' }, row: { flexDirection: 'row', gap: 10, alignItems: 'center' }, spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, flex: { flex: 1 }, hero: { borderRadius: 22, padding: 18, gap: 9 }, track: { height: 7, borderRadius: 8, overflow: 'hidden' }, weekDays: { flexDirection: 'row', justifyContent: 'space-between', gap: 2 }, inlineLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }, day: { flex:1,minWidth:0,minHeight:58,paddingVertical:4,borderRadius:12,gap:4,alignItems:'center',justifyContent:'center' }, dayCircle: { width: '94%', maxWidth: 34, aspectRatio: 1, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }, play: { width: 48, height: 48, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }, nav: { width:'100%',maxWidth:740,borderWidth:1,borderRadius:24,padding:6,gap:0,flexDirection:'row' }, navItem: { alignItems: 'center', justifyContent: 'center', gap: 2, minHeight: 52, flex: 1, borderRadius: 18 }, setRow: { flexDirection: 'row', alignItems: 'center', gap: 9 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 13, padding: 12, fontSize: 15 }, check: { width: 48, height: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' }, rest: { padding: 11, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, chip: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 20, minHeight: 44, justifyContent: 'center' }, modalOverlay: { flex: 1, backgroundColor: '#00000080', justifyContent: 'flex-end' }, modal: { maxHeight: '92%', padding: 24, paddingBottom: 18, borderTopLeftRadius: 30, borderTopRightRadius: 30, gap: 20 }, close: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
