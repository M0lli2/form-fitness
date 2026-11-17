package com.mori.form.wear

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.wear.compose.material.*
import com.google.android.gms.wearable.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** 원형 화면에서 손가락으로 누르기 쉬운 세로 버튼 흐름을 사용합니다. */
class MainActivity : ComponentActivity() {
 private val sensorPermission get() = if (Build.VERSION.SDK_INT >= 36) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS
 private var error by mutableStateOf("")
 private val permissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
  if (result[sensorPermission] == true || ContextCompat.checkSelfPermission(this,sensorPermission) == PackageManager.PERMISSION_GRANTED) startWorkout() else error="심박 센서 권한이 필요합니다."
 }
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  setContent {
   MaterialTheme {
    var phone by remember { mutableStateOf(JSONObject()) }; var clock by remember { mutableLongStateOf(System.currentTimeMillis()) }; var sentSet by remember { mutableStateOf("") }
    val scope=rememberCoroutineScope()
    LaunchedEffect(Unit) { while (true) { phone=runCatching { JSONObject(getSharedPreferences("form",0).getString("phone","{}")!!) }.getOrDefault(JSONObject()); clock=System.currentTimeMillis(); delay(1000) } }
    val prefs=getSharedPreferences("form",0); val start=prefs.getLong("workoutStart",0); val next=phone.optJSONObject("next")
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal=16.dp,vertical=26.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(10.dp)) {
     Text("form.",color=Color(0xFFD9F4A3),style=MaterialTheme.typography.title1)
     if (start>0) {
      Text("근력 트레이닝")
      Text("${(clock-start)/60000}:${((clock-start)/1000%60).toString().padStart(2,'0')}",style=MaterialTheme.typography.title2)
      val rate=prefs.getFloat("heart",0f); Text(if(rate>0) "♥ ${rate.toInt()} bpm" else "심박 측정 대기")
      Chip(onClick={startService(Intent(this@MainActivity,WorkoutService::class.java).setAction("STOP"))},label={Text("운동 마치고 저장")},modifier=Modifier.fillMaxWidth())
     } else {
      if (next!=null) {
       Text(next.optString("exerciseName"),textAlign=TextAlign.Center)
       Text(if(next.optString("type")=="strength") "${next.optDouble("weight")} kg × ${next.optInt("reps")}회" else "${next.optInt("seconds")}초")
       Chip(onClick={scope.launch { val id=next.optString("setId"); try { WearBridge.send(this@MainActivity,JSONObject().put("id",UUID.randomUUID().toString()).put("action","completeSet").put("sessionId",phone.optString("sessionId")).put("exerciseId",next.optString("exerciseId")).put("setId",id));sentSet=id;error="휴대폰 동기화 대기" } catch(e:Exception){error=e.message?:"전송 실패"} }},enabled=sentSet!=next.optString("setId"),label={Text("세트 완료 ✓")},modifier=Modifier.fillMaxWidth())
       Text("휴대폰 입력값으로 기록",style=MaterialTheme.typography.caption2)
      } else Text("휴대폰에서 운동을 시작하세요.",textAlign=TextAlign.Center,style=MaterialTheme.typography.caption1)
      Chip(onClick={val required=mutableListOf(sensorPermission);if(Build.VERSION.SDK_INT>=33)required.add(Manifest.permission.POST_NOTIFICATIONS);permissions.launch(required.toTypedArray())},label={Text("워치에서 운동 시작")},modifier=Modifier.fillMaxWidth())
     }
     if(error.isNotEmpty())Text(error,style=MaterialTheme.typography.caption2,textAlign=TextAlign.Center)
     val status=prefs.getString("status","")?:"";if(status.isNotEmpty())Text(status,style=MaterialTheme.typography.caption2,textAlign=TextAlign.Center)
    }
   }
  }
 }
 private fun startWorkout(){ContextCompat.startForegroundService(this,Intent(this,WorkoutService::class.java).setAction("START"));error=""}
}

/** DataClient 항목은 연결되지 않아도 보관되며 휴대폰이 저장 후 삭제합니다. */
object WearBridge {
 suspend fun send(context:Context,payload:JSONObject){val request=PutDataMapRequest.create("/form/command/${payload.getString("id")}").apply{dataMap.putString("payload",payload.toString())}.asPutDataRequest().setUrgent();Wearable.getDataClient(context).putDataItem(request).await()}
}
class PhoneStateListener : WearableListenerService(){override fun onDataChanged(events:DataEventBuffer){for(event in events)if(event.type==DataEvent.TYPE_CHANGED&&event.dataItem.uri.path=="/form/state"){val text=DataMapItem.fromDataItem(event.dataItem).dataMap.getString("payload");getSharedPreferences("form",0).edit().putString("phone",text).apply()}}}
