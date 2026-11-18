package com.mori.form.device

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Mass
import com.google.android.gms.wearable.*
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import androidx.health.connect.client.records.Record
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import kotlinx.coroutines.Dispatchers
import org.json.JSONObject
import org.json.JSONArray
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

class FormDeviceModule : Module() {
 private val context get() = requireNotNull(appContext.reactContext)
 private val client get() = HealthConnectClient.getOrCreate(context)
 override fun definition() = ModuleDefinition {
  Name("FormDevice")
  AsyncFunction("healthAvailable") { HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE }
  AsyncFunction("authorize") Coroutine { ->
   check(HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE) { "Health Connect를 설치하거나 업데이트하세요." }
   val result = HealthPermissionActivity.request(context)
   result.isNotEmpty()
  }
  AsyncFunction("readHealth") Coroutine { ->
   val granted = client.permissionController.getGrantedPermissions()
   val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant()
   val range = TimeRangeFilter.between(Instant.now().minusSeconds(30 * 86400), Instant.now())
   val steps = if (HealthPermission.getReadPermission(StepsRecord::class) in granted) client.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), TimeRangeFilter.between(start, Instant.now())))[StepsRecord.COUNT_TOTAL] else null
   val heart = if (HealthPermission.getReadPermission(HeartRateRecord::class) in granted) client.readRecords(ReadRecordsRequest(HeartRateRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()?.samples?.lastOrNull()?.beatsPerMinute else null
   val weight = if (HealthPermission.getReadPermission(WeightRecord::class) in granted) client.readRecords(ReadRecordsRequest(WeightRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()?.weight?.inKilograms else null
   val fat = if (HealthPermission.getReadPermission(BodyFatRecord::class) in granted) client.readRecords(ReadRecordsRequest(BodyFatRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()?.percentage?.value else null
   val workouts = if (HealthPermission.getReadPermission(ExerciseSessionRecord::class) in granted) client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range, ascendingOrder = false, pageSize = 100)).records.map { mapOf("id" to it.metadata.id, "name" to (it.title ?: "Health Connect 운동"), "start" to it.startTime.toString(), "end" to it.endTime.toString()) } else emptyList()
   mapOf("steps" to steps, "heartRate" to heart, "weight" to weight, "bodyFat" to fat, "workouts" to workouts)
  }
  AsyncFunction("saveBody") Coroutine { id: String, date: String, weight: Double, fat: Double?, revision: Int ->
   require(revision >= 1); require(weight in 20.0..400.0); require(fat == null || fat in 0.0..75.0)
   val time = Instant.parse(date)
   val records = mutableListOf<Record>(WeightRecord(time, null, Mass.kilograms(weight), Metadata.manualEntry(clientRecordId = "form-$id-weight", clientRecordVersion = revision.toLong())))
   if (fat != null) records.add(BodyFatRecord(time, null, androidx.health.connect.client.units.Percentage(fat), Metadata.manualEntry(clientRecordId = "form-$id-fat", clientRecordVersion = revision.toLong())))
   client.insertRecords(records); Unit
  }
  AsyncFunction("saveWorkout") Coroutine { id: String, name: String, start: String, end: String ->
   val a = Instant.parse(start); val b = Instant.parse(end); require(b > a)
   client.insertRecords(listOf(ExerciseSessionRecord(startTime = a, startZoneOffset = null, endTime = b, endZoneOffset = null, exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, title = name, metadata = Metadata.manualEntry(clientRecordId = "form-$id", clientRecordVersion = 1), exerciseRoute = null))); Unit
  }
  AsyncFunction("watchStatus") Coroutine { -> val nodes = Wearable.getNodeClient(context).connectedNodes.await(); mapOf("paired" to nodes.isNotEmpty(), "connected" to nodes.any { it.isNearby }) }
  AsyncFunction("sendWatch") Coroutine { payload: String ->
   val request = PutDataMapRequest.create("/form/state").apply { dataMap.putString("payload", payload); dataMap.putLong("version", System.currentTimeMillis()) }.asPutDataRequest().setUrgent()
   Wearable.getDataClient(context).putDataItem(request).await(); Unit
  }
  AsyncFunction("drainWatch") { WatchInbox.pending(context) }
  AsyncFunction("ackWatch") { ids: List<String> -> WatchInbox.ack(context, ids) }
 }
}

object WatchInbox {
 @Synchronized fun pending(context: Context): List<String> { val array = JSONArray(context.getSharedPreferences("form-watch",0).getString("inbox","[]")); return (0 until array.length()).map { array.getString(it) } }
 @Synchronized fun add(context: Context, payload: String) { if (payload.length > 64000) return; val queue = pending(context).toMutableList(); if (!queue.contains(payload)) queue.add(payload); context.getSharedPreferences("form-watch",0).edit().putString("inbox",JSONArray(queue).toString()).commit() }
 @Synchronized fun ack(context: Context, ids: List<String>) { val keep = pending(context).filter { runCatching { JSONObject(it).getString("id") !in ids }.getOrDefault(false) }; context.getSharedPreferences("form-watch",0).edit().putString("inbox",JSONArray(keep).toString()).commit() }
}
class FormWearListener : WearableListenerService() {
 override fun onMessageReceived(event: MessageEvent) { if (event.path == "/form/command") WatchInbox.add(this, String(event.data, Charsets.UTF_8)) }
 override fun onDataChanged(events: DataEventBuffer) { for (event in events) if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path?.startsWith("/form/command/") == true) { val payload = DataMapItem.fromDataItem(event.dataItem).dataMap.getString("payload"); if (payload != null) { WatchInbox.add(this,payload); Wearable.getDataClient(this).deleteDataItems(event.dataItem.uri) } } }
}
