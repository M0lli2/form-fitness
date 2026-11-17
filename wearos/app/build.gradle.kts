plugins { id("com.android.application"); id("org.jetbrains.kotlin.android"); id("org.jetbrains.kotlin.plugin.compose") }
android {
 namespace = "com.mori.form.wear"
 compileSdk = 36
 defaultConfig { applicationId = "com.mori.form"; minSdk = 30; targetSdk = 36; versionCode = 1; versionName = "0.1.0" }
 buildFeatures { compose = true }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
 kotlinOptions { jvmTarget = "17" }
}
dependencies {
 implementation(platform("androidx.compose:compose-bom:2025.05.01"))
 implementation("androidx.activity:activity-compose:1.10.1")
 implementation("androidx.compose.ui:ui")
 implementation("androidx.compose.foundation:foundation")
 implementation("androidx.wear.compose:compose-material:1.4.1")
 implementation("androidx.core:core-ktx:1.16.0")
 implementation("com.google.android.gms:play-services-wearable:19.0.0")
 implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
}
