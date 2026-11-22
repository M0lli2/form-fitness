import React, {useEffect,useRef,useState} from 'react';
import {Alert,Pressable,ScrollView,StyleSheet,TextInput,useWindowDimensions,View} from 'react-native';
import {Action,FormText,Surface} from './Primitives';
import {useFormTheme} from './Theme';
import {displayMass,parseMass,parseSetInput,remainingSeconds} from './policy.mjs';
import {parseRpe} from '../core.mjs';
import {massStep} from '../workout-features.mjs';

export type FocusedSet={id:string;weight:number;reps:number;done:boolean;kind?:string;rpe?:string};
export type FocusedExercise={
  id:string;name:string;muscle:string;equipment:string;position:number;total:number;
  previous:string|null;sets:FocusedSet[];note?:string;superset?:string|null;
  previousSets?:{weight:number;reps:number}[]|null;
};
type Value={weight:number;reps:number};
type Props={
  exercise:FocusedExercise;
  units:'kg'|'lb';
  elapsedSeconds:number;
  paused:boolean;
  now:number;
  restDeadline:number|null;
  restSeconds:number;
  suggestedRest:number|null;
  recommendationText:string|null;
  goal:'strength'|'hypertrophy'|'endurance';
  onGoalChange:(goal:'strength'|'hypertrophy'|'endurance')=>void;
  guide:React.ReactNode;
  onComplete:(setId:string,values:Value,rpe:string)=>Promise<void>;
  onSkipRest:()=>void;
  onRestChange:(value:number)=>void;
  onRestNudge:(delta:number)=>void;
  onAddSet:()=>void;
  onApplyRecommendation:()=>void;
  onOpenList:()=>void;
  onOpenGuide:()=>void;
  onNext:()=>void;
  onSetKind:(setId:string)=>void;
  onDeleteSet:(setId:string)=>void;
  onNoteChange:(note:string)=>void;
  onMove:(direction:-1|1)=>void;
  onSubstitute:()=>void;
  onToggleSuperset:()=>void;
  onOpenPlates:(weightKg:number)=>void;
};
const time=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const GOALS=[['strength','스트렝스'],['hypertrophy','근비대'],['endurance','근지구력']] as const;
const KIND_LABEL:Record<string,string>={normal:'일반',warmup:'워밍업',drop:'드롭'};

/**
 * '한 운동에 집중' 화면. 상시 노출은 세트 완료와 휴식 타이머로 좁히고,
 * 훈련 목적·휴식 상세는 접이식 세부 설정으로 옮겼습니다(0.3.5).
 * 한 손으로 중량·횟수를 조절하고, 아래 세트를 눌러 완료 세트를 고치거나 다음 세트로 옮겨 갑니다.
 */
export function FocusedWorkout(props:Props){
  const {palette}=useFormTheme();
  const {fontScale}=useWindowDimensions();
  const [weight,setWeight]=useState(''),[reps,setReps]=useState(''),[rpe,setRpe]=useState('');
  const [restText,setRestText]=useState(String(props.restSeconds));
  const [controlsOpen,setControlsOpen]=useState(true);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [presetsOpen,setPresetsOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [memo,setMemo]=useState(props.exercise.note ?? '');
  const lock=useRef(false);
  const sets=props.exercise.sets;
  const pending=sets.find(set=>!set.done) ?? null;
  const selected=sets.find(set=>set.id===selectedId) ?? pending ?? sets[0] ?? null;
  const rest=props.restDeadline===null?0:remainingSeconds(props.restDeadline,props.now);
  const hint=(set:FocusedSet)=>props.exercise.previousSets?.[sets.indexOf(set)] ?? null;

  useEffect(()=>{setRestText(String(props.restSeconds));},[props.restSeconds]);
  useEffect(()=>{setMemo(props.exercise.note ?? '');},[props.exercise.id]);
  // 완료한 세트는 다음 미완료 세트로 자동 이동합니다. 사용자가 완료 세트를 직접 누를 때는 그대로 둡니다.
  const doneKey=sets.map(set=>set.id+(set.done?'1':'0')).join(',');
  useEffect(()=>{
    if(selectedId && sets.find(set=>set.id===selectedId)?.done && pending) setSelectedId(pending.id);
  },[doneKey,props.exercise.id]);
  useEffect(()=>{
    if(!selected)return;
    setWeight(String(displayMass(selected.weight,props.units)));
    setReps(String(selected.reps));
    setRpe(String(selected.rpe ?? ''));
  },[selected?.id,selected?.weight,selected?.reps,selected?.rpe,props.units]);

  function nudgeWeight(delta:number){
    const base=Number(String(weight).trim().replace(',','.'))||0;
    const next=Math.max(0,Math.round((base+delta)*100)/100);
    setWeight(String(next));
  }
  function nudgeReps(delta:number){
    const base=Number(String(reps).trim())||0;
    setReps(String(Math.max(1,Math.round(base+delta))));
  }
  async function complete(){
    if(!selected || props.paused || lock.current)return;
    try{
      const values=parseSetInput(String(parseMass(weight,props.units)),reps);
      const validRpe=parseRpe(rpe);
      lock.current=true;setBusy(true);
      await props.onComplete(selected.id,values,validRpe);
    }catch(error){Alert.alert('세트를 저장하지 못했습니다',error instanceof Error?error.message:String(error));}
    finally{lock.current=false;setBusy(false);}
  }
  const targetKg=Number(String(parseMass(weight || '0',props.units).toFixed(2))) || 0;

  return <View style={[styles.root,{backgroundColor:palette.canvas}]}>
    <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <FormText variant="label" accessibilityLabel="운동 경과 시간">{time(props.elapsedSeconds)}</FormText>
        <FormText variant="caption" secondary>{props.exercise.position} / {props.exercise.total} 운동</FormText>
      </View>
      <FormText variant="title">{props.exercise.name}</FormText>
      <View style={styles.header}>
        <FormText variant="caption" secondary>{props.exercise.muscle} · {props.exercise.equipment}</FormText>
        {props.exercise.superset ? <View style={[styles.badge,{backgroundColor:palette.raised}]}>
          <FormText variant="caption" accessibilityLabel={'슈퍼세트 '+props.exercise.superset}>슈퍼세트 {props.exercise.superset}</FormText></View> : null}
      </View>
      {props.exercise.superset ? <FormText variant="caption" secondary>같은 슈퍼세트 종목과 번갈아 진행합니다. 세트를 마치면 다음 종목으로 넘어갑니다.</FormText> : null}
      <Surface><View accessibilityLabel="운동 동작 안내">{props.guide}</View><Action secondary title="자세·호흡·주의사항" onPress={props.onOpenGuide}/></Surface>
      {props.recommendationText
        ? <View style={[styles.reco,{backgroundColor:palette.raised}]}><FormText variant="caption" secondary style={styles.flexText}>{props.recommendationText}</FormText><Pressable accessibilityRole="button" accessibilityLabel="추천 적용" onPress={props.onApplyRecommendation} style={[styles.chip,{borderColor:palette.line}]}><FormText variant="caption">적용</FormText></Pressable></View>
        : <FormText variant="caption" secondary>{props.exercise.previous ? '지난 기록 '+props.exercise.previous : '첫 기록입니다. 편안한 중량부터 시작하세요.'}</FormText>}
      <Surface style={{gap:12}}>
        <View style={styles.header}>
          <FormText variant="heading">{selected ? String(sets.indexOf(selected)+1)+'번째 세트' : '모든 세트 완료'}</FormText>
          {selected ? <Pressable accessibilityRole="button" accessibilityLabel={props.exercise.name+' '+(sets.indexOf(selected)+1)+'세트 종류'}
            onPress={()=>props.onSetKind(selected.id)} style={[styles.chip,{borderColor:palette.line}]}>
            <FormText variant="caption">{KIND_LABEL[selected.kind ?? 'normal']} ↻</FormText></Pressable> : null}
        </View>
        {selected && <View style={[styles.inputs,fontScale>=1.5 && {flexDirection:'column'}]}>
          <View style={styles.field}>
            <FormText variant="caption" secondary>중량 · {props.units}</FormText>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel={'중량 '+massStep(props.units)+' 줄이기'} onPress={()=>nudgeWeight(-massStep(props.units))} style={[styles.step,{backgroundColor:palette.raised}]}><FormText variant="heading">−</FormText></Pressable>
              <TextInput accessibilityLabel={'현재 세트 중량 '+props.units} keyboardType="decimal-pad" selectTextOnFocus value={weight} onChangeText={setWeight} editable={!busy} style={[styles.input,{color:palette.text,backgroundColor:palette.raised}]}/>
              <Pressable accessibilityRole="button" accessibilityLabel={'중량 '+massStep(props.units)+' 늘리기'} onPress={()=>nudgeWeight(massStep(props.units))} style={[styles.step,{backgroundColor:palette.raised}]}><FormText variant="heading">+</FormText></Pressable>
            </View>
            {hint(selected) ? <FormText variant="caption" secondary style={styles.center}>이전 {displayMass(hint(selected)!.weight,props.units)} {props.units} × {hint(selected)!.reps}</FormText> : null}
          </View>
          <View style={styles.field}>
            <FormText variant="caption" secondary>반복 · 회</FormText>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="횟수 1 줄이기" onPress={()=>nudgeReps(-1)} style={[styles.step,{backgroundColor:palette.raised}]}><FormText variant="heading">−</FormText></Pressable>
              <TextInput accessibilityLabel="현재 세트 반복 횟수" keyboardType="number-pad" selectTextOnFocus value={reps} onChangeText={setReps} editable={!busy} style={[styles.input,{color:palette.text,backgroundColor:palette.raised}]}/>
              <Pressable accessibilityRole="button" accessibilityLabel="횟수 1 늘리기" onPress={()=>nudgeReps(1)} style={[styles.step,{backgroundColor:palette.raised}]}><FormText variant="heading">+</FormText></Pressable>
            </View>
          </View>
        </View>}
        {selected && <View style={styles.header}>
          <FormText variant="caption" secondary>RPE (선택)</FormText>
          <View style={styles.rpeRow}>
            {['7','8','9','10'].map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:rpe===value}} accessibilityLabel={'RPE '+value}
              onPress={()=>setRpe(current=>current===value?'':value)} style={[styles.rpeChip,{borderColor:rpe===value?palette.text:palette.line,backgroundColor:rpe===value?palette.raised:'transparent'}]}>
              <FormText variant="caption" secondary={rpe!==value}>{value}</FormText></Pressable>)}
            <TextInput accessibilityLabel={`${props.exercise.name} ${sets.indexOf(selected)+1}세트 RPE`} keyboardType="decimal-pad" value={rpe} onChangeText={setRpe} placeholder="예: 8.5"
              placeholderTextColor={palette.secondary} style={[styles.rpeInput,{color:palette.text,backgroundColor:palette.raised}]}/>
          </View>
        </View>}
        {sets.map((set,index)=><Pressable key={set.id} accessibilityRole="button" accessibilityState={{selected:selected?.id===set.id}}
          accessibilityLabel={`${props.exercise.name} ${index+1}세트 ${set.done?'완료':'대기'} 기록`} onPress={()=>setSelectedId(set.id)}
          style={[styles.history,{backgroundColor:selected?.id===set.id?palette.raised:'transparent'}]}>
          <FormText variant="caption" secondary>{index+1}세트{set.kind && set.kind!=='normal' ? ' · '+KIND_LABEL[set.kind] : ''}</FormText>
          <View style={styles.flexText}>
            <FormText variant="label" style={{fontVariant:['tabular-nums']}}>{displayMass(set.weight,props.units)} {props.units} × {set.reps}{set.rpe ? ' · RPE '+set.rpe : ''}</FormText>
            {hint(set) ? <FormText variant="caption" secondary>이전 {displayMass(hint(set)!.weight,props.units)} {props.units} × {hint(set)!.reps}</FormText> : null}
          </View>
          <FormText variant="caption" accessibilityLabel={set.done?'완료':'미완료'}>{set.done?'완료':'대기'}</FormText>
          <Pressable accessibilityRole="button" accessibilityLabel={`${props.exercise.name} ${index+1}세트 삭제`} onPress={()=>props.onDeleteSet(set.id)} style={styles.deleteSet}>
            <FormText variant="caption" secondary>×</FormText></Pressable>
        </Pressable>)}
      </Surface>
      <View style={styles.header}>
        <FormText variant="caption" secondary>운동 메모</FormText>
      </View>
      <TextInput accessibilityLabel={`${props.exercise.name} 운동 메모`} value={memo} onChangeText={value=>{setMemo(value);props.onNoteChange(value);}}
        placeholder="자세, 컨디션, 다음 세트를 위한 메모" placeholderTextColor={palette.secondary} multiline
        style={[styles.memo,{color:palette.text,backgroundColor:palette.surface,borderColor:palette.line}]}/>
      <View style={styles.ops}>
        <Pressable accessibilityRole="button" accessibilityLabel="운동 순서 위로" onPress={()=>props.onMove(-1)} style={[styles.op,{borderColor:palette.line}]}><FormText variant="caption">↑ 순서 위</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="운동 순서 아래로" onPress={()=>props.onMove(1)} style={[styles.op,{borderColor:palette.line}]}><FormText variant="caption">↓ 순서 아래</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="대체 운동" onPress={props.onSubstitute} style={[styles.op,{borderColor:palette.line}]}><FormText variant="caption">대체 운동</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={props.exercise.superset?'슈퍼세트 풀기':'슈퍼세트 묶기'} onPress={props.onToggleSuperset} style={[styles.op,{borderColor:palette.line}]}><FormText variant="caption">{props.exercise.superset?'슈퍼세트 풀기':'슈퍼세트 묶기'}</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="원판 계산기" onPress={()=>props.onOpenPlates(targetKg)} style={[styles.op,{borderColor:palette.line}]}><FormText variant="caption">원판 계산</FormText></Pressable>
      </View>
    </ScrollView>
    {controlsOpen ? <Surface role="control" style={styles.controls}>
      <View style={styles.restRow}>
        <View style={styles.restBlock}>
          <FormText variant="micro" secondary>휴식</FormText>
          <FormText variant="subheading" style={styles.figure}>{rest>0?time(rest):'준비'}</FormText>
        </View>
        <View style={styles.restTools}>
          <Pressable accessibilityRole="button" accessibilityLabel="휴식 15초 줄이기" onPress={()=>props.onRestNudge(-15)} style={[styles.chip,{borderColor:palette.line}]}><FormText variant="caption">−15초</FormText></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="휴식 15초 늘리기" onPress={()=>props.onRestNudge(15)} style={[styles.chip,{borderColor:palette.line}]}><FormText variant="caption">+15초</FormText></Pressable>
        </View>
      </View>
      <View style={styles.toolsRow}>
        <View style={styles.restTools}>
          {rest>0 && <Pressable accessibilityRole="button" accessibilityLabel="건너뛰기" onPress={props.onSkipRest} style={[styles.chip,{borderColor:palette.line}]}><FormText variant="caption">건너뛰기</FormText></Pressable>}
          <Pressable accessibilityRole="button" accessibilityState={{expanded:presetsOpen}} accessibilityLabel={presetsOpen?'휴식 프리셋 접기':'휴식 프리셋 열기'}
            onPress={()=>setPresetsOpen(value=>!value)}
            style={[styles.chip,{borderColor:presetsOpen?palette.text:palette.line,backgroundColor:presetsOpen?palette.raised:'transparent'}]}>
            <FormText variant="caption" secondary={!presetsOpen}>휴식 프리셋 {presetsOpen?'▴':'▾'}</FormText></Pressable>
        </View>
        <Pressable accessibilityRole="button" accessibilityState={{expanded:true}} accessibilityLabel="컨트롤 숨기기"
          onPress={()=>setControlsOpen(false)} style={[styles.chip,{borderColor:palette.line}]}>
          <FormText variant="caption" secondary>접기 ▾</FormText></Pressable>
      </View>
      {presetsOpen ? <View style={styles.presetRow}>
        {[60,90,120].map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:props.restSeconds===value}}
          accessibilityLabel={'휴식 '+value+'초'} onPress={()=>props.onRestChange(value)}
          style={[styles.chip,{borderColor:props.restSeconds===value?palette.text:palette.line,backgroundColor:props.restSeconds===value?palette.raised:'transparent'}]}>
          <FormText variant="caption" secondary={props.restSeconds!==value}>{value}초</FormText></Pressable>)}
        {props.suggestedRest!==null && <Pressable accessibilityRole="button" accessibilityState={{selected:props.restSeconds===props.suggestedRest}}
          accessibilityLabel="추천 휴식 적용" onPress={()=>props.onRestChange(props.suggestedRest as number)}
          style={[styles.chip,{borderColor:props.restSeconds===props.suggestedRest?palette.text:palette.line,backgroundColor:props.restSeconds===props.suggestedRest?palette.raised:'transparent'}]}>
          <FormText variant="caption" secondary={props.restSeconds!==props.suggestedRest}>{'추천 '+props.suggestedRest}초</FormText></Pressable>}
        <View style={[styles.restInputWrap,{borderColor:palette.line}]}>
          <TextInput accessibilityLabel="휴식 시간(초)" keyboardType="number-pad" selectTextOnFocus value={restText} onChangeText={setRestText}
            onEndEditing={event=>{const text=event.nativeEvent.text.trim(); if(!text){setRestText(String(props.restSeconds)); return; } const value=Number(text.replace(',','.')); if(Number.isFinite(value))props.onRestChange(value); else setRestText(String(props.restSeconds));}}
            style={[styles.restInput,{color:palette.text}]}/>
          <FormText variant="caption" secondary>초</FormText>
        </View>
      </View> : null}
      <Action title={busy?'저장 중…':pending?(selected?.done?'세트 저장':'세트 완료'):props.exercise.position===props.exercise.total?'운동 결과 확인':'다음 운동'} disabled={busy || props.paused} onPress={pending?complete:props.onNext}/>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="+ 세트 추가" onPress={props.onAddSet} style={[styles.half,{borderColor:palette.line}]}>
          <FormText variant="caption">+ 세트 추가</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="전체 운동 목록" onPress={props.onOpenList} style={[styles.half,{borderColor:palette.line}]}>
          <FormText variant="caption">전체 운동 목록</FormText></Pressable>
      </View>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityState={{expanded:detailsOpen}} accessibilityLabel={detailsOpen?'세부 설정 접기':'세부 설정 열기'}
          onPress={()=>setDetailsOpen(value=>!value)} style={[styles.detailToggle,{flex:1,borderColor:palette.line}]}>
          <FormText variant="caption">{detailsOpen?'세부 설정 접기':'세부 설정 열기'}</FormText>
          <FormText variant="caption" secondary>{detailsOpen?'▴':'▾'}</FormText></Pressable>
        {selected && selected.done && pending && <Pressable accessibilityRole="button" accessibilityLabel="다음 세트로" onPress={()=>setSelectedId(pending.id)} style={[styles.chip,{borderColor:palette.line}]}>
          <FormText variant="caption">다음 세트 ›</FormText></Pressable>}
      </View>
      {detailsOpen ? <View style={styles.details}>
        <FormText variant="micro" secondary>훈련 목적</FormText>
        <View style={styles.header}>
          {GOALS.map(goal => <Pressable key={goal[0]} accessibilityRole="button" accessibilityState={{selected:props.goal===goal[0]}}
            accessibilityLabel={'훈련 목적 '+goal[1]} onPress={()=>props.onGoalChange(goal[0])}
            style={[styles.goal,{borderColor:props.goal===goal[0]?palette.text:palette.line,backgroundColor:props.goal===goal[0]?palette.raised:'transparent'}]}>
            <FormText variant="caption" secondary={props.goal!==goal[0]}>{goal[1]}</FormText></Pressable>)}
        </View>
      </View> : null}
    </Surface> : <Surface role="control" style={styles.compact}>
        {rest>0 && <FormText variant="caption" style={{fontVariant:['tabular-nums']}}>휴식 {time(rest)}</FormText>}
        <Pressable accessibilityRole="button" accessibilityState={{expanded:false}} accessibilityLabel="컨트롤 열기"
          onPress={()=>setControlsOpen(true)} style={[styles.compactButton,{backgroundColor:palette.raised}]}>
          <FormText variant="caption">컨트롤 열기 ▴</FormText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={pending?'세트 완료':'다음 운동'} disabled={busy||props.paused}
          onPress={pending?complete:props.onNext}
          style={[styles.compactButton,styles.compactPrimary,{backgroundColor:palette.action,opacity:(busy||props.paused)?0.55:1}]}>
          <FormText variant="caption" style={{color:palette.onAction}}>{busy?'저장 중…':pending?'세트 완료':'다음 운동'}</FormText></Pressable>
      </Surface>}
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1},scroll:{flex:1},content:{padding:20,gap:14},
  header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},
  inputs:{flexDirection:'row',gap:16},field:{flex:1,gap:8},
  stepper:{flexDirection:'row',alignItems:'center',gap:8},
  step:{width:44,minHeight:56,borderRadius:14,alignItems:'center',justifyContent:'center'},
  input:{flex:1,minHeight:64,borderRadius:14,padding:10,fontSize:30,fontWeight:'600',fontVariant:['tabular-nums'],textAlign:'center'},
  figure:{fontVariant:['tabular-nums']},
  history:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,paddingVertical:9,paddingHorizontal:6,borderRadius:12},
  deleteSet:{minWidth:36,minHeight:36,alignItems:'center',justifyContent:'center'},
  nudge:{minHeight:44,justifyContent:'center',paddingHorizontal:8},
  tightNudge:{minHeight:44,justifyContent:'center',paddingHorizontal:4},
  goal:{flex:1,minHeight:38,alignItems:'center',justifyContent:'center',borderRadius:999,borderWidth:1},
  flexText:{flex:1},
  center:{textAlign:'center'},
  chip:{minHeight:36,paddingHorizontal:12,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center'},
  reco:{flexDirection:'row',alignItems:'center',gap:10,borderRadius:14,paddingHorizontal:12,paddingVertical:10},
  restRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  restBlock:{gap:1},
  restTools:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  toolsRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},
  presetRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},
  restInputWrap:{flexDirection:'row',alignItems:'center',gap:6,minHeight:36,paddingHorizontal:12,borderRadius:999,borderWidth:1},
  restInput:{minWidth:46,minHeight:34,padding:0,fontSize:14,fontWeight:'600',textAlign:'center',fontVariant:['tabular-nums']},
  controls:{marginHorizontal:12,marginBottom:12,gap:10,padding:14},
  half:{flex:1,minHeight:44,borderRadius:12,borderWidth:1,alignItems:'center',justifyContent:'center'},
  detailToggle:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',minHeight:44,paddingHorizontal:14,borderRadius:12,borderWidth:1},
  details:{gap:8},
  compact:{marginHorizontal:12,marginBottom:12,paddingHorizontal:12,paddingVertical:9,flexDirection:'row',alignItems:'center',justifyContent:'flex-end',gap:8},
  compactButton:{minHeight:44,minWidth:44,paddingHorizontal:14,borderRadius:12,alignItems:'center',justifyContent:'center'},
  compactPrimary:{paddingHorizontal:18},
  badge:{paddingHorizontal:10,paddingVertical:4,borderRadius:999},
  rpeRow:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'flex-end',flex:1},
  rpeChip:{minWidth:40,minHeight:36,alignItems:'center',justifyContent:'center',borderRadius:999,borderWidth:1},
  rpeInput:{width:78,minHeight:36,borderRadius:999,paddingHorizontal:10,fontSize:13,textAlign:'center'},
  memo:{minHeight:66,borderWidth:1,borderRadius:14,padding:12,fontSize:14,textAlignVertical:'top'},
  ops:{flexDirection:'row',flexWrap:'wrap',gap:6},
  op:{minHeight:36,paddingHorizontal:12,borderRadius:999,borderWidth:1,alignItems:'center',justifyContent:'center'},
});
