/** Shared native drawing surface and fixed-pose anatomy used outside the animated guide. */
import React, {useMemo, useState} from 'react';
import {requireNativeViewManager} from 'expo-modules-core';
import {Pressable, StyleSheet, View, type ViewProps} from 'react-native';
import {Label, useTheme} from './theme';
import {frameMotion} from './motion-guide.mjs';
import {faceAt, projectAnatomy, sculptRestPose} from './anatomy-mesh.mjs';

const NativeMesh = requireNativeViewManager<ViewProps & {faces:number[]}>('FormDevice');
// The static atlas displays the sculptor's original standing pose.
const standing=sculptRestPose;
const pose={frames:[standing,standing],labels:['정면','배면']};
const noSelection:string[]=[];

export type AnatomySide='front'|'back';
export function AnatomyLayer({faces}:{faces:number[]}) {
    return <NativeMesh pointerEvents="none" faces={faces} style={StyleSheet.absoluteFill}/>;
}

export function AnatomySides({side,onChange}:{side:AnatomySide;onChange:(side:AnatomySide)=>void}) {
    const {colors}=useTheme();
    return <View style={styles.sides}>
        {(['front','back'] as const).map(item=>{
            const selected=item===side, title=item==='front'?'앞면':'배면';
            return <Pressable key={item} accessibilityRole="button" accessibilityLabel={title}
                accessibilityState={{selected}} onPress={()=>onChange(item)}
                style={[styles.side,{backgroundColor:selected?colors.accentBase:'transparent'}]}>
                <Label bold={selected} muted={!selected} size={12}>{title}</Label>
            </Pressable>;
        })}
    </View>;
}

export function StandingAnatomy({side,height=208,caption,highlights=noSelection,heat,onMuscle,children}:{
    side:AnatomySide;
    height?:number;
    caption:string;
    highlights?:string[];
    heat?:Record<string,number>;
    onMuscle?:(id:string)=>void;
    children?:React.ReactNode;
}) {
    const {colors}=useTheme();
    const [width,setWidth]=useState(0);
    const scene=useMemo(()=>{
        if(width<=0) return null;
        const {scale,cx,cy}=frameMotion(pose,width,height,104);
        return projectAnatomy({joints:standing,yaw:side==='front'?0:Math.PI,scale,
            centerX:width/2-cx*scale,centerY:height/2-cy*scale,palette:colors,highlights,heat});
    },[width,side,height,colors,highlights,heat]);
    return <View accessible accessibilityRole="image" accessibilityLabel={caption}
        onLayout={event=>setWidth(event.nativeEvent.layout.width)}
        style={[styles.stage,{height,backgroundColor:colors.bg}]}>
        {scene && <AnatomyLayer faces={scene.coordinates}/>}
        {scene && onMuscle && <Pressable accessible={false} style={StyleSheet.absoluteFill}
            onPress={({nativeEvent:{locationX,locationY}})=>{
                const id=faceAt(scene.faces,locationX,locationY)?.muscle;
                if(id) onMuscle(id);
            }}/>}
        {children}
    </View>;
}

const styles=StyleSheet.create({
    stage:{borderRadius:16,overflow:'hidden',justifyContent:'center',alignItems:'center'},
    sides:{flexDirection:'row',gap:3},
    side:{paddingHorizontal:10,minHeight:34,borderRadius:999,justifyContent:'center'},
});
