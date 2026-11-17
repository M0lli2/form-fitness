package com.mori.form.wear
import android.app.*
import android.content.Intent
import android.hardware.*
import android.os.IBinder
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.time.Instant
import java.util.UUID

/** 사용자가 화면에서 시작한 운동 동안만 전경 서비스로 심박 센서를 구독합니다. */
class WorkoutService:Service(),SensorEventListener {
 private val scope=CoroutineScope(SupervisorJob()+Dispatchers.IO)
 private lateinit var sensors:SensorManager
 private val prefs get()=getSharedPreferences("form",0)
 override fun onCreate(){super.onCreate();sensors=getSystemService(SENSOR_SERVICE) as SensorManager;getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("workout","FORM 운동",NotificationManager.IMPORTANCE_LOW))}
 override fun onStartCommand(intent:Intent?,flags:Int,startId:Int):Int {
  if(intent?.action=="STOP"){finishWorkout();return START_NOT_STICKY}
  val launch=PendingIntent.getActivity(this,1,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE)
  val note=NotificationCompat.Builder(this,"workout").setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("FORM 운동 기록 중").setContentText("탭하여 운동 화면으로 돌아가기").setOngoing(true).setContentIntent(launch).build()
  if(Build.VERSION.SDK_INT>=34)startForeground(1,note,ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)else startForeground(1,note)
  // 서비스가 중단된 뒤 시작 시간이 남아 있으면 이어서 표시해 기록 손실을 줄입니다.
  if(prefs.getLong("workoutStart",0)==0L)prefs.edit().putLong("workoutStart",System.currentTimeMillis()).putString("workoutId",UUID.randomUUID().toString()).putString("status","").putFloat("heart",0f).commit()
  val sensor=sensors.getDefaultSensor(Sensor.TYPE_HEART_RATE)
  if(sensor!=null)sensors.registerListener(this,sensor,SensorManager.SENSOR_DELAY_NORMAL)
  return START_NOT_STICKY
 }
 private fun finishWorkout(){val start=prefs.getLong("workoutStart",0);if(start==0L){stopSelf();return};sensors.unregisterListener(this);val payload=JSONObject().put("id",prefs.getString("workoutId",UUID.randomUUID().toString())).put("action","workoutFinished").put("start",Instant.ofEpochMilli(start).toString()).put("end",Instant.now().toString()).put("healthSaved",false)
  // 전송 실패 시 시작 시각을 지우지 않아 다음 실행에서 다시 저장할 수 있습니다.
  scope.launch{try{WearBridge.send(this@WorkoutService,payload);prefs.edit().remove("workoutStart").putString("status","휴대폰 전송 대기 · 건강 앱 저장은 휴대폰에서 선택").commit()}catch(e:Exception){prefs.edit().putString("status","전송 실패 · 다시 저장해주세요").commit()}finally{stopForeground(STOP_FOREGROUND_REMOVE);stopSelf()}}
 }
 override fun onSensorChanged(event:SensorEvent){if(event.sensor.type==Sensor.TYPE_HEART_RATE&&event.values[0]>0)prefs.edit().putFloat("heart",event.values[0]).apply()}
 override fun onAccuracyChanged(sensor:Sensor?,accuracy:Int){}
 override fun onBind(intent:Intent?):IBinder?=null
 override fun onDestroy(){sensors.unregisterListener(this);scope.cancel();super.onDestroy()}
}
