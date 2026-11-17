package com.mori.form.device
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.*
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class HealthPermissionActivity : ComponentActivity() {
 companion object {
  private var pending: CompletableDeferred<Set<String>>? = null
  val permissions = setOf(HealthPermission.getReadPermission(StepsRecord::class), HealthPermission.getReadPermission(HeartRateRecord::class), HealthPermission.getReadPermission(WeightRecord::class), HealthPermission.getReadPermission(BodyFatRecord::class), HealthPermission.getReadPermission(ExerciseSessionRecord::class), HealthPermission.getWritePermission(WeightRecord::class), HealthPermission.getWritePermission(BodyFatRecord::class), HealthPermission.getWritePermission(ExerciseSessionRecord::class))
  suspend fun request(context: Context): Set<String> { val wait = withContext(Dispatchers.Main) { check(pending == null) { "권한 요청이 이미 진행 중입니다." }; CompletableDeferred<Set<String>>().also { pending=it; context.startActivity(Intent(context, HealthPermissionActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } }; return try { wait.await() } finally { pending=null } }
 }
 private val launcher = registerForActivityResult(PermissionController.createRequestPermissionResultContract()) { result -> pending?.complete(result); finish() }
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); if (savedInstanceState == null) launcher.launch(permissions) }
 override fun onDestroy() { if (isFinishing) pending?.complete(emptySet()); super.onDestroy() }
}
class HealthRationaleActivity : ComponentActivity() {
 override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContentView(TextView(this).apply { text="FORM 건강 데이터 안내\n\n선택한 걸음 수, 심박수, 운동, 체중, 체지방을 기기에서 읽습니다. 선택한 운동 및 체성분을 Health Connect에 저장할 수 있습니다. 광고 또는 제3자 서버로 전송하지 않습니다. 권한은 Health Connect 설정에서 언제든 취소할 수 있습니다. 앱 데이터는 앱 설정에서 삭제할 수 있으며 이미 내보낸 데이터는 Health Connect에서 별도로 삭제하세요."; setPadding(40,80,40,40); textSize=18f }) }
}
