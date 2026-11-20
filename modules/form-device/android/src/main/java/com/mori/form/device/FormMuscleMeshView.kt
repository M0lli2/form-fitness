package com.mori.form.device

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/** Rasterizes camera depth and shared vertex colors into a transparent, filtered anatomy surface. */
class FormMuscleMeshView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
 private val paint=Paint(Paint.FILTER_BITMAP_FLAG)
 private var faces=FloatArray(0)
 private var bitmap: Bitmap?=null
 private var pixels=IntArray(0)
 private var depths=FloatArray(0)
 private val destination=RectF()

 init { setWillNotDraw(false) }

 fun setFaces(next: List<Double>) {
  faces=if(next.size%16==0 && next.size<=110_000) FloatArray(next.size){next[it].toFloat()} else FloatArray(0)
  invalidate()
 }

 override fun onDraw(canvas: Canvas) {
  super.onDraw(canvas)
  if(faces.isEmpty() || width<=0 || height<=0) return
  val density=resources.displayMetrics.density
  val scale=minOf(1.5f,700f*density/maxOf(width,height))
  val w=ceil(width*scale/density).toInt().coerceAtLeast(1)
  val h=ceil(height*scale/density).toInt().coerceAtLeast(1)
  if(bitmap?.width!=w || bitmap?.height!=h){
   bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888)
   pixels=IntArray(w*h)
   depths=FloatArray(w*h)
  }
  pixels.fill(0)
  depths.fill(Float.NEGATIVE_INFINITY)
  for(offset in faces.indices step 16){
   drawTriangle(offset,offset+4,offset+8,scale,w,h)
   drawTriangle(offset,offset+8,offset+12,scale,w,h)
  }
  val result=bitmap ?: return
  result.setPixels(pixels,0,w,0,0,w,h)
  destination.set(0f,0f,width.toFloat(),height.toFloat())
  canvas.drawBitmap(result,null,destination,paint)
 }

 private fun channel(color: Int, shift: Int): Int=(color shr shift) and 255
 private fun drawTriangle(a: Int,b: Int,c: Int,scale: Float,width: Int,height: Int){
  val ax=faces[a]*scale
  val ay=faces[a+1]*scale
  val bx=faces[b]*scale
  val by=faces[b+1]*scale
  val cx=faces[c]*scale
  val cy=faces[c+1]*scale
  val divisor=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
  if(abs(divisor)<.000001f) return
  val left=maxOf(0,floor(minOf(ax,bx,cx)).toInt())
  val right=minOf(width-1,ceil(maxOf(ax,bx,cx)).toInt())
  val top=maxOf(0,floor(minOf(ay,by,cy)).toInt())
  val bottom=minOf(height-1,ceil(maxOf(ay,by,cy)).toInt())
  val ca=faces[a+3].toInt()
  val cb=faces[b+3].toInt()
  val cc=faces[c+3].toInt()
  for(y in top..bottom) for(x in left..right){
   val dx=x+.5f-cx
   val dy=y+.5f-cy
   val u=((by-cy)*dx+(cx-bx)*dy)/divisor
   val v=((cy-ay)*dx+(ax-cx)*dy)/divisor
   val w=1-u-v
   if(u<-.000001f || v<-.000001f || w<-.000001f) continue
   val z=faces[a+2]*u+faces[b+2]*v+faces[c+2]*w
   val index=y*width+x
   if(z<=depths[index]) continue
   depths[index]=z
   val red=(channel(ca,16)*u+channel(cb,16)*v+channel(cc,16)*w+.5f).toInt()
   val green=(channel(ca,8)*u+channel(cb,8)*v+channel(cc,8)*w+.5f).toInt()
   val blue=(channel(ca,0)*u+channel(cb,0)*v+channel(cc,0)*w+.5f).toInt()
   pixels[index]=0xff000000.toInt() or (red shl 16) or (green shl 8) or blue
  }
 }
}
