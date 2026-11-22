/** FORM 네이티브 앱 진입점. UI는 React Native 뷰이며 WebView를 사용하지 않습니다. */
import {MotionGuide} from './MotionGuide';
import {CatalogAnatomy} from './CatalogAnatomy';
import {WeeklyVolume} from './WeeklyVolume';
import {AnatomySides, StandingAnatomy, type AnatomySide} from './AnatomyFigure';
import {motions} from './motion-guide.mjs';
import {filterExercises, groupChips, muscleChips, searchExercise} from './muscle-filter.mjs';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, InputAccessoryView, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Switch, TextInput, useWindowDimensions, View } from 'react-native';
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
import { uid, makeSession, validateSession, volume, estimated1RM, validateBody, weekStart, calendarWeekVolume, bmi, applyWatchCommand, validateBackup, recommendation, previousSets, recommendedRest, editSets, appendSet, clampRest, goalRecommendation, TRAINING_GOALS, bodyTrend, parseInbodyText, prepareSession, recommendedRoutines, saveRoutine, removeRoutine, setRoutineRecommended, normalizeRoutine, parseRpe } from './core.mjs';
import {applyPreviousSets, cycleSetKind, exerciseGrowth, exercisePosition, historyPrFlags, libraryPool, moveExercise, nextExercise, personalBest, previousHints, recentExerciseIds, recommendationLines, replaceExercise, sessionSummary, substitutionCandidates, supersetLabel, toggleFavorite, toggleSuperset, weeklyProgress} from './workout-features.mjs';
import {LineChart} from './ui-v2/Charts';
import {PlateCalculator} from './ui-v2/PlateCalculator';
import { connectHealth, readHealth, exportBody, exportWorkout } from './health';
import Device from '../modules/form-device';
import catalog from './exercises.json';
import {closeWorkout, toggleWorkoutPause, workoutElapsedSeconds, prepareWorkout, beginPreparedWorkout, measurementDate, localDateInput, nextBodyRevision, validateCustomExercise} from './core.mjs';
import {FormTheme} from './ui-v2/Theme';
import {FocusedWorkout} from './ui-v2/FocusedWorkout';
import {Surface} from './ui-v2/Primitives';
import {GoalProgress, MetricTile, Pill, Segmented, ToolRow} from './ui-v2/Controls';
import {geometry, radius, squircle} from './ui-v2/tokens';
import {TabIcon, type TabIconName} from './ui-v2/Icons';
import type { State, Exercise, Session, BodyEntry } from './types';
const catalogExercises = catalog.exercises as Exercise[];
/** 탭 아이콘은 이모지 대신 `ui-v2/Icons`의 모노크롬 도형을 씁니다. */
const tabs: [TabIconName, string][] = [['home', '오늘'], ['workout', '루틴'], ['library', '운동도감'], ['progress', '기록'], ['settings', '내 정보']];
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
        return <SafeAreaProvider><SafeAreaView style={s.loading}><Label size={36} bold>form.</Label><Label>{failure || '나의 트레이닝 공간을 준비합니다.'}</Label>{failure && <Label muted>기존 기록 보호를 위해 초기화하지 않았습니다.</Label>}</SafeAreaView></SafeAreaProvider>;
    return <SafeAreaProvider><ThemeProvider mode={state.settings.theme} contrast={state.settings.contrast || !state.settings.glass}><FormTheme preferences={{mode:state.settings.theme,glass:state.settings.glass && !state.settings.contrast}}><Main state={state} setState={setState}/></FormTheme></ThemeProvider></SafeAreaProvider>;
}
function Main({ state, setState }: {
    state: State;
    setState: React.Dispatch<React.SetStateAction<State | null>>;
}) {
    const { colors, dark } = useTheme();
    const exercises = [...catalogExercises, ...(state.customExercises ?? [])];
    const training = state.settings.training ?? 'hypertrophy';
    const {bottom:bottomInset} = useSafeAreaInsets();
    const [tabBoxHeight,setTabBoxHeight] = useState(66);
    const tabBottom = bottomInset + 6;
    const contentEnd = tabBoxHeight + tabBottom;
    const [bodyMetric,setBodyMetric] = useState<'weight' | 'muscle' | 'bodyFat'>('weight');
    const [selectedWorkoutDay,setSelectedWorkoutDay] = useState<string | null>(null);
    const [focused, setFocused] = useState(false);
    const [focusId,setFocusId] = useState<string|null>(null);
    const [libraryView,setLibraryView] = useState<'all' | 'recent' | 'favorite'>('all');
    const [progressExercise,setProgressExercise] = useState<string | null>(null);
    const [progressMetric,setProgressMetric] = useState<'oneRm' | 'volume'>('oneRm');
    const favorites = state.favorites ?? [];
    const [catalogAnatomy,setCatalogAnatomy]=useState(false);
    const [catalogSide,setCatalogSide]=useState<AnatomySide>('front');
    const [page, setPage] = useState('home'), [modal, setModal] = useState<{
        type: string;
        item?: any;
        fromPicker?: boolean;
    } | null>(null), [query, setQuery] = useState(''), [muscle, setMuscle] = useState('전체'), [equipment, setEquipment] = useState('전체'), [targets, setTargets] = useState<string[]>([]), [includeSecondary, setIncludeSecondary] = useState(true), [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false), [health, setHealth] = useState<any>(null), [watch, setWatch] = useState<any>(null);
    const stateRef = useRef(state);
    stateRef.current = state;
    /** 모든 세트를 마친 종목 카드는 접어 두고, 사용자가 펼친 종목만 다시 펼칩니다. */
    const [expandedDone,setExpandedDone] = useState<Record<string,boolean>>({});
    /** 같은 휴식 종료에 햅틱이 여러 번 울리지 않게 마지막으로 울린 종료 시각을 기억합니다. */
    const restRung = useRef<number | null>(null);
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
    useEffect(() => {
        const end = state.active?.restEndsAt;
        if (!end) { restRung.current = null; return; }
        if (now < end || restRung.current === end) return;
        restRung.current = end;
        change(x => ({ ...x, active: x.active?.restEndsAt === end && x.active.pausedAt === undefined ? { ...x.active, restEndsAt: null } : x.active }));
        // 휴식 종료를 놓치지 않도록 가장 강한 성공 패턴을 한 번 울립니다. 알림 권한·햅틱 미지원 기기에서도 조용히 넘어갑니다.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => { });
    }, [now, state.active?.restEndsAt]);
    useEffect(() => { setFocusId(null); }, [state.active?.id]);
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
                    next.active = { ...result.session, restEndsAt: Date.now() + (result.session.restSeconds ?? current.settings.rest) * 1000 };
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
    /** 루틴·추천 구성·기록 다시하기도 `준비 중 · 0:00`으로 들어갑니다(IMG_9257·IMG_9258).
     *  타이머는 사용자가 상단 `운동 시작`을 눌렀을 때만 startPreparedWorkout으로 시작합니다. */
    async function start(name: string, ids: string[]) {
        // Check the queued state so two entry points cannot replace an existing session.
        await change(current => current.active ? current : ({...current,
            active:prepareSession(name,ids.map(id => exercises.find(e => e.id===id)).filter(Boolean),current.history) as Session}));
        setFocused(false);
        setPage('workout');
    }
    async function prepareBlankWorkout() {
        await change(current => current.active ? current : {...current,active:prepareWorkout() as Session});
        setFocused(false);
        setPage('workout');
    }
    async function startPreparedWorkout() {
        Keyboard.dismiss();
        await patchActive(active=>beginPreparedWorkout(active));
        setNow(Date.now());
    }
    /** 루틴 저장(이름·운동 목록·추천 포함)은 기본 제공 루틴도 같은 경로로 수정합니다. */
    function commitRoutine(routine: any) {
        return run(async () => { await change(x => ({ ...x, routines: saveRoutine(x.routines, routine) as State['routines'] })); setModal(null); });
    }
    /** 삭제는 확인을 받은 뒤 루틴만 지웁니다. 운동 기록·세션은 그대로 남깁니다. */
    function confirmDeleteRoutine(routine: State['routines'][number], closeSheet = false) {
        Alert.alert('루틴을 삭제할까요?', `"${routine.name}" 루틴을 삭제합니다. 저장된 운동 기록은 그대로 남습니다.`, [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: () => run(async () => {
                await change(x => ({ ...x, routines: removeRoutine(x.routines, routine.id) as State['routines'] }));
                if (closeSheet) setModal(null);
            }) },
        ]);
    }
    /** 카드에서 추천 포함 여부만 바로 바꿉니다. */
    function toggleRoutineRecommended(routine: State['routines'][number]) {
        return run(async () => { await change(x => ({ ...x, routines: setRoutineRecommended(x.routines, routine.id, routine.recommended === false) as State['routines'] })); });
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
    async function completeSet(exerciseId: string, setId: string, values?: {weight:number;reps:number}, rpe?: string) {
        await patchActive(active => {
            if (active.preparing || active.pausedAt !== undefined) return active;
            const exercise = active.exercises.find(e=>e.id===exerciseId);
            const set = exercise?.sets.find(s=>s.id===setId);
            if (!exercise || !set) return active;
            // 첫 세트에서 입력한 중량·횟수는 아직 손대지 않은 뒤 세트에도 그대로 적용합니다.
            if (values) editSets(exercise.sets, exercise.sets.indexOf(set), rpe === undefined ? values : {...values, rpe});
            set.done = values ? true : !set.done;
            if (set.done) validateSession(active);
            active.restEndsAt = set.done ? Date.now() + (active.restSeconds ?? stateRef.current.settings.rest) * 1000 : null;
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
    /** 운동 중 휴식 시간은 세션 값으로 보관하고, 설정의 기본값은 그대로 둡니다. */
    const sessionRest = (active: Session | null | undefined) => active?.restSeconds ?? stateRef.current.settings.rest;
    async function changeRest(value: number) {
        const seconds = clampRest(value);
        await change(x => ({ ...x, active: x.active ? { ...x.active, restSeconds: seconds,
            restEndsAt: x.active.restEndsAt ? Date.now() + seconds * 1000 : null } : null }));
        refreshRestReminder();
    }
    async function nudgeRest(delta: number) {
        await change(x => {
            if (!x.active) return x;
            const seconds = clampRest((x.active.restSeconds ?? x.settings.rest) + delta);
            const left = x.active.restEndsAt ? Math.max(0, x.active.restEndsAt - Date.now()) + delta * 1000 : null;
            return { ...x, active: { ...x.active, restSeconds: seconds,
                restEndsAt: left === null ? null : Date.now() + Math.max(5000, left) } };
        });
        refreshRestReminder();
    }
    async function saveRestDefault(seconds: number) {
        await change(x => ({ ...x, settings: { ...x.settings, rest: clampRest(seconds) } }));
    }
    /** 이전 기록 추천을 아직 건드리지 않은 세트에 한 번에 채웁니다. */
    /** 훈련 목적을 바꾸면 아직 손대지 않은 세트와 휴식 시간을 새 추천으로 갱신합니다. */
    async function setTrainingGoal(goalId: string) {
        const goal = goalId as NonNullable<State['settings']['training']>;
        await change(x => {
            const settings = { ...x.settings, training: goal };
            if (!x.active) return { ...x, settings };
            const active = structuredClone(x.active);
            for (const row of active.exercises) {
                const rec = goalRecommendation(x.history, exercises.find(e => e.id === row.id), goal, x.body);
                if (rec.weight > 0) row.sets.forEach(set => { if (!set.done && !set.edited) { set.weight = rec.weight; set.reps = rec.reps; } });
            }
            const next = active.exercises.find(e => e.sets.some(set => !set.done));
            const detail = next ? exercises.find(e => e.id === next.id) : undefined;
            if (detail) active.restSeconds = recommendedRest(detail, goalRecommendation(x.history, detail, goal, x.body), goal);
            return { ...x, settings, active };
        });
        refreshRestReminder();
    }
    async function applyRecommendation(exerciseId: string, rec: {weight:number;reps:number}) {
        await patchActive(active => {
            const row = active.exercises.find(e => e.id === exerciseId);
            if (row) row.sets.forEach(set => { if (!set.done && !set.edited) { set.weight = rec.weight; set.reps = rec.reps; } });
            return active;
        });
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
        // 완료 카드와 같은 요약을 알림에도 담아 직전 대비 볼륨·PR·주간 목표를 한 번에 보여 줍니다.
        const summary = sessionSummary(stateRef.current.history, result.record, stateRef.current.settings.goal);
        const delta = summary.volumeDelta;
        Alert.alert('오늘의 운동을 기록했습니다', [
            `${summary.sets}세트 · ${displayWeight(summary.volume).toLocaleString()} ${unit} 볼륨`,
            delta === null ? '이번 운동이 첫 기록입니다.' : `직전 운동 대비 ${delta > 0 ? '+' : ''}${displayWeight(delta).toLocaleString()} ${unit}`,
            summary.prs.length ? 'PR ' + summary.prs.map(pr => `${pr.name} ${displayWeight(pr.value)} ${unit}`).join(' · ') : '',
            `이번 주 ${summary.weekCount}/${summary.weekGoal}회`,
        ].filter(Boolean).join('\n'));
    }
    function requestStop(session: Session) {
        if (session.preparing) {
            const discard = ()=>run(async()=> {
                await change(current=>current.active?.id === session.id && current.active.preparing
                    ? {...current,active:null} : current);
            });
            if (!session.exercises.length) { void discard(); return; }
            Alert.alert('운동 준비를 닫을까요?', '준비한 운동 목록과 입력한 세트를 삭제합니다.', [
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
        // 추천에 포함한 루틴만 홈 추천 카드에 씁니다. 모두 제외했으면 자유 운동으로 안내합니다.
        const recommended = recommendedRoutines(state.routines);
        const nextRoutine = recommended[0] ?? null;
        const homeRoutines = [...recommended, ...state.routines.filter(r => r.recommended === false)].slice(0, 2);
        const latestBody = [...state.body].sort((a,b)=>b.date.localeCompare(a.date))[0];
        return <>
            <LinearGradient colors={dark ? ['#282D3F', '#1D2030'] : ['#262D46', '#383E57']} style={s.hero}>
                <Label size={13} bold style={{color:'#C9D5FF'}}>{state.active?.preparing ? '준비 중' : state.active ? '진행 중' : nextRoutine ? '추천 루틴' : '오늘의 운동'}</Label>
                <Label size={22} bold style={{color:'#FFFFFF'}}>{state.active?.name ?? nextRoutine?.name ?? '새 운동을 기록하세요'}</Label>
                <Label size={15} style={{color:'#E0E4F2'}}>{state.active
                    ? state.active.preparing ? '운동을 추가하거나 시작할 수 있습니다.' : '기록하던 세트부터 이어서 시작하세요.'
                    : nextRoutine ? `${nextRoutine.ids.length}개 운동 · 준비 화면에서 변경` : '운동을 골라 첫 세트를 기록하세요.'}</Label>
                <Button tone="onDark" title={state.active?.preparing ? '준비한 운동 열기' : state.active ? '운동 이어하기' : nextRoutine ? '루틴으로 준비하기' : '운동 시작하기'}
                    onPress={() => state.active ? setPage('workout') : state.routines.length ? setModal({type:'start'}) : run(prepareBlankWorkout)}/>
            </LinearGradient>
            <Glass>
                <View style={s.spread}><Section title="이번 주 운동"/>
                    <View style={s.periodWrap}>
                        <Segmented accessibilityLabelPrefix="보기" value={selected ? 'day' : 'week'}
                            onChange={key => setSelectedWorkoutDay(key === 'day' ? (selected ?? today).key : null)}
                            options={[{key:'week',label:'주간'},{key:'day',label:'일간'}] as const}/>
                    </View>
                </View>
                <GoalProgress label="주간 목표" count={week.count} goal={weekGoal} accessibilityLabel="주간 운동 목표"/>
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
                    {selected && totals.count===0 && <Label muted size={13}>이날 저장한 운동이 없습니다.</Label>}
                </View>
            </Glass>
            <View style={s.spread}>
                <Section title="나의 루틴"/>
                <Pill title="모두 보기" onPress={()=>setPage('workout')}/>
            </View>
            {homeRoutines.map(r=><RoutineCard key={r.id} routine={r} onEdit={()=>setModal({type:'routine',item:r})}
                onDelete={()=>confirmDeleteRoutine(r)} onToggleRecommended={()=>toggleRoutineRecommended(r)}/>)}
            <Glass><View style={s.spread}><View style={s.flex}><Label bold size={17}>인바디·체성분</Label>
                <Label muted size={13}>{latestBody ? `최근 ${latestBody.weight}kg · 골격근 ${latestBody.muscle ?? '—'}kg · 체지방 ${latestBody.bodyFat ?? '—'}%` : '체중·골격근량·체지방률을 꺾은선으로 확인하세요.'}</Label></View>
                <Pill title="추이 보기" accessibilityLabel="인바디·체성분 열기" onPress={()=>setPage('body')}/></View></Glass>
            <Button secondary title="운동도감 열기" onPress={()=>setPage('library')}/>
        </>;
    }
    /** 루틴 카드는 준비 화면으로만 들어갑니다. ▶를 눌러도 타이머는 0:00에서 멈춰 있습니다. */
    function RoutineCard({routine,onEdit,onDelete,onToggleRecommended}: {routine:State['routines'][number];onEdit?:()=>void;onDelete?:()=>void;onToggleRecommended?:()=>void}) {
        const included = routine.recommended !== false;
        return <Glass>
            <View style={s.spread}>
                <View style={s.flex}><Label size={18} bold>{routine.name}</Label>
                    <Label muted size={13}>{routine.subtitle} · {routine.ids.length}개 운동</Label></View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${routine.name} 준비`} onPress={()=>run(()=>start(routine.name,routine.ids))}
                    style={({pressed})=>[s.play,{backgroundColor:colors.accentBase,opacity:pressed?0.72:1}]}><Label bold style={{color:colors.accent}}>▶</Label></Pressable>
            </View>
            <Label muted size={13}>{routine.ids.map(id=>exercises.find(e=>e.id===id)?.name).filter(Boolean).join(' · ')}</Label>
            <View style={[s.spread, s.routineActions]}>
                {onToggleRecommended
                    ? <Pressable accessibilityRole="switch" accessibilityState={{ checked: included }} accessibilityLabel={`${routine.name} 추천 포함`}
                        onPress={onToggleRecommended} style={[s.chip, { backgroundColor: included ? colors.accentBase : colors.soft }]}>
                        <Label size={13} bold={included} style={{ color: included ? colors.accent : colors.ink }}>추천 {included ? '포함' : '제외'}</Label>
                    </Pressable>
                    : <View/>}
                <View style={s.row}>
                    {onEdit && <Pill title="루틴 편집" accessibilityLabel={`${routine.name} 편집`} onPress={onEdit}/>}
                    {onDelete && <Pill title="삭제" accessibilityLabel={`${routine.name} 삭제`} onPress={onDelete}/>}
                </View>
            </View>
        </Glass>;
    }
    function workout() {
        const active = state.active;
        if (!active) return <>
            <Glass><Section title="자유 운동"/><Label muted>운동을 고른 뒤 원하는 때 타이머를 시작하세요.</Label>
                <Button title="빈 운동 시작" disabled={busy} onPress={()=>run(prepareBlankWorkout)}/>
            </Glass>
            <View style={s.spread}><Section title="내 루틴" right={`${state.routines.length}개`}/>
                <Pill title="+ 새 루틴" onPress={()=>setModal({type:'routine'})}/>            </View>
            {state.routines.map(r => <RoutineCard key={r.id} routine={r} onEdit={()=>setModal({type:'routine',item:r})}
                onDelete={()=>confirmDeleteRoutine(r)} onToggleRecommended={()=>toggleRoutineRecommended(r)}/>)}
            <Button secondary title="운동 종목 검색" onPress={()=>setPage('library')}/>
        </>;
        const preparing = active.preparing === true;
        const pendingTarget = active.exercises.find(e => e.sets.some(set => !set.done));
        const target = (focusId ? active.exercises.find(e => e.id === focusId && e.sets.some(set => !set.done)) : undefined) ?? pendingTarget;
        const recs = new Map(active.exercises.map(e => [e.id, goalRecommendation(state.history, exercises.find(x => x.id === e.id), training, state.body)]));
        const restTarget = target ?? active.exercises[0];
        const restDetail = restTarget ? exercises.find(e => e.id === restTarget.id) : undefined;
        const suggestedRest = restDetail ? recommendedRest(restDetail, recs.get(restDetail.id), training) : null;
        const restSeconds = sessionRest(active);
        const restControls = <View style={{ gap: 10 }}>
            <View style={s.spread}>
                <Label size={13} muted>휴식 {restSeconds}초{suggestedRest && suggestedRest !== restSeconds ? ` · 추천 ${suggestedRest}초` : ''}</Label>
                <View style={s.row}>
                    <Pill title="−15초" accessibilityLabel="휴식 15초 줄이기" onPress={() => run(() => nudgeRest(-15))}/>
                    <Pill title="+15초" accessibilityLabel="휴식 15초 늘리기" onPress={() => run(() => nudgeRest(15))}/>
                </View>
            </View>
            <View style={s.row}>
                <Label size={13} muted>직접 입력</Label>
                <Numeric value={restSeconds} label="휴식 시간(초)" onChange={value => run(() => changeRest(value))}/>
                <Label size={13} muted>초</Label>
            </View>
            <View style={[s.row, { flexWrap: 'wrap' }]}>
                {[60, 90, 120].map(value => <Chip key={value} title={`${value}초`} active={restSeconds === value} onPress={() => run(() => changeRest(value))}/>)}
                {suggestedRest ? <Chip title="추천" active={restSeconds === suggestedRest} onPress={() => run(() => changeRest(suggestedRest))}/> : null}
                <Pill title="기본값 저장" accessibilityLabel="휴식 시간을 기본값으로 저장" onPress={() => run(() => saveRestDefault(restSeconds))}/>
            </View>
        </View>;
        if (!preparing && focused && target?.type === 'strength') {
            const detail = exercises.find(e => e.id === target.id);
            const previous = previousSets(state.history, target.id);
            return <View style={{flex:1}}><FocusedWorkout key={target.id} exercise={{...target,equipment:detail?.equipment ?? '',position:exercisePosition(active,target.id),total:active.exercises.length,previous:previous?.sets[0] ? displayWeight(previous.sets[0].weight)+' '+unit+' × '+previous.sets[0].reps : null,superset:supersetLabel(active,target.id),previousSets:previous?.sets ?? null}} units={unit} elapsedSeconds={workoutElapsedSeconds(active,now)} paused={active.pausedAt !== undefined} now={now} restDeadline={active.restEndsAt} restSeconds={restSeconds} suggestedRest={suggestedRest} recommendation={recs.get(target.id) ? recommendationLines(recs.get(target.id)) : null} goal={training} onGoalChange={value=>run(()=>setTrainingGoal(value))} onRestChange={value=>run(()=>changeRest(value))} onRestNudge={delta=>run(()=>nudgeRest(delta))} onAddSet={()=>run(async()=>{ await patchActive(x=>{const row=x.exercises.find(a=>a.id===target.id); if(row) row.sets=appendSet(row.sets); return x;}); })} onApplyRecommendation={()=>{const rec=recs.get(target.id); if(rec) run(()=>applyRecommendation(target.id, rec));}} guide={<Label>{detail?.steps[0] ?? '편안한 자세에서 시작하세요.'}</Label>} onComplete={async (id, values, rpe) => {
                await completeSet(target.id,id,values,rpe);
                // 슈퍼세트는 한 세트를 마칠 때마다 같은 묶음의 다른 종목으로 넘깁니다.
                const current = stateRef.current.active;
                const label = current ? supersetLabel(current, target.id) : null;
                if (current && label) { const partner = nextExercise(current, target.id); if (partner && supersetLabel(current, partner.id) === label) setFocusId(partner.id); }
            }} onSkipRest={()=>run(skipRest)} onOpenList={()=>{setFocused(false);setFocusId(null);}} onOpenGuide={()=>setModal({type:'exercise',item:detail})} onNext={()=>{const next=nextExercise(active,target.id); setFocusId(next?.id ?? null); if(!next) setFocused(false);}} onSetKind={id=>run(async()=>{await patchActive(x=>{const row=x.exercises.find(a=>a.id===target.id); const set=row?.sets.find(s=>s.id===id); if(set) set.kind=cycleSetKind(set.kind ?? 'normal'); return x;});})} onDeleteSet={id=>run(async()=>{await patchActive(x=>{const row=x.exercises.find(a=>a.id===target.id); if(row) row.sets=row.sets.filter(s=>s.id!==id); return x;});})} onNoteChange={note=>patchActive(x=>{const row=x.exercises.find(a=>a.id===target.id); if(row) row.note=note; return x;})} onMove={direction=>run(async()=>{await patchActive(x=>moveExercise(x,target.id,direction));})} onSubstitute={()=>setModal({type:'substitute',item:{exerciseId:target.id}})} onToggleSuperset={()=>run(async()=>{await patchActive(x=>toggleSuperset(x,target.id));})} onOpenPlates={weight=>setModal({type:'plates',item:{weight}})}/></View>;
        }
        if (active.pausedAt !== undefined) return <Glass><Section title={active.name}/><Label muted>계속하기를 누르면 세트 기록을 이어갈 수 있습니다.</Label></Glass>;
        return <>{!preparing && target?.type==='strength' && <Button secondary title="한 운동에 집중하기" onPress={()=>setFocused(true)}/>}
            {preparing ? !active.exercises.length && <Glass>
                <Section title="자유 운동"/>
                <Label muted>운동을 추가한 뒤 세트와 중량을 먼저 설정하세요.</Label>
            </Glass> : <>{!active.exercises.length && <Glass><Label bold>첫 운동을 추가하세요.</Label><Label muted>타이머가 진행 중입니다.</Label></Glass>}<Glass><View style={s.spread}><Label bold size={17}>{active.name}</Label></View><Label muted>{active.exercises.reduce((n, e) => n + e.sets.filter(x => x.done).length, 0)}세트 완료 · {displayWeight(volume(active)).toLocaleString()} {unit}</Label>{active.restEndsAt && <View style={[s.rest, { backgroundColor: colors.soft }]}><Label>휴식 {clock(Math.max(0, Math.ceil((active.restEndsAt - now) / 1000)))}</Label><Button secondary title="건너뛰기" onPress={() => run(skipRest)}/></View>}</Glass></>}{active.exercises.map(e => { const previousRows = previousSets(state.history, e.id)?.sets ?? null; const doneCount = e.sets.filter(set => set.done).length; const allDone = e.sets.length > 0 && doneCount === e.sets.length; const collapsed = !preparing && allDone && !expandedDone[e.id]; return <Glass key={e.id}><View style={s.cardHeader}><Pressable accessibilityRole="button" style={s.flex} onPress={() => setModal({ type: 'exercise', item: exercises.find(x => x.id === e.id) })}><View style={s.nameRow}><Label bold size={17} numberOfLines={2} style={s.flex}>{e.name}</Label><Label muted size={13}>ⓘ</Label></View></Pressable>{allDone ? <Pressable accessibilityRole="button" accessibilityLabel={`${e.name} 접기`} onPress={() => setExpandedDone(x => ({ ...x, [e.id]: false }))} style={[s.iconButton, { backgroundColor: colors.soft }]}><Label muted size={15}>▴</Label></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel={`${e.name} 삭제`} onPress={() => Alert.alert('운동 삭제', `${e.name}의 진행 기록도 삭제됩니다.`, [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => patchActive(x => ({ ...x, exercises: x.exercises.filter(a => a.id !== e.id) })) }])} style={[s.iconButton,{backgroundColor:colors.soft}]}><Label muted size={15}>✕</Label></Pressable></View>{collapsed ? <View style={s.collapsedRow}><View style={[s.badge,{backgroundColor:colors.accentBase}]}><Label size={11} bold style={{color:colors.accent}}>{doneCount}/{e.sets.length}세트 완료</Label></View><Pill title="펼치기 ▾" accessibilityLabel={`${e.name} 펼치기`} onPress={()=>setExpandedDone(x=>({...x,[e.id]:true}))}/></View> : <>{supersetLabel(active,e.id) ? <View style={[s.badge,s.supersetBadge,{backgroundColor:colors.accentBase}]}><Label size={11} bold style={{color:colors.accent}}>슈퍼세트 {supersetLabel(active,e.id)}</Label></View> : null}<ToolRow><Pill title="↑" accessibilityLabel={`${e.name} 순서 위로`} onPress={()=>run(async()=>{await patchActive(x=>moveExercise(x,e.id,-1));})}/><Pill title="↓" accessibilityLabel={`${e.name} 순서 아래로`} onPress={()=>run(async()=>{await patchActive(x=>moveExercise(x,e.id,1));})}/><Pill title="대체" accessibilityLabel={`${e.name} 대체 운동`} onPress={()=>setModal({type:'substitute',item:{exerciseId:e.id}})}/><Pill title="원판" accessibilityLabel={`${e.name} 원판 계산기`} onPress={()=>setModal({type:'plates',item:{weight:e.sets.find(set=>!set.done)?.weight ?? e.sets[0]?.weight ?? 0}})}/></ToolRow><ToolRow><Pill title={supersetLabel(active,e.id)?'슈퍼세트 해제':'슈퍼세트'} accessibilityLabel={`${e.name} 슈퍼세트 ${supersetLabel(active,e.id)?'풀기':'묶기'}`} onPress={()=>run(async()=>{await patchActive(x=>toggleSuperset(x,e.id));})}/>{previousRows ? <Pill title="지난 기록" accessibilityLabel={`${e.name} 지난 기록 채우기`} onPress={()=>run(async()=>{await patchActive(x=>{const row=x.exercises.find(a=>a.id===e.id); if(row) row.sets=applyPreviousSets(row.sets,previousRows); return x;});})}/> : null}</ToolRow>{recs.get(e.id) ? (() => { const rec = recs.get(e.id)!; const lines = recommendationLines(rec); return <View style={[s.reco,{backgroundColor:colors.soft}]}><View style={s.recoHead}><View style={[s.badge,{backgroundColor:colors.accentBase}]}><Label size={11} bold style={{color:colors.accent}}>{lines.badge}</Label></View><Pill title={rec.weight > 0 ? '적용' : '참고'} accessibilityLabel={`${e.name} 추천 적용`} onPress={() => { if (rec.weight > 0) run(async () => { await applyRecommendation(e.id, rec); await changeRest(rec.rest); }); }}/></View><Label size={13} muted numberOfLines={2} style={s.recoDetail}>{lines.detail}</Label></View>; })() : null}<View style={s.setHead}><Label size={11} muted style={s.setIndex}>세트</Label><Label size={11} muted style={[s.flex,s.setCenter]}>{e.type === 'strength' ? unit : '초'}</Label><Label size={11} muted style={[s.flex,s.setCenter]}>{e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리' : 'RPE'}</Label>{!preparing && <Label size={11} muted style={[s.setCheckCell,s.setCenter]}>완료</Label>}</View><View style={s.setList}>{e.sets.map((set, i) => <View key={set.id}>{previousSets(state.history,e.id)?.sets[i] && <Label size={11} muted style={s.prevHint}>이전 {displayWeight(previousSets(state.history,e.id)!.sets[i].weight)} {unit} × {previousSets(state.history,e.id)!.sets[i].reps}</Label>}<View style={s.setRow}><Label size={13} style={s.setIndex}>{i + 1}</Label><Numeric value={e.type === 'strength' ? displayWeight(set.weight) : set.seconds} label={`${e.name} ${i + 1}세트 ${e.type === 'strength' ? '중량' : '시간(초)'}`} onChange={value => patchActive(x => { const row = x.exercises.find(a => a.id === e.id); const index = row ? row.sets.findIndex(entry=>entry.id===set.id) : -1; if (!row || index < 0) return x; if (e.type === 'strength')
            editSets(row.sets, index, { weight: unit === 'lb' ? value / 2.2046226218 : value });
        else
            editSets(row.sets, index, { seconds: value }); return x; })}/><Numeric value={e.type === 'strength' ? set.reps : e.type === 'cardio' ? set.distance : Number(set.rpe || 0)} label={`${e.name} ${i + 1}세트 ${e.type === 'strength' ? '횟수' : e.type === 'cardio' ? '거리 km' : 'RPE'}`} onChange={value => patchActive(x => { const row = x.exercises.find(a => a.id === e.id); const index = row ? row.sets.findIndex(entry=>entry.id===set.id) : -1; if (!row || index < 0) return x; if (e.type === 'strength')
            editSets(row.sets, index, { reps: value });
        else if (e.type === 'cardio')
            editSets(row.sets, index, { distance: value });
        else
            editSets(row.sets, index, { rpe: String(value) }); return x; })}/>{!preparing && <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: set.done }} accessibilityLabel={`${e.name} ${i + 1}세트 완료`} onPress={() => run(() => completeSet(e.id, set.id))} style={[s.check, { backgroundColor: set.done ? colors.lime : colors.soft }]}><Label size={15} style={{ color: set.done ? '#26422d' : colors.muted }}>{set.done ? '✓' : '○'}</Label></Pressable>}</View><View style={s.setMeta}><Pill style={s.setMetaCell} title={({ normal: '일반', warmup: '워밍업', drop: '드롭' } as any)[set.kind] + ' ↻'} onPress={() => patchActive(x => { const st = x.exercises.find(a => a.id === e.id)?.sets.find(entry=>entry.id===set.id); if (!st) return x; st.kind = st.kind === 'normal' ? 'warmup' : st.kind === 'warmup' ? 'drop' : 'normal'; return x; })}/><Pill style={s.setMetaCell} title="세트 삭제" onPress={() => patchActive(x => { const entry=x.exercises.find(a=>a.id===e.id); if(entry) entry.sets=entry.sets.filter(item=>item.id!==set.id); return x; })}/>{e.type==='strength' && <View style={s.setMetaCell}><RpeInput label={`${e.name} ${i+1}세트 RPE`} value={String(set.rpe ?? '')} onChange={rpe=>patchActive(x=>{const st=x.exercises.find(a=>a.id===e.id)?.sets.find(entry=>entry.id===set.id); if(st) st.rpe=rpe; return x;})}/></View>}</View></View>)}</View><Button secondary title="+ 세트 추가" onPress={() => patchActive(x => { const ex = x.exercises.find(a => a.id === e.id); if (ex) ex.sets = appendSet(ex.sets); return x; })}/><TextInput placeholder="자세, 컨디션, 다음 운동을 위한 메모" placeholderTextColor={colors.muted} value={e.note} onChangeText={note => patchActive(x => { x.exercises.find(a => a.id === e.id)!.note = note; return x; })} style={[s.input, { color: colors.ink, borderColor: colors.line }]}/></>}</Glass>; })}<Button secondary={active.exercises.length>0 || !preparing} title={preparing?'운동 추가':'+ 운동 추가'} onPress={() => setModal({ type: 'add' })}/><Glass><Section title="훈련 목적"/><View style={[s.row, { flexWrap: 'wrap' }]}>{Object.values(TRAINING_GOALS).map(goal => <Chip key={goal.id} title={goal.label} active={training === goal.id} onPress={() => run(() => setTrainingGoal(goal.id))}/>)}</View><Label muted size={13}>{recs.get(restTarget?.id ?? '')?.reason ?? '이전 기록이 쌓이면 목적에 맞는 무게와 반복을 추천합니다.'}</Label></Glass><Glass><Section title="휴식"/>{restControls}</Glass>{!preparing && <><Button title="운동 마치고 저장" disabled={busy} onPress={() => run(()=>finish(active.id))}/><Button secondary danger title="운동 취소" onPress={() => Alert.alert('진행 중인 운동을 취소할까요?', '완료하지 않은 운동 기록이 삭제됩니다.', [{ text: '계속 운동' }, { text: '취소하기', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, active: null })); if (notification.current)
                    await Notifications.cancelScheduledNotificationAsync(notification.current); }) }])}/></>}</>;
    }
    function library() {
        const toggleTarget=(id:string)=>{
            setMuscle('전체');
            setTargets(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
        };
        // 큰 부위 이름은 근육 그룹으로, '둔근'·'종아리'·'전신' 같은 나머지 부위명은 운동도감 부위로 걸러냅니다.
        const group = groupChips().find(g => g.name === muscle);
        const detailNames = muscleChips().filter(m => targets.includes(m.id)).map(m => m.name);
        const recentIds = recentExerciseIds(state.history, 12);
        const viewExercises = libraryPool(exercises, libraryView, {favorites, recent: recentIds});
        const filtered = filterExercises(viewExercises, {
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
            <View style={s.group}>
                <Label size={13} bold>빠른 보기</Label>
                <Segmented accessibilityLabelPrefix="빠른 보기" value={libraryView} onChange={setLibraryView}
                    options={[{key:'all',label:'모든 운동'},{key:'recent',label:'최근 한 운동'},{key:'favorite',label:'즐겨찾기'}] as const}/>
                {libraryView==='recent' && !recentIds.length && <Label muted size={13}>운동을 마치면 최근에 한 종목이 여기에 모입니다.</Label>}
                {libraryView==='favorite' && !favorites.length && <Label muted size={13}>목록의 ☆를 눌러 자주 하는 운동을 저장하세요.</Label>}
            </View>
{filters('부위', ['전체', ...new Set([...groupChips().map(g => g.name), ...exercises.map(e => e.muscle)])], muscle,
                value => { setMuscle(value); setTargets([]); })}
            <View style={s.group}>
                <View style={s.spread}>
                    <Label size={13} bold>타깃 근육</Label>
                    <Pressable accessibilityRole="switch" accessibilityState={{checked: includeSecondary}}
                        accessibilityLabel={includeSecondary ? '보조근 포함' : '주동근만'}
                        onPress={() => setIncludeSecondary(value => !value)}
                        style={[s.togglePill,{borderColor: includeSecondary ? colors.accent : colors.line,
                            backgroundColor: includeSecondary ? colors.accentBase : 'transparent'}]}>
                        <Label size={13} bold={includeSecondary} style={{color: includeSecondary ? colors.accent : colors.muted}}>보조근 포함</Label>
                        <Label size={13} style={{color: includeSecondary ? colors.accent : colors.muted}}>{includeSecondary ? '✓' : '–'}</Label>
                    </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    <View style={s.row}>{muscleChips().map(m => <Chip key={m.id} title={m.name} active={targets.includes(m.id)}
                        onPress={()=>toggleTarget(m.id)}/>)}</View>
                </ScrollView>
                {catalogAnatomy && <View style={{gap:10}}>
                    <StandingAnatomy side={catalogSide} height={180} highlights={targets} onMuscle={toggleTarget}
                        caption={`도감 근육 모형 · ${catalogSide==='front'?'앞면':'배면'}`}/>
                    <View style={[s.spread,{gap:10}]}>
                        <Label muted size={13} style={s.flex}>근육을 눌러 운동을 찾으세요.</Label>
                        <AnatomySides side={catalogSide} onChange={setCatalogSide}/>
                    </View>
                </View>}
                {/* 토글 바는 모형 아래에 고정합니다. 모형을 펼쳐도 바가 화면 밖으로 밀리지 않습니다. */}
                <Pressable accessibilityRole="button" accessibilityState={{expanded:catalogAnatomy}}
                    accessibilityLabel={catalogAnatomy?'근육 모형 접기':'근육 모형으로 찾기'}
                    style={[s.outlineBar,{borderColor:colors.line}]}
                    onPress={()=>setCatalogAnatomy(value=>!value)}>
                    <Label size={13} bold>{catalogAnatomy?'근육 모형 접기':'근육 모형으로 찾기'}</Label>
                    <Label size={13} muted>{catalogAnatomy?'▴':'▾'}</Label>
                </Pressable>
            </View>
            {(group || detailNames.length > 0) && <Label muted size={13}>
                {group ? `${group.name} 전체` : detailNames.join(' · ')}{includeSecondary ? ' · 보조근 포함' : ' · 주동근만'}
            </Label>}
            {filters('장비',['전체',...new Set(exercises.map(e=>e.equipment))],equipment,setEquipment)}
            <View style={s.spread}>
                <View style={s.flex}><Section title="운동 목록" right={`${filtered.length}개`}/></View>
                <Pill title="+ 내 운동" onPress={()=>setModal({type:'custom-exercise'})}/>            </View>
            <Glass style={s.listCard}>{filtered.map(e => <ExerciseRow key={e.id} exercise={e} favorite={favorites.includes(e.id)} onFavorite={()=>run(async()=>{await change(x=>({...x,favorites:toggleFavorite(x.favorites ?? [],e.id)}));})} onPress={() => setModal({type:'exercise',item:e})}/>)}
                {!filtered.length && <Label muted>{libraryView==='recent'?'최근에 한 운동이 아직 없습니다.':'검색어나 필터를 바꿔보세요.'}</Label>}
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
        const summary = sessionSummary(history, history[0] ?? null, state.settings.goal);
        const prFlags = historyPrFlags(history);
        const growthIds = recentExerciseIds(history, 8);
        const growthId = progressExercise && growthIds.includes(progressExercise) ? progressExercise : growthIds[0];
        const growth = growthId ? exerciseGrowth(history, growthId, 12) : [];
        const growthName = growthId ? exercises.find(e=>e.id===growthId)?.name ?? growthId : null;
        const best = growthId ? personalBest(history, growthId) : null;
        const latestBody = [...state.body].sort((a,b)=>b.date.localeCompare(a.date))[0];
        return <>
            {history.length > 0 && <Glass>
                <View style={s.cardHeader}><View style={s.flex}><Label bold size={17}>최근 운동 요약</Label><Label muted size={13}>{summary.date ? dateText(summary.date) : '아직 저장한 운동이 없습니다'}</Label></View><View style={[s.badge,{backgroundColor:colors.soft}]}><Label size={11} muted>{summary.sets}세트 · {summary.minutes}분</Label></View></View>
                <View style={s.metrics}>
                    <Metric label="볼륨" value={displayWeight(summary.volume).toLocaleString()} unit={unit}/>
                    <Metric label="직전 대비" value={summary.volumeDelta === null ? '—' : `${summary.volumeDelta > 0 ? '+' : ''}${displayWeight(summary.volumeDelta).toLocaleString()}`} unit={unit}/>
                </View>
                {summary.prs.length ? <View style={[s.row,{flexWrap:'wrap'}]}>
                    {summary.prs.map(item => <View key={item.id} style={[s.badge,{backgroundColor:colors.accentBase}]}>
                        <Label size={11} bold style={{color:colors.accent}}>{item.first ? '첫 기록' : 'PR'} {item.name}</Label></View>)}
                </View> : null}
            </Glass>}
            <View style={s.metrics}><Metric label="전체 운동" value={history.length} unit="회"/>
                <Metric label="최고 추정 1RM" value={pr ? Math.round(displayWeight(pr.value)) : '—'} unit={unit}/></View>
            {pr && <Label muted size={13}>{pr.name} · 12회 이하 세트 기준</Label>}
            <Glass>
                <Section title="종목 성장 그래프" right={growth.length ? `${growth.length}회 기록` : undefined}/>
                {growthIds.length ? <>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <View style={s.row}>{growthIds.map(id => <Chip key={id} title={exercises.find(e=>e.id===id)?.name ?? id} active={growthId===id} onPress={()=>setProgressExercise(id)}/>)}</View>
                    </ScrollView>
                    <View style={s.row}>
                        {([['oneRm','추정 1RM'],['volume','볼륨']] as const).map(([key,label]) =>
                            <Chip key={key} title={label} active={progressMetric===key} onPress={()=>setProgressMetric(key)}/>)}
                    </View>
                    <LineChart points={growth.map(row => ({label:row.label, value: progressMetric==='oneRm' ? row.oneRm : Math.round(displayWeight(row.volume))}))}
                        unit={unit} accessibilityLabel={`${growthName} ${progressMetric==='oneRm'?'추정 1RM':'세션 볼륨'} 추이`}/>
                    {best && <Label muted size={13}>최고 추정 1RM {displayWeight(best.value)} {unit} · {displayWeight(best.weight)} {unit} × {best.reps}회{best.at ? ` · ${dateText(best.at)}` : ''}</Label>}
                    {!growth.some(row => row.oneRm) && <Label muted size={13}>추정 1RM은 12회 이하 세트에서 계산합니다. 볼륨은 워밍업을 뺀 완료 세트 합계입니다.</Label>}
                </> : <Label muted size={13}>운동을 마치면 종목별 성장 그래프가 나타납니다.</Label>}
            </Glass>
            <Glass><Section title="최근 6주 운동 볼륨" right={unit}/>
                <BarChart points={weeks.map(w=>({...w,value:displayWeight(w.value)}))} unit={unit}/>
            </Glass>
            <Glass><WeeklyVolume history={history} unit={unit}/></Glass>
            <Glass><View style={s.spread}><View style={s.flex}><Label bold size={17}>인바디·체성분</Label>
                <Label muted size={13}>{latestBody ? `최근 ${latestBody.weight}kg · 골격근 ${latestBody.muscle ?? '—'}kg · 체지방 ${latestBody.bodyFat ?? '—'}%` : '체중·골격근량·체지방률을 꺾은선으로 확인하세요.'}</Label></View>
                <Pill title="추이 보기" accessibilityLabel="인바디·체성분 기록" onPress={()=>setPage('body')}/></View></Glass>
            <Section title="운동 히스토리" right={`${history.length}개`}/>
            {history.length ? history.map(h => <Pressable key={h.id} accessibilityRole="button" onPress={()=>setModal({type:'history',item:h})}>
                <Glass><View style={s.spread}><Label bold style={s.flex}>{h.name}</Label><Label muted>›</Label></View>
                    <View style={[s.row,{flexWrap:'wrap'}]}>
                        <Label muted size={13}>{dateText(h.startedAt)} · {Math.max(1,Math.round(workoutElapsedSeconds(h)/60))}분 · {displayWeight(volume(h)).toLocaleString()} {unit}{h.external?' · 워치':''}</Label>
                        {(prFlags.get(h.id) ?? []).map(item => <View key={item.id} style={[s.badge,{backgroundColor:colors.accentBase}]}>
                            <Label size={11} bold style={{color:colors.accent}}>PR {item.name}</Label></View>)}
                    </View>
                </Glass></Pressable>) : <Empty text="첫 운동을 마치면 여기에 기록이 쌓입니다."/>}
        </>;
    }
    function body() {
        const entries = [...state.body].sort((a,b) => b.date.localeCompare(a.date));
        const trend = bodyTrend(state.body);
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
                <Glass><Section title="신체 변화 추이" right={`${trend.count}회`}/>
                    <View style={[s.row, { flexWrap: 'wrap' }]}>
                        {([['weight', '체중'], ['muscle', '골격근량'], ['bodyFat', '체지방률']] as const).map(([key, label]) =>
                            <Chip key={key} title={label} active={bodyMetric === key} onPress={() => setBodyMetric(key)}/>)}
                    </View>
                    <LineChart points={trend.points.map(point => ({label: point.label,
                        value: point[bodyMetric] === null || point[bodyMetric] === undefined ? null : Number(point[bodyMetric])}))}
                        unit={bodyMetric === 'bodyFat' ? '%' : 'kg'} accessibilityLabel={`${bodyMetric==='weight'?'체중':bodyMetric==='muscle'?'골격근량':'체지방률'} 변화 추이`}/>
                    {trend[bodyMetric] && <View style={s.spread}>
                        <Label size={13} muted>직전 측정 대비 {trend[bodyMetric].deltaFromPrevious === null ? '—'
                            : `${trend[bodyMetric].deltaFromPrevious > 0 ? '+' : ''}${trend[bodyMetric].deltaFromPrevious}`}</Label>
                        <Label size={13} muted>첫 측정 대비 {trend[bodyMetric].delta > 0 ? '+' : ''}{trend[bodyMetric].delta}</Label>
                    </View>}
                    <Label muted size={13}>측정한 날짜 순서대로 표시합니다. 최근 {trend.points.length}회.</Label>
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
    function settings() { return <><Glass><Section title="화면 스타일"/><Segmented value={state.settings.theme} onChange={key => change(x => ({ ...x, settings: { ...x.settings, theme: key } }))}
                options={[{key:'system',label:'시스템'},{key:'light',label:'라이트'},{key:'dark',label:'다크'}] as const}/><View style={s.spread}><Label>Liquid Glass</Label><Switch accessibilityLabel="Liquid Glass 효과" value={state.settings.glass} onValueChange={glass => change(x => ({ ...x, settings: { ...x.settings, glass } }))}/></View><View style={s.spread}><Label>투명도 줄이기</Label><Switch accessibilityLabel="투명도 줄이기" value={state.settings.contrast} onValueChange={contrast => change(x => ({ ...x, settings: { ...x.settings, contrast } }))}/></View><Label muted size={13}>탭과 조작 영역에 유리 효과를 적용합니다. 투명도 줄이기를 켜면 단색을 사용합니다.</Label></Glass><Glass><Section title="운동 설정"/><View style={s.spread}><Label>무게 표시</Label><View style={s.row}>{['kg', 'lb'].map(u => <Chip key={u} title={u} active={unit === u} onPress={() => change(x => ({ ...x, settings: { ...x.settings, units: u as any } }))}/>)}</View></View><View style={s.settingStepperRow}><Label style={s.flex}>주간 목표</Label><Stepper name="주간 목표" value={state.settings.goal} min={1} max={7} onChange={goal => change(x => ({ ...x, settings: { ...x.settings, goal } }))}/></View><View style={{gap:8}}><Label>훈련 목적</Label><View style={[s.row,{flexWrap:'wrap'}]}>{Object.values(TRAINING_GOALS).map(goal => <Chip key={goal.id} title={goal.label} active={training === goal.id} onPress={() => run(() => setTrainingGoal(goal.id))}/>)}</View><Label muted size={13}>추천 무게·반복·세트와 휴식 시간이 선택한 목적에 맞춰 바뀝니다.</Label></View><View style={s.settingStepperRow}><Label style={s.flex}>휴식 시간 (초)</Label><Stepper name="휴식 시간" value={state.settings.rest} min={15} max={600} step={15} onChange={rest => change(x => ({ ...x, settings: { ...x.settings, rest } }))}/></View><Button secondary title="휴식 알림 권한 설정" onPress={() => run(async () => { const p = await Notifications.requestPermissionsAsync(); Alert.alert(p.granted ? '알림이 허용되었습니다' : '알림이 허용되지 않았습니다'); })}/></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple 건강 · 피트니스' : 'Health Connect · Samsung Health'}/><Label muted size={13}>읽기: 걸음·심박·체중·체지방·최근 30일 운동. 쓰기: 선택한 운동·체중·체지방. 기기 및 앱이 공유하는 데이터만 표시됩니다.</Label><Button disabled={busy} title={health ? "건강 데이터 다시 연결" : "건강 앱 연결"} onPress={() => run(async () => { setHealth(await connectHealth()); await change(x => ({ ...x, settings: { ...x.settings, health: true } })); })}/>{health && <><Label>오늘 걸음 {health.steps ?? '데이터 없음'} · 최근 심박 {health.heartRate ?? '—'} bpm</Label><Label>체중 {health.weight ?? '—'} kg · 체지방 {health.bodyFat ?? '—'}%</Label><Label muted size={11}>권한 거부와 데이터 부재는 iOS에서 구분할 수 없습니다.</Label>{health.workouts?.slice(0, 5).map((h: any) => <Label key={h.id} muted size={11}>{dateText(h.start)} · {h.name}</Label>)}<Button secondary title="새로고침" onPress={() => run(async () => setHealth(await readHealth()))}/></>}<Label muted size={11}>피트니스 링은 Apple이 실제 측정 데이터와 정책에 따라 반영합니다. 골격근량은 건강 앱 제지방량으로 내보내지 않습니다.</Label></Glass><Glass><Section title={Platform.OS === 'ios' ? 'Apple Watch' : 'Galaxy Watch · Wear OS'}/><Label muted size={13}>동일한 앱을 워치에도 설치해야 합니다. Galaxy Watch4 이후 Wear OS 기기가 대상이며 Tizen 기기는 지원하지 않습니다.</Label><Button secondary title="워치 연결 확인" onPress={() => run(async () => setWatch(await Device.watchStatus()))}/>{watch && <Label>{watch.connected ? '워치와 연결되어 있습니다.' : watch.paired ? '페어링됨 · 현재 연결 대기' : '연결된 워치 앱이 없습니다.'}</Label>}<Label muted size={13}>워치에서 다음 세트를 확인하고 완료를 기록할 수 있습니다.</Label></Glass><Glass><Section title="내 데이터"/><Label muted size={13}>인바디·체성분은 기록 탭에서 조회·입력합니다.</Label><Button secondary title="백업 파일 내보내기" onPress={() => Alert.alert('백업 파일', '백업은 암호화되지 않은 건강 기록을 포함합니다. 결과지 사진은 제외됩니다. 안전한 위치에 저장하세요.', [{ text: '취소' }, { text: '내보내기', onPress: () => run(async () => { const path = FS.cacheDirectory + 'form-backup.json'; await FS.writeAsStringAsync(path, JSON.stringify({ ...state, active: null, body: state.body.map(x => ({ ...x, photo: null })) }, null, 2)); await Sharing.shareAsync(path, { mimeType: 'application/json' }); }) }])}/><Button secondary title="백업 가져오기" onPress={() => run(async () => { const file = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true }); if (file.canceled)
        return; const parsed = validateBackup(JSON.parse(await FS.readAsStringAsync(file.assets[0].uri))); Alert.alert('백업 병합', '동일한 ID는 현재 기록을 유지하고, 새로운 기록만 가져옵니다.', [{ text: '취소' }, { text: '병합', onPress: () => change(x => ({ ...x, history: [...x.history, ...parsed.history.filter((h: Session) => !x.history.some(a => a.id === h.id))], body: [...x.body, ...parsed.body.filter((h: BodyEntry) => !x.body.some(a => a.id === h.id)).map((h: BodyEntry) => ({ ...h, photo: null }))], customExercises: [...(x.customExercises ?? []), ...(parsed.customExercises ?? []).filter((e: Exercise) => !(x.customExercises ?? []).some(a => a.id === e.id))], routines: [...x.routines, ...parsed.routines.filter((r: any) => !x.routines.some(a => a.id === r.id))] })) }]); })}/><Button secondary danger title="이 기기의 앱 기록 삭제" onPress={() => Alert.alert('앱 기록 삭제', '이 기기의 운동·체성분 기록을 삭제합니다. 건강 앱에 내보낸 기록은 해당 앱에서 별도로 삭제해야 합니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(() => freshState()); if (notification.current)
                await Notifications.cancelScheduledNotificationAsync(notification.current); const folder = FS.documentDirectory + 'inbody/'; await FS.deleteAsync(folder, { idempotent: true }); }) }])}/><Label muted size={11}>건강 데이터는 암호화된 로컬 DB에 저장됩니다. 사진은 앱 전용 폴더에 저장되며 별도 파일 암호화는 적용하지 않았습니다. 로그인·서버·광고 SDK는 없습니다.</Label></Glass></>; }
    // A focused workout owns its scroll region; its controls must remain above the tab bar.
    // Avoid pushing the number fields below the keyboard on compact screens.
    const editingDraft=page==='workout' && state.active?.preparing===true && state.active.exercises.length>0;
    const showFocused = page === 'workout' && focused && !state.active?.preparing && state.active?.exercises.find(e => e.sets.some(set => !set.done))?.type === 'strength';
    return <SafeAreaView edges={['top','left','right']} style={[s.screen, { backgroundColor: colors.bg }]}><StatusBar barStyle={dark ? 'light-content' : 'dark-content'}/>{/* 집중 운동은 화면을 세션에 내줍니다 — 로고 줄을 숨겨 종목명과 컨트롤이 함께 들어옵니다. */}{!showFocused && <View style={s.header}>{page === 'body' ? <Pressable accessibilityRole="button" accessibilityLabel="운동 기록으로 돌아가기" onPress={()=>setPage('progress')} style={s.inlineLink}><Label size={15} bold>‹ 운동 기록</Label></Pressable> : <Label size={24} bold style={{letterSpacing:-1}}>form<Label style={{color:colors.accent}}>.</Label></Label>}</View>}{page === 'workout' && state.active && <View style={s.workoutHeader}>
            <View style={s.headerActions}>
                <View style={s.flex}>
                    {state.active.preparing
                        ? <Button title="운동 시작" disabled={busy} onPress={()=>run(startPreparedWorkout)}/>
                        : <Button secondary title={state.active.pausedAt === undefined ? '일시정지' : '계속하기'}
                            disabled={busy} onPress={()=>run(pauseOrResume)}/>}
                </View>
                <View style={s.flex}>
                    <Button secondary danger={!state.active.preparing} title={state.active.preparing ? '준비 닫기' : '운동 종료'}
                        disabled={busy} onPress={()=>state.active && requestStop(state.active)}/>
                </View>
            </View>
            <View style={s.headerStatus}>
                <Label bold size={13} numberOfLines={1} style={s.flex}>{state.active.name}</Label>
                <View style={[s.statusPill,{backgroundColor:colors.soft}]}>
                    <Label bold size={13}>{state.active.preparing ? '준비 중 · 0:00'
                        : (state.active.pausedAt === undefined ? '진행 중' : '일시정지됨')+' · '+clock(workoutElapsedSeconds(state.active,now))}</Label>
                </View>
            </View>
        </View>}{showFocused ? <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={[s.flex,{paddingBottom:contentEnd}]}>{workout()}</View></KeyboardAvoidingView> : <ScrollView key={page} style={s.flex} contentContainerStyle={[s.content,{paddingBottom:contentEnd+20}]} scrollIndicatorInsets={{bottom:contentEnd}} keyboardShouldPersistTaps="handled">{editingDraft
            ? <Label muted size={13}>시작 전에 중량과 횟수를 입력할 수 있습니다.</Label>
            : <View style={s.pageTitle}><Label heading size={page === 'home' ? 26 : 30} bold>{title}</Label><Label muted size={15}>{page === 'home' ? new Date().toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'long'}) : pageDescriptions[page]}</Label></View>}{page === 'home' ? home() : page === 'workout' ? workout() : page === 'library' ? library() : page === 'progress' ? progress() : page === 'body' ? body() : settings()}</ScrollView>}{/* Only the tab box floats over the screen. The surrounding space remains part of the content. */}
    <View pointerEvents="box-none" style={[s.navFrame,{bottom:tabBottom}]}><Surface role="navigation"
        accessibilityRole="tablist" pointerEvents="box-none" style={s.nav}
        onLayout={event=>setTabBoxHeight(event.nativeEvent.layout.height)}>{tabs.map(([key, label]) => { const selected = page === key || (page === 'body' && key === 'progress'); return <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected }} accessibilityLabel={label} onPress={() => setPage(key)} pressRetentionOffset={tabPressBounds} style={[s.navItem, { backgroundColor: selected ? colors.soft : 'transparent' }]}><TabIcon name={key} active={selected}/><Label size={11} bold={selected} muted={!selected}>{label}</Label></Pressable>; })}</Surface></View>{Platform.OS === 'ios' && <InputAccessoryView nativeID="form-keyboard-done">
        <View style={[s.accessoryBar,{backgroundColor:colors.solid,borderColor:colors.line}]}>
            <Pressable accessibilityRole="button" accessibilityLabel="키보드 완료" onPress={() => Keyboard.dismiss()} style={s.inlineLink}>
                <Label bold size={15} style={{color:colors.accent}}>완료</Label></Pressable>
        </View>
    </InputAccessoryView>}
    <Modal visible={!!modal} transparent animationType="slide" onRequestClose={() => setModal(null)}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}><SafeAreaView edges={['bottom']} accessibilityViewIsModal style={[s.modal,{backgroundColor:colors.solid}]}><View style={[s.sheetGrip,{backgroundColor:colors.line}]}/><View style={s.spread}><Label heading bold size={18} style={s.flex}>{({ start: '어떤 운동을 할까요?', routine: modal?.item ? '루틴 편집' : '새 루틴', exercise: '운동 자세 가이드', body: '인바디 기록', history: '운동 상세', add: '운동 추가', 'custom-exercise': '사용자 운동 등록', substitute: '대체 운동', plates: '원판 계산기' } as any)[modal?.type ?? '']}</Label><Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={() => setModal(null)} style={s.close}><Label size={24}>×</Label></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 17, paddingBottom: 22 }}>{modal?.type === 'custom-exercise' && <CustomExerciseForm onSave={entry => run(async () => {
    await change(x => ({...x, customExercises: [...(x.customExercises ?? []), entry]}));
    setModal(null);
})}/>} {modal?.type === 'plates' && <PlateCalculator initialKg={modal.item?.weight ?? 0}/>} {modal?.type === 'substitute' && (() => {
                const detail = exercises.find(e => e.id === modal.item?.exerciseId);
                const candidates = substitutionCandidates(exercises, detail, state.active);
                return <>
                    <Label muted size={13}>{detail ? `${detail.name} 대신 같은 부위(${detail.muscle})에서 고르세요. 완료 체크는 풀리고 세트 수는 유지됩니다.` : '대체할 운동을 고르세요.'}</Label>
                    {candidates.length ? candidates.map(item => <ExerciseRow key={item.id} exercise={item} onPress={() => run(async () => {
                        await patchActive(x => replaceExercise(x, modal.item.exerciseId, item, state.history));
                        setModal(null);
                    })}/>) : <Empty text="같은 부위의 다른 운동을 찾지 못했습니다."/>}
                </>;
            })()} {modal?.type === 'start' && <>
                <Label muted size={13}>고른 루틴은 준비 화면에서 열립니다. 타이머는 ‘운동 시작’을 눌렀을 때 시작합니다.</Label>
                {[...recommendedRoutines(state.routines), ...state.routines.filter(r => r.recommended === false)].map(r => <Button key={r.id} secondary
                    title={`${r.name}${r.recommended === false ? ' · 추천 제외' : ''}`} onPress={() => run(async () => { await start(r.name, r.ids); setModal(null); })}/>)}
                <Button secondary title="자유 운동으로 시작" onPress={() => run(async () => { await prepareBlankWorkout(); setModal(null); })}/>
            </>}{modal?.type === 'exercise' && modal.item && <><Label size={22} bold>{modal.item.name}</Label><Label muted>{modal.item.muscle} · {modal.item.equipment} · {modal.item.level}</Label>{hasMotion(modal.item.id) ? <MotionGuide key={modal.item.id} exerciseId={modal.item.id}/> : <CatalogAnatomy key={modal.item.id} exercise={modal.item}/>}<Section title="운동 방법"/>{modal.item.steps.map((step: string, i: number) => <View key={i} style={[s.exerciseRow,{borderColor:colors.line}]}><Label bold style={{color:colors.accent}}>{i+1}</Label><Label style={s.flex}>{step}</Label></View>)}<Glass><Label bold>자세 체크</Label><Label>{modal.item.caution}</Label><Label muted size={13}>통증이 나면 중단하고 전문가에게 자세를 확인하세요.</Label></Glass>{modal.fromPicker && <Button secondary title="운동 목록으로 돌아가기" onPress={()=>setModal({type:'add'})}/>}<Button title={modal.fromPicker ? '이 운동 추가' : '이 운동 기록하기'} onPress={() => run(async () => { if (!state.active)
        await start(modal.item.name, [modal.item.id]);
    else
        await addExercise(modal.item); setModal(null); setPage('workout'); })}/><Pressable accessibilityRole="button" accessibilityState={{selected:favorites.includes(modal.item.id)}} accessibilityLabel="이 운동 즐겨찾기" style={s.inlineLink} onPress={()=>run(async()=>{await change(x=>({...x,favorites:toggleFavorite(x.favorites ?? [],modal.item.id)}));})}><Label size={13} muted={!favorites.includes(modal.item.id)}>{favorites.includes(modal.item.id)?'★ 즐겨찾기 해제':'☆ 즐겨찾기에 추가'}</Label></Pressable></>}{modal?.type === 'add' && <ExercisePicker items={exercises} onPick={e => setModal({type:'exercise', item:e, fromPicker:true})}/>} {modal?.type === 'routine' && <RoutineForm items={exercises} item={modal.item} onSave={commitRoutine}
                onDelete={modal.item ? () => confirmDeleteRoutine(modal.item, true) : undefined}/>} {modal?.type === 'body' && <BodyForm item={modal.item} lastHeight={state.body.find(entry => entry.height)?.height ?? null} onSave={entry => run(async () => { await change(x => ({ ...x, body: [{...entry, revision: nextBodyRevision(x.body.find(v => v.id === entry.id))}, ...x.body.filter(v => v.id !== entry.id)] })); setModal(null); })} onExport={entry => run(async () => { await exportBody(entry); Alert.alert('건강 데이터로 저장했습니다'); })}/>} {modal?.type === 'history' && <><Label size={22} bold>{modal.item.name}</Label><Label muted>{dateText(modal.item.startedAt)}</Label>{modal.item.exercises.map((e: any) => <View key={e.id}><Label bold>{e.name}</Label>{e.sets.filter((x: any) => x.done).map((x: any, i: number) => <Label key={x.id} muted>{i + 1}세트 · {e.type === 'strength' ? `${displayWeight(x.weight)} ${unit} × ${x.reps}회` : `${x.seconds}초`} {x.kind === 'warmup' ? '워밍업' : ''}</Label>)}{e.note && <Label>{e.note}</Label>}</View>)}{(!modal.item.external || modal.item.sync === 'watch') && <Button title="건강 앱에 운동 내보내기" onPress={() => run(async () => { await exportWorkout(modal.item); Alert.alert('운동을 내보냈습니다'); })}/>}<Button secondary title="같은 구성으로 다시 운동" onPress={() => run(async () => { await start(modal.item.name, modal.item.exercises.map((x: any) => x.id)); setModal(null); })}/><Button secondary danger title="이 기록 삭제" onPress={() => Alert.alert('기록 삭제', '건강 앱으로 내보낸 기록은 별도로 남아 있습니다.', [{ text: '취소' }, { text: '삭제', style: 'destructive', onPress: () => run(async () => { await change(x => ({ ...x, history: x.history.filter(h => h.id !== modal.item.id) })); setModal(null); }) }])}/></>}</ScrollView></SafeAreaView></KeyboardAvoidingView></Modal></SafeAreaView>;
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
/** 지표 타일은 디자인 시스템의 MetricTile 하나만 씁니다(높이·여백·숫자 정렬 동일). */
function Metric({ label, value, unit }: {
    label: string;
    value: string | number;
    unit: string;
}) { return <MetricTile label={label} value={value} unit={unit}/>; }
function Empty({ text }: {
    text: string;
}) { return <Glass style={{ paddingVertical: 35 }}><Label muted style={{ textAlign: 'center' }}>{text}</Label></Glass>; }
function Chip({ title, active, onPress }: {
    title: string;
    active: boolean;
    onPress: () => void;
}) { const { colors } = useTheme(); return <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[s.chip, { backgroundColor: active ? colors.accentBase : colors.soft }]}><Label size={13} style={{ color: active ? colors.accent : colors.ink, fontWeight:active?'700':'500' }}>{title}</Label></Pressable>; }
function Input({ value, onChangeText, placeholder, numeric = false, search = false }: {
    value: string;
    onChangeText: (v: string) => void;
    placeholder: string;
    numeric?: boolean;
    search?: boolean;
}) { const { colors } = useTheme(); return <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={numeric ? 'decimal-pad' : 'default'} returnKeyType={search?'search':'done'} autoCorrect={!search && !numeric} inputAccessoryViewID={numeric && Platform.OS === 'ios' ? 'form-keyboard-done' : undefined} style={[s.input,{color:colors.ink,borderColor:colors.line,backgroundColor:colors.solid}]}/>; }
/** 숫자 입력은 포커스 이동·키보드 닫기·잠깐 멈춤 어느 쪽에서도 값을 잃지 않게 커밋 지점을 여러 개 둡니다.
 *  준비 화면(IMG_9256)에서 2세트를 고치고 바로 `운동 시작`이나 다른 세트를 눌러도 입력값이 사라지지 않습니다. */
function Numeric({ value, label, onChange }: {
    value: number;
    label: string;
    onChange: (n: number) => void;
}) {
    const { colors } = useTheme();
    const format = (n: number) => String(Math.round(n * 100) / 100);
    const [text, setText] = useState(format(value));
    const focused = useRef(false);
    const typed = useRef(format(value));
    const sent = useRef(value);
    const pause = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (focused.current) return;
        setText(format(value));
        typed.current = format(value);
        sent.current = value;
    }, [value]);
    /** 빈 칸은 입력 중일 수 있으므로 blur에서만 되돌립니다. */
    function commit(revertEmpty = true) {
        const source = typed.current.trim();
        if (source === '') {
            if (revertEmpty) { setText(format(value)); typed.current = format(value); }
            return;
        }
        const parsed = Number(source.replace(',', '.'));
        if (!Number.isFinite(parsed) || parsed < 0) { setText(format(value)); typed.current = format(value); return; }
        if (Math.abs(parsed - sent.current) > 1e-9) { sent.current = parsed; onChange(parsed); }
    }
    const commitRef = useRef(commit);
    commitRef.current = commit;
    useEffect(() => {
        const subscription = Keyboard.addListener('keyboardDidHide', () => { if (focused.current) commitRef.current(); });
        return () => { subscription.remove(); if (pause.current) clearTimeout(pause.current); };
    }, []);
    return <TextInput accessibilityLabel={label} value={text} selectTextOnFocus keyboardType="decimal-pad" returnKeyType="done" inputAccessoryViewID={Platform.OS === 'ios' ? 'form-keyboard-done' : undefined}
        onFocus={() => { focused.current = true; }}
        onChangeText={next => { typed.current = next; setText(next); if (pause.current) clearTimeout(pause.current);
            pause.current = setTimeout(() => commitRef.current(false), 700); }}
        onEndEditing={() => commit()}
        onSubmitEditing={() => commit()}
        onBlur={() => { if (pause.current) clearTimeout(pause.current); focused.current = false; commit(); }}
        style={[s.input, s.flex, { color: colors.ink, borderColor: colors.line, textAlign: 'center' }]}/>;
}
/** RPE는 선택 입력입니다. 유효한 1~10 소수만 저장하고, 잘못된 입력은 직전 값으로 되돌립니다. */
function RpeInput({value,label,onChange}: {value:string;label:string;onChange:(rpe:string)=>void}) {
    const {colors} = useTheme();
    const [text,setText] = useState(value);
    useEffect(()=>{setText(value);},[value]);
    function commit(){
        try { const next=parseRpe(text); onChange(next); setText(next); }
        catch { setText(value); }
    }
    return <TextInput accessibilityLabel={label} value={text} keyboardType="decimal-pad" placeholder="RPE" placeholderTextColor={colors.muted} inputAccessoryViewID={Platform.OS === 'ios' ? 'form-keyboard-done' : undefined}
        onChangeText={setText} onEndEditing={commit} onBlur={commit} style={[s.rpeInput,{color:colors.ink,borderColor:colors.line}]}/>;
}
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
function ExerciseRow({exercise,onPress,favorite=false,onFavorite}: {exercise:Exercise;onPress:()=>void;favorite?:boolean;onFavorite?:()=>void}) {
    const {colors} = useTheme();
    return <Pressable accessibilityRole="button" accessibilityLabel={exercise.name} accessibilityHint={`${exercise.muscle}, ${exercise.equipment}`} onPress={onPress}
        style={({pressed})=>[s.exerciseRow,{borderColor:colors.line,backgroundColor:pressed?colors.soft:'transparent'}]}>
        <View style={s.flex}><Label size={15} bold>{exercise.name}</Label>
            <Label size={13} muted>{exercise.muscle} · {exercise.equipment}</Label></View>
        {onFavorite && <Pressable accessibilityRole="button" accessibilityState={{selected:favorite}} accessibilityLabel={`${exercise.name} 즐겨찾기`} onPress={onFavorite} style={s.inlineLink}>
            <Label size={20} style={{color:favorite?colors.accent:colors.muted}}>{favorite?'★':'☆'}</Label></Pressable>}
        <Label size={13} bold style={{color:colors.accent}}>{hasMotion(exercise.id) ? '3D 자세' : '3D 근육'}</Label>
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
            <Label muted size={11}>{p.label}</Label>
        </View>)}
    </View>;
}
/** 루틴 만들기와 고치기를 한 화면에서 합니다. 이름 직접 입력, 운동 추가·제외, 추천 포함 여부, 삭제까지 제공합니다. */
function RoutineForm({ item, onSave, onDelete, items }: {
    items: Exercise[];
    item?: any;
    onSave: (r: any) => void;
    onDelete?: () => void;
}) {
    const [name, setName] = useState(item?.name || '');
    const [ids, setIds] = useState<string[]>(item?.ids || []);
    const [recommended, setRecommended] = useState(item?.recommended !== false);
    const [subtitle, setSubtitle] = useState(item?.subtitle || '나만의 트레이닝');
    const [q, setQ] = useState('');
    const selected = ids.map(id => items.find(e => e.id === id)).filter(Boolean) as Exercise[];
    return <>
        <View style={{ gap: 6 }}><Label size={13} muted>루틴 이름 (직접 입력)</Label>
            <Input value={name} onChangeText={setName} placeholder="예: 월요일 상체"/></View>
        <View style={{ gap: 6 }}><Label size={13} muted>한 줄 설명</Label>
            <Input value={subtitle} onChangeText={setSubtitle} placeholder="나만의 트레이닝"/></View>
        <View style={s.spread}>
            <View style={s.flex}><Label bold size={15}>추천 루틴에 포함</Label>
                <Label muted size={13}>홈의 추천 루틴 카드에 이 루틴을 보여줍니다.</Label></View>
            <Switch accessibilityLabel="추천 루틴에 포함" value={recommended} onValueChange={setRecommended}/>
        </View>
        <View style={s.spread}>
            <Label muted style={s.flex}>{ids.length}개 선택 · 선택한 순서로 진행</Label>
            <Button title={item ? '루틴 수정' : '루틴 저장'} disabled={!name.trim() || !ids.length}
                onPress={() => { try { onSave(normalizeRoutine({ id: item?.id, name, subtitle, ids, recommended })); } catch (error) { Alert.alert('루틴을 확인하세요', errorText(error)); } }}/>
        </View>
        {selected.length > 0 && <View style={{ gap: 4 }}>
            <Label size={13} bold>선택한 운동</Label>
            {selected.map((exercise, index) => <View key={exercise.id} style={s.spread}>
                <Label size={13} style={s.flex}>{index + 1}. {exercise.name}</Label>
                <Pressable accessibilityRole="button" accessibilityLabel={`${exercise.name} 빼기`} style={s.inlineLink}
                    onPress={() => setIds(x => x.filter(value => value !== exercise.id))}><Label size={13} muted>빼기</Label></Pressable>
            </View>)}
        </View>}
        <View style={{ gap: 6 }}><Label size={13} muted>운동 추가</Label>
            <Input value={q} onChangeText={setQ} placeholder="운동 검색" search/></View>
        <View style={[s.row, { flexWrap: 'wrap' }]}>
            {items.filter(e => matchesExercise(e, q)).slice(0, 40).map(e => <Chip key={e.id} title={`${ids.includes(e.id) ? '✓ ' : ''}${e.name}`} active={ids.includes(e.id)}
                onPress={() => setIds(x => x.includes(e.id) ? x.filter(v => v !== e.id) : [...x, e.id])}/>)}
        </View>
        {onDelete && <Button secondary danger title="이 루틴 삭제" onPress={onDelete}/>}
        <Label muted size={13}>기본으로 들어 있는 루틴도 이름·운동·추천 포함 여부를 바꾸거나 삭제할 수 있습니다. 삭제해도 저장된 운동 기록은 남습니다.</Label>
    </>;
}

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
        <Label muted size={13}>직접 등록한 운동입니다. 통증이 있으면 중단하고 전문가에게 자세를 확인하세요.</Label>
        <Button title="사용자 운동 저장" disabled={!name.trim() || !steps.trim()} onPress={()=>{
            try { onSave(validateCustomExercise({name,muscle,equipment,type,steps:steps.split('|'),caution}) as Exercise); }
            catch(error) { Alert.alert('입력 확인',errorText(error)); }
        }}/>
    </>;
}

/** 인바디는 수동 등록 및 결과지 첨부. OCR이나 제조사 계정 연동으로 오인하지 않게 합니다. */
function BodyForm({ item, lastHeight, onSave, onExport }: {
    item?: BodyEntry;
    lastHeight?: number | null;
    onSave: (e: BodyEntry) => void;
    onExport: (e: BodyEntry) => void;
}) { const [form, setForm] = useState<any>({ ...item, date: localDateInput(item?.date ?? new Date()), weight: item?.weight?.toString() || '', height: item?.height?.toString() || (lastHeight ? String(lastHeight) : ''), photo: item?.photo || null });
    const [inbodyText, setInbodyText] = useState('');
    /** 읽어 낸 항목만 채우고, 저장 전에 사용자가 확인합니다. */
    function applyInbody(text: string, source: string) {
        const parsed = parseInbodyText(text);
        if (!parsed.count) { Alert.alert('수치를 찾지 못했습니다', '인바디 결과지의 신장·체중·골격근량·체지방률이 보이는지 확인하거나, 인바디 앱에서 수치를 복사해 붙여넣어 주세요.'); return; }
        setForm((x: any) => ({ ...x,
            height: parsed.height ? String(parsed.height) : x.height,
            weight: parsed.weight ? String(parsed.weight) : x.weight,
            muscle: parsed.muscle ? String(parsed.muscle) : x.muscle,
            bodyFat: parsed.bodyFat ? String(parsed.bodyFat) : x.bodyFat }));
        Alert.alert('인바디 정보를 채웠습니다', `${source}에서 ${parsed.count}개 항목을 입력했습니다. 저장 전에 값을 확인하세요.`);
    } function field(key: string, label: string) { return <View key={key} style={{ gap: 6 }}><Label size={13} muted>{label}</Label><Input placeholder={label} numeric={key !== 'date' && key !== 'note'} value={String(form[key] ?? '')} onChangeText={value => setForm((x: any) => ({ ...x, [key]: value }))}/></View>; } return <>{[['date', '측정일 (YYYY-MM-DD)'], ['weight', '체중 (kg) · 필수'], ['muscle', '골격근량 (kg)'], ['bodyFat', '체지방률 (%)'], ['height', '키 (cm)'], ['waist', '허리둘레 (cm)'], ['visceralFat', '내장지방 레벨'], ['bmr', '기초대사량 (kcal)'], ['note', '메모']].map(([key, label]) => field(key, label))}<Button secondary title="인바디 스크린샷으로 자동 입력" onPress={async () => { try {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: .9 });
    if (result.canceled) return;
    const text = await Device.recognizeText(result.assets[0].uri).catch(() => '');
    applyInbody(text, '스크린샷');
} catch (e) { Alert.alert('스크린샷을 읽지 못했습니다', errorText(e)); } }}/><View style={{ gap: 6 }}><Label size={13} muted>인바디 앱에서 복사한 텍스트</Label><Input placeholder="예: 체중 72.4kg 골격근량 33.2kg 체지방률 17.7%" value={inbodyText} onChangeText={setInbodyText}/><Button secondary title="붙여넣은 텍스트로 자동 입력" onPress={() => applyInbody(inbodyText, '붙여넣은 텍스트')}/></View><Button secondary title="결과지 사진 첨부" onPress={async () => { try {
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
} }}/>{form.photo && <Image source={{ uri: form.photo }} style={{ height: 230, borderRadius: 15 }} resizeMode="contain"/>}<Label muted size={11}>수치는 직접 입력하거나, 인바디 스크린샷·복사한 텍스트로 채운 뒤 저장 전에 확인하세요. 키는 최근 기록에서 자동으로 채워집니다. 인바디 계정 자동 연동은 제공하지 않습니다.</Label><Button title="기록 저장" onPress={() => { try {
    onSave(validateBody({ ...form, date: measurementDate(form.date) }) as BodyEntry);
}
catch (e) {
    Alert.alert('입력 확인', errorText(e));
} }}/>{item && <Button secondary title="저장된 체중·체지방을 건강 앱에 내보내기" onPress={() => onExport(item)}/>}</>; }
const tabPressBounds = {top:0,right:0,bottom:0,left:0};
/** 0.3.7 공통 배치 — 화면 여백 20, 섹션 간격 20, 카드 안 12·16.
 *  높이는 36(필·아이콘) · 44(보조 컨트롤) · 48(입력) · 52(기본 버튼)만 쓰고,
 *  반경은 tokens의 사다리(card 24 · inner 16 · small 12 · pill 999)에서만 가져옵니다. */
const s = StyleSheet.create({
    workoutHeader:{paddingHorizontal:geometry.screenPadding,paddingBottom:12,gap:12},
    headerActions:{flexDirection:'row',gap:12},
    headerStatus:{flexDirection:'row',alignItems:'center',gap:12},
    statusPill:{minHeight:28,paddingHorizontal:12,paddingVertical:4,borderRadius:radius.pill,...squircle},
    cardHeader:{flexDirection:'row',alignItems:'center',gap:12},
    nameRow:{flexDirection:'row',alignItems:'center',gap:8},
    iconButton:{width:geometry.iconButton,height:geometry.iconButton,borderRadius:radius.pill,alignItems:'center',justifyContent:'center'},
    toolbar:{flexDirection:'row',flexWrap:'wrap',gap:geometry.tightGap}, // ToolRow가 대신 쓰므로 화면에서는 쓰지 않습니다.
    supersetBadge:{alignSelf:'flex-start'},
    reco:{gap:geometry.sm,borderRadius:radius.inner,paddingHorizontal:geometry.md,paddingVertical:geometry.md,...squircle},
    recoHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:geometry.md},
    recoDetail:{flexShrink:1},
    setHead:{flexDirection:'row',alignItems:'center',gap:geometry.tightGap,paddingTop:geometry.xs},
    setRow:{flexDirection:'row',alignItems:'center',gap:geometry.tightGap},
    setIndex:{width:28,textAlign:'center',fontVariant:['tabular-nums']},
    setCenter:{textAlign:'center'},
    setCheckCell:{width:48},
    prevHint:{paddingLeft:36,fontVariant:['tabular-nums']},
    setList:{gap:geometry.md},
    setMeta:{flexDirection:'row',alignItems:'center',gap:geometry.tightGap,paddingTop:geometry.xs},
    setMetaCell:{flex:1,minWidth:0},
    collapsedRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:geometry.md},
    accessoryBar:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',paddingHorizontal:geometry.tightGap,borderTopWidth:StyleSheet.hairlineWidth},
    togglePill:{flexDirection:'row',alignItems:'center',gap:8,minHeight:36,paddingHorizontal:12,borderRadius:radius.pill,borderWidth:1,...squircle},
    outlineBar:{minHeight:44,borderRadius:radius.inner,borderWidth:1,paddingHorizontal:geometry.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',...squircle},
    settingStepperRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
    stepper:{flexDirection:'row',alignItems:'center',gap:geometry.tightGap},
    stepperButton:{width:48,height:48,borderRadius:radius.inner,alignItems:'center',justifyContent:'center',...squircle},
    stepperValue:{alignItems:'center',justifyContent:'center'},
    pageTitle:{gap:geometry.xs},
    group:{gap:geometry.md},
    listCard:{paddingHorizontal:geometry.lg,paddingVertical:geometry.tightGap,gap:0},
    exerciseRow:{flexDirection:'row',alignItems:'center',minHeight:64,paddingHorizontal:geometry.tightGap,paddingVertical:12,gap:geometry.md,borderBottomWidth:StyleSheet.hairlineWidth},
    metrics:{flexDirection:'row',flexWrap:'wrap',gap:geometry.md},
    figure:{fontVariant:['tabular-nums']},
    chart:{flexDirection:'row',alignItems:'flex-end',minHeight:96,gap:geometry.xs},
    barColumn:{flex:1,minWidth:0,alignItems:'center',gap:geometry.tightGap},
    bar:{width:'70%',borderRadius:geometry.xs},
    bodyPhoto:{height:150,borderRadius:radius.inner},
    editRoutine:{alignSelf:'flex-end'},
    routineActions:{flexWrap:'wrap',alignItems:'center'},
    sheetGrip:{width:36,height:4,borderRadius:2,alignSelf:'center'},
    periodWrap:{width:136},
    periodSwitch:{gap:geometry.tightGap},
    periodButton:{flex:1,minHeight:44,borderRadius:radius.small,alignItems:'center',justifyContent:'center',...squircle},
    volumeSummary:{borderTopWidth:StyleSheet.hairlineWidth,paddingTop:12,gap:geometry.xs},
    navFrame:{position:'absolute',left:0,right:0,paddingHorizontal:geometry.screenPadding,alignItems:'center',zIndex:1},
    screen:{flex:1},
    loading:{flex:1,justifyContent:'center',alignItems:'center',gap:geometry.xl,padding:geometry.xxl,backgroundColor:'#F4F4F5'},
    header:{minHeight:48,paddingHorizontal:geometry.screenPadding,paddingVertical:geometry.xs,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
    content:{padding:geometry.screenPadding,paddingTop:12,gap:geometry.sectionGap,paddingBottom:32,maxWidth:740,width:'100%',alignSelf:'center'},
    row:{flexDirection:'row',gap:geometry.md,alignItems:'center'},
    spread:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:geometry.md},
    flex:{flex:1},
    hero:{borderRadius:radius.card,padding:geometry.cardPadding,gap:geometry.md,...squircle},
    track:{height:8,borderRadius:4,overflow:'hidden'},
    weekDays:{flexDirection:'row',justifyContent:'space-between',gap:0},
    inlineLink:{minHeight:44,justifyContent:'center',paddingHorizontal:geometry.tightGap},
    day:{flex:1,minWidth:0,minHeight:60,paddingVertical:geometry.xs,borderRadius:radius.inner,gap:geometry.xs,alignItems:'center',justifyContent:'center',...squircle},
    dayCircle:{width:'94%',maxWidth:36,aspectRatio:1,borderRadius:radius.pill,alignItems:'center',justifyContent:'center'},
    play:{width:48,height:48,borderRadius:radius.inner,alignItems:'center',justifyContent:'center',...squircle},
    nav:{width:'100%',maxWidth:740,borderWidth:1,padding:geometry.navPadding,gap:0,flexDirection:'row'},
    navItem:{alignItems:'center',justifyContent:'center',gap:geometry.xs,minHeight:52,flex:1,borderRadius:geometry.navItemRadius,...squircle},
    input:{minHeight:48,borderWidth:1,borderRadius:radius.inner,paddingHorizontal:12,paddingVertical:10,fontSize:15,fontVariant:['tabular-nums'],...squircle},
    check:{width:48,height:48,borderRadius:radius.inner,alignItems:'center',justifyContent:'center',...squircle},
    rest:{padding:12,borderRadius:radius.inner,flexDirection:'row',alignItems:'center',justifyContent:'space-between',...squircle},
    chip:{paddingHorizontal:14,paddingVertical:8,borderRadius:radius.pill,minHeight:36,justifyContent:'center',...squircle},
    badge:{paddingHorizontal:12,paddingVertical:geometry.xs,borderRadius:radius.pill,alignItems:'center',justifyContent:'center',...squircle},
    rpeInput:{width:'100%',minHeight:36,borderWidth:1,borderRadius:radius.pill,paddingHorizontal:12,paddingVertical:geometry.xs,fontSize:12,textAlign:'center',...squircle},
    modalOverlay:{flex:1,backgroundColor:'#00000080',justifyContent:'flex-end'},
    modal:{maxHeight:'92%',padding:geometry.xxl,paddingBottom:20,borderTopLeftRadius:radius.sheet,borderTopRightRadius:radius.sheet,gap:geometry.xl,...squircle},
    close:{minWidth:48,minHeight:48,alignItems:'center',justifyContent:'center'},
});
