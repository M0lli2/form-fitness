package com.mori.form.device

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Draws the projected anatomy as a single native view. Coordinates are React Native dp. */
class FormMuscleMeshView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
 private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
  // A thin stroke covers antialiasing seams between opaque faces.
  style = Paint.Style.FILL_AND_STROKE
  strokeWidth = 0.35f
 }
 private val path = Path()
 private var faces = FloatArray(0)

 init { setWillNotDraw(false) }

 fun setFaces(next: List<Double>) {
  faces = if (next.size % 9 == 0 && next.size <= 18_000) {
   FloatArray(next.size) { next[it].toFloat() }
  } else {
   FloatArray(0)
  }
  invalidate()
 }

 override fun onDraw(canvas: Canvas) {
  super.onDraw(canvas)
  val scale = resources.displayMetrics.density
  canvas.save()
  canvas.scale(scale, scale)
  for (offset in faces.indices step 9) {
   path.rewind()
   path.moveTo(faces[offset], faces[offset + 1])
   for (vertex in 1..3) {
    val at = offset + vertex * 2
    path.lineTo(faces[at], faces[at + 1])
   }
   path.close()
   paint.color = faces[offset + 8].toInt() or 0xff000000.toInt()
   canvas.drawPath(path, paint)
  }
  canvas.restore()
 }
}
