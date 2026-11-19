import React, {useEffect,useRef,useState} from 'react';
import {Alert,ScrollView,StyleSheet,TextInput,useWindowDimensions,View} from 'react-native';
import {Action,FormText,Surface} from './Primitives';
import {useFormTheme} from './Theme';
import {parseSetInput,remainingSeconds,displayMass,parseMass} from './policy.mjs';

export type FocusedSet={id:string;weight:number;reps:number;done:boolean};
export type FocusedExercise={
  id:string;name:string;muscle:string;equipment:string;position:number;total:number;
  previous:string|null;sets:FocusedSet[];
};
type Props={
  exercise:FocusedExercise;
  units:'kg'|'lb';
  elapsedSeconds:number;
  paused:boolean;
  now:number;
  restDeadline:number|null;
  guide:React.ReactNode;
  onComplete:(setId:string,values:{weight:number;reps:number})=>Promise<void>;
  onSkipRest:()=>void;
  onOpenList:()=>void;
  onOpenGuide:()=>void;
  onNext:()=>void;
};
const time=(s:number)=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');

/**
 * Planfit 공개 화면에서 확인한 '한 운동에 집중' 구조를 채택한다.
 * 상태 저장·워치 ACK는 호출자가 담당하며, 저장 성공 전에는 완료로 표시하지 않는다.
 * guide는 라이선스를 확보한 자체 콘텐츠를 주입한다. 경쟁사 영상을 번들하지 않는다.
 */
export function FocusedWorkout(props:Props){
  const {palette}=useFormTheme();
  const {fontScale}=useWindowDimensions();
  const [weight,setWeight]=useState(''),[reps,setReps]=useState('');
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const current=props.exercise.sets.find(set=>!set.done);
  const rest=props.restDeadline===null?0:remainingSeconds(props.restDeadline,props.now);

  useEffect(()=>{setWeight(current ? String(displayMass(current.weight,props.units)) : '');setReps(current ? String(current.reps) : '');},[current?.id,current?.weight,current?.reps,props.units]);

  async function complete(){
    if(!current || props.paused || lock.current)return;
    try {
      const values=parseSetInput(String(parseMass(weight,props.units)),reps);
      lock.current=true;setBusy(true);
      await props.onComplete(current.id,values);
    }catch(error){Alert.alert('세트를 저장하지 못했습니다',error instanceof Error?error.message:String(error));}
    finally{lock.current=false;setBusy(false);}
  }

  return <View style={[styles.root,{backgroundColor:palette.canvas}]}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <FormText variant="label" accessibilityLabel="운동 경과 시간">{time(props.elapsedSeconds)}</FormText>
        <FormText variant="caption" secondary>{props.exercise.position} / {props.exercise.total} 운동</FormText>
      </View>
      <FormText variant="title">{props.exercise.name}</FormText>
      <FormText variant="caption" secondary>{props.exercise.muscle} · {props.exercise.equipment}</FormText>
      <Surface><View accessibilityLabel="운동 동작 안내">{props.guide}</View><Action secondary title="자세·호흡·주의사항" onPress={props.onOpenGuide}/></Surface>
      <FormText variant="caption" secondary>{props.exercise.previous ? '지난 기록  '+props.exercise.previous : '첫 기록입니다. 편안한 중량부터 시작하세요.'}</FormText>
      <Surface>
        <FormText variant="heading">{current ? String(props.exercise.sets.indexOf(current)+1)+'번째 세트' : '모든 세트 완료'}</FormText>
        {current && <View style={[styles.inputs,fontScale>=1.5 && {flexDirection:'column'}]}>
          <View style={styles.field}><FormText variant="caption" secondary>중량 · {props.units}</FormText><TextInput accessibilityLabel={'현재 세트 중량 '+props.units} keyboardType="decimal-pad" selectTextOnFocus value={weight} onChangeText={setWeight} editable={!busy} style={[styles.input,{color:palette.text,backgroundColor:palette.raised}]}/></View>
          <View style={styles.field}><FormText variant="caption" secondary>반복 · 회</FormText><TextInput accessibilityLabel="현재 세트 반복 횟수" keyboardType="number-pad" selectTextOnFocus value={reps} onChangeText={setReps} editable={!busy} style={[styles.input,{color:palette.text,backgroundColor:palette.raised}]}/></View>
        </View>}
        {props.exercise.sets.map((set,index)=><View key={set.id} style={styles.history}><FormText variant="caption" secondary>{index+1}세트</FormText><FormText variant="label" style={{fontVariant:['tabular-nums']}}>{displayMass(set.weight,props.units)} {props.units} × {set.reps}</FormText><FormText variant="caption" accessibilityLabel={set.done?'완료':'미완료'}>{set.done?'완료':'대기'}</FormText></View>)}
      </Surface>
    </ScrollView>
    <Surface role="control" style={styles.controls}>
      {rest>0 && <View style={styles.header}><FormText variant="label">휴식 {time(rest)}</FormText><Action secondary title="건너뛰기" onPress={props.onSkipRest}/></View>}
      <Action title={busy?'저장 중…':current?'세트 완료':props.exercise.position===props.exercise.total?'운동 결과 확인':'다음 운동'} disabled={busy || props.paused} onPress={current?complete:props.onNext}/>
      <Action secondary title="전체 운동 목록" onPress={props.onOpenList}/>
    </Surface>
  </View>;
}
const styles=StyleSheet.create({
  root:{flex:1},content:{padding:20,gap:16},header:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12},
  inputs:{flexDirection:'row',gap:16},field:{flex:1,gap:8},
  input:{minHeight:64,borderRadius:14,padding:14,fontSize:32,fontWeight:'600',fontVariant:['tabular-nums'],textAlign:'center'},
  history:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:12,paddingVertical:8},
  controls:{marginHorizontal:12,marginBottom:12,gap:10},
});


