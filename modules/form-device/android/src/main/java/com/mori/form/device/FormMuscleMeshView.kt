package com.mori.form.device

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.opengl.EGL14
import android.opengl.EGLConfig
import android.opengl.EGLContext
import android.opengl.EGLDisplay
import android.opengl.EGLSurface
import android.opengl.GLES30
import android.view.TextureView
import android.view.ViewGroup
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * 근육 표면은 TextureView 위의 OpenGL ES로 그립니다. 기기 해상도 전체(Full-DPI)에 4x MSAA를
 * 더해 실루엣의 계단 현상 없이 그리고, GL을 만들 수 없을 때만 예전 CPU 래스터라이저로 물러납니다.
 */
class FormMuscleMeshView(context: Context, appContext: AppContext) : ExpoView(context, appContext), TextureView.SurfaceTextureListener {
 private val paint=Paint(Paint.FILTER_BITMAP_FLAG)
 private val texture=TextureView(context)
 private var worker=newWorker()
 private val renderer=GlSurface()
 private val scheduled=AtomicBoolean(false)
 private val density=resources.displayMetrics.density.coerceAtLeast(1f)
 @Volatile private var faces=FloatArray(0)
 @Volatile private var glReady=false
 // GPU를 쓸 수 없을 때만 쓰는 예전 소프트웨어 경로의 상태입니다.
 private var bitmap: Bitmap?=null
 private var cpuPixels=IntArray(0)
 private var cpuDepths=FloatArray(0)
 private val destination=RectF()

 init {
  texture.isOpaque=false
  texture.surfaceTextureListener=this
  addView(texture, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT))
  setWillNotDraw(false)
 }

 fun setFaces(next: List<Double>) {
  faces=if(next.size%16==0 && next.size<=110_000) FloatArray(next.size){next[it].toFloat()} else FloatArray(0)
  if(glReady) requestDraw() else invalidate()
 }

 private fun requestDraw() {
  if(!scheduled.compareAndSet(false,true)) return
  post {
   scheduled.set(false)
   if(glReady) renderer.draw(faces,density)
  }
 }

 /** 뷰가 떨어진 뒤에 들어온 작업은 버립니다. */
 private fun post(task: () -> Unit) {
  if(worker.isShutdown) worker=newWorker()
  try {
   worker.execute(task)
  } catch(error: Exception) {
  }
 }

 private fun newWorker(): ExecutorService=Executors.newSingleThreadExecutor{ Thread(it,"form-anatomy-gl") }

 override fun onSizeChanged(w: Int,h: Int,oldw: Int,oldh: Int) {
  super.onSizeChanged(w,h,oldw,oldh)
  if(glReady) post {
   renderer.resize(w,h)
   renderer.draw(faces,density)
  }
 }

 override fun onSurfaceTextureAvailable(surface: SurfaceTexture,width: Int,height: Int) {
  post {
   if(renderer.attach(surface,width,height)) {
    glReady=true
    renderer.draw(faces,density)
    // 표면이 살아난 뒤에는 GPU가 그리므로 소프트웨어 경로의 비트맵을 버립니다.
    bitmap=null
    cpuPixels=IntArray(0)
    cpuDepths=FloatArray(0)
   } else {
    renderer.release()
   }
  }
 }

 override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture,width: Int,height: Int) {
  if(glReady) post {
   renderer.resize(width,height)
   renderer.draw(faces,density)
  }
 }

 override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}

 override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
  if(!glReady) return true
  glReady=false
  // GL 표면을 먼저 없애고 나서 SurfaceTexture를 풀어 줍니다(UI 스레드를 막지 않음).
  post {
   renderer.release()
   surface.release()
  }
  return false
 }

 override fun onDetachedFromWindow() {
  super.onDetachedFromWindow()
  val current=worker
  try {
   current.execute {
    renderer.release()
    current.shutdown()
   }
  } catch(error: Exception) {
  }
 }

 override fun onDraw(canvas: Canvas) {
  super.onDraw(canvas)
  if(glReady) return
  drawCpu(canvas)
 }

 /** GL을 쓸 수 없는 기기에서만 쓰는 예전 소프트웨어 래스터라이저입니다. */
 private fun drawCpu(canvas: Canvas) {
  if(faces.isEmpty() || width<=0 || height<=0) return
  val scale=minOf(1.5f,700f*density/maxOf(width,height))
  val w=ceil(width*scale/density).toInt().coerceAtLeast(1)
  val h=ceil(height*scale/density).toInt().coerceAtLeast(1)
  if(bitmap?.width!=w || bitmap?.height!=h) {
   bitmap=Bitmap.createBitmap(w,h,Bitmap.Config.ARGB_8888)
   cpuPixels=IntArray(w*h)
   cpuDepths=FloatArray(w*h)
  }
  cpuPixels.fill(0)
  cpuDepths.fill(Float.NEGATIVE_INFINITY)
  for(offset in faces.indices step 16) {
   drawTriangle(offset,offset+4,offset+8,scale,w,h)
   drawTriangle(offset,offset+8,offset+12,scale,w,h)
  }
  val result=bitmap ?: return
  result.setPixels(cpuPixels,0,w,0,0,w,h)
  destination.set(0f,0f,width.toFloat(),height.toFloat())
  canvas.drawBitmap(result,null,destination,paint)
 }

 private fun channel(color: Int,shift: Int): Int=(color shr shift) and 255

 private fun drawTriangle(a: Int,b: Int,c: Int,scale: Float,width: Int,height: Int) {
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
  for(y in top..bottom) for(x in left..right) {
   val dx=x+.5f-cx
   val dy=y+.5f-cy
   val u=((by-cy)*dx+(cx-bx)*dy)/divisor
   val v=((cy-ay)*dx+(ax-cx)*dy)/divisor
   val w=1-u-v
   if(u<-.000001f || v<-.000001f || w<-.000001f) continue
   val z=faces[a+2]*u+faces[b+2]*v+faces[c+2]*w
   val index=y*width+x
   if(z<=cpuDepths[index]) continue
   cpuDepths[index]=z
   val red=(channel(ca,16)*u+channel(cb,16)*v+channel(cc,16)*w+.5f).toInt()
   val green=(channel(ca,8)*u+channel(cb,8)*v+channel(cc,8)*w+.5f).toInt()
   val blue=(channel(ca,0)*u+channel(cb,0)*v+channel(cc,0)*w+.5f).toInt()
   cpuPixels[index]=0xff000000.toInt() or (red shl 16) or (green shl 8) or blue
  }
 }

 /** 작업 스레드에서만 만지는 EGL·GL 상태입니다. */
 private inner class GlSurface {
  private var display: EGLDisplay=EGL14.EGL_NO_DISPLAY
  private var context: EGLContext=EGL14.EGL_NO_CONTEXT
  private var surface: EGLSurface=EGL14.EGL_NO_SURFACE
  private var program=0
  private var positionSlot=0
  private var colorSlot=0
  private var sizeSlot=0
  private var depthSlot=0
  private var width=0
  private var height=0
  private var samples=0
  private var fbo=0
  private var colorBuffer=0
  private var depthBuffer=0
  private var buffer=0
  private var vertexData: FloatBuffer?=null
  private var capacity=0

  fun attach(target: SurfaceTexture,w: Int,h: Int): Boolean {
   display=EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY)
   if(display==EGL14.EGL_NO_DISPLAY) return false
   val version=IntArray(2)
   if(!EGL14.eglInitialize(display,version,0,version,1)) return false
   // 색은 알파까지 8비트, CPU 경로로 물러날 때를 위해 깊이 버퍼도 요청합니다.
   val attributes=intArrayOf(
    EGL14.EGL_RENDERABLE_TYPE,EGL14.EGL_OPENGL_ES2_BIT,
    EGL14.EGL_SURFACE_TYPE,EGL14.EGL_WINDOW_BIT,
    EGL14.EGL_RED_SIZE,8,EGL14.EGL_GREEN_SIZE,8,EGL14.EGL_BLUE_SIZE,8,EGL14.EGL_ALPHA_SIZE,8,
    EGL14.EGL_DEPTH_SIZE,16,EGL14.EGL_NONE)
   val configs=arrayOfNulls<EGLConfig>(1)
   val found=IntArray(1)
   if(!EGL14.eglChooseConfig(display,attributes,0,configs,0,1,found,0) || found[0]==0) return false
   val config=configs[0] ?: return false
   context=EGL14.eglCreateContext(display,config,EGL14.EGL_NO_CONTEXT,
    intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION,3,EGL14.EGL_NONE),0)
   if(context==EGL14.EGL_NO_CONTEXT) {
    context=EGL14.eglCreateContext(display,config,EGL14.EGL_NO_CONTEXT,
     intArrayOf(EGL14.EGL_CONTEXT_CLIENT_VERSION,2,EGL14.EGL_NONE),0)
   }
   if(context==EGL14.EGL_NO_CONTEXT) return false
   surface=EGL14.eglCreateWindowSurface(display,config,target,intArrayOf(EGL14.EGL_NONE),0)
   if(surface==EGL14.EGL_NO_SURFACE) return false
   if(!EGL14.eglMakeCurrent(display,surface,surface,context)) return false
   program=buildProgram()
   if(program==0) return false
   positionSlot=GLES30.glGetAttribLocation(program,"aPosition")
   colorSlot=GLES30.glGetAttribLocation(program,"aColor")
   sizeSlot=GLES30.glGetUniformLocation(program,"uSize")
   depthSlot=GLES30.glGetUniformLocation(program,"uDepth")
   // GLES 3 문맥에서만 다중 샘플 프레임버퍼를 씁니다. SwiftShader·에뮬레이터도 여기서 판가름됩니다.
   val renderer=(GLES30.glGetString(GLES30.GL_VERSION) ?: "")
   samples=if(renderer.startsWith("OpenGL ES 3")) 4 else 0
   width=w
   height=h
   return true
  }

  fun resize(w: Int,h: Int) {
   if(w==width && h==height) return
   width=w
   height=h
   releaseFramebuffer()
  }

  fun draw(current: FloatArray,density: Float) {
   if(program==0 || width<=0 || height<=0) return
   if(!ensureFramebuffer()) return
   GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER,if(samples>0) fbo else 0)
   GLES30.glViewport(0,0,width,height)
   GLES30.glDisable(GLES30.GL_BLEND)
   GLES30.glDisable(GLES30.GL_CULL_FACE)
   GLES30.glEnable(GLES30.GL_DEPTH_TEST)
   GLES30.glDepthFunc(GLES30.GL_GEQUAL)
   GLES30.glDepthMask(true)
   GLES30.glClearColor(0f,0f,0f,0f)
   GLES30.glClearDepthf(0f)
   GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT or GLES30.GL_DEPTH_BUFFER_BIT)
   val count=upload(current)
   if(count>0) {
    GLES30.glUseProgram(program)
    GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER,buffer)
    GLES30.glEnableVertexAttribArray(positionSlot)
    GLES30.glVertexAttribPointer(positionSlot,3,GLES30.GL_FLOAT,false,24,0)
    GLES30.glEnableVertexAttribArray(colorSlot)
    GLES30.glVertexAttribPointer(colorSlot,3,GLES30.GL_FLOAT,false,24,12)
    GLES30.glUniform2f(sizeSlot,width/density,height/density)
    GLES30.glUniform2f(depthSlot,lowDepth,lowDepth+maxOf(highDepth-lowDepth,0.0001f))
    GLES30.glDrawArrays(GLES30.GL_TRIANGLES,0,count)
    GLES30.glDisableVertexAttribArray(positionSlot)
    GLES30.glDisableVertexAttribArray(colorSlot)
   }
   if(samples>0) {
    GLES30.glBindFramebuffer(GLES30.GL_DRAW_FRAMEBUFFER,0)
    GLES30.glBindFramebuffer(GLES30.GL_READ_FRAMEBUFFER,fbo)
    GLES30.glBlitFramebuffer(0,0,width,height,0,0,width,height,GLES30.GL_COLOR_BUFFER_BIT,GLES30.GL_NEAREST)
   }
   GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER,0)
   EGL14.eglSwapBuffers(display,surface)
  }

  private var lowDepth=0f
  private var highDepth=0f

  /** 화면 좌표(정점)와 색을 한 번에 GPU 버퍼로 올리고 정점 수를 돌려줍니다. */
  private fun upload(current: FloatArray): Int {
   val quads=current.size/16
   val count=quads*6
   if(count==0) return 0
   val floats=count*6
   if(vertexData==null || capacity<floats) {
    capacity=maxOf(floats,4096)
    vertexData=ByteBuffer.allocateDirect(capacity*4).order(ByteOrder.nativeOrder()).asFloatBuffer()
   }
   val data=vertexData ?: return 0
   data.clear()
   data.limit(floats)
   lowDepth=Float.MAX_VALUE
   highDepth=-Float.MAX_VALUE
   var offset=0
   while(offset<quads*16) {
    for(corner in 0 until 4) {
     val z=current[offset+corner*4+2]
     if(z<lowDepth) lowDepth=z
     if(z>highDepth) highDepth=z
    }
    offset+=16
   }
   fun put(base: Int) {
    val packed=current[base+3].toInt()
    data.put(current[base]).put(current[base+1]).put(current[base+2])
     .put(((packed shr 16) and 255)/255f).put(((packed shr 8) and 255)/255f).put((packed and 255)/255f)
   }
   offset=0
   while(offset<quads*16) {
    put(offset)
    put(offset+4)
    put(offset+8)
    put(offset)
    put(offset+8)
    put(offset+12)
    offset+=16
   }
   data.position(0)
   if(buffer==0) {
    val buffers=IntArray(1)
    GLES30.glGenBuffers(1,buffers,0)
    buffer=buffers[0]
   }
   GLES30.glBindBuffer(GLES30.GL_ARRAY_BUFFER,buffer)
   GLES30.glBufferData(GLES30.GL_ARRAY_BUFFER,floats*4,data,GLES30.GL_DYNAMIC_DRAW)
   return count
  }

  private fun ensureFramebuffer(): Boolean {
   if(samples==0) return true
   if(fbo!=0) return true
   val buffers=IntArray(2)
   GLES30.glGenFramebuffers(1,buffers,0)
   fbo=buffers[0]
   GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER,fbo)
   GLES30.glGenRenderbuffers(1,buffers,0)
   colorBuffer=buffers[0]
   GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER,colorBuffer)
   GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER,samples,GLES30.GL_RGBA8,width,height)
   GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER,GLES30.GL_COLOR_ATTACHMENT0,GLES30.GL_RENDERBUFFER,colorBuffer)
   GLES30.glGenRenderbuffers(1,buffers,0)
   depthBuffer=buffers[0]
   GLES30.glBindRenderbuffer(GLES30.GL_RENDERBUFFER,depthBuffer)
   GLES30.glRenderbufferStorageMultisample(GLES30.GL_RENDERBUFFER,samples,GLES30.GL_DEPTH_COMPONENT24,width,height)
   GLES30.glFramebufferRenderbuffer(GLES30.GL_FRAMEBUFFER,GLES30.GL_DEPTH_ATTACHMENT,GLES30.GL_RENDERBUFFER,depthBuffer)
   if(GLES30.glCheckFramebufferStatus(GLES30.GL_FRAMEBUFFER)!=GLES30.GL_FRAMEBUFFER_COMPLETE) {
    // 다중 샘플을 만들 수 없는 드라이버는 해상도만 높인 단일 샘플로 그립니다.
    releaseFramebuffer()
    samples=0
    return true
   }
   GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER,0)
   return true
  }

  private fun releaseFramebuffer() {
   if(fbo!=0) {
    GLES30.glDeleteFramebuffers(1,intArrayOf(fbo),0)
    fbo=0
   }
   if(colorBuffer!=0) {
    GLES30.glDeleteRenderbuffers(1,intArrayOf(colorBuffer),0)
    colorBuffer=0
   }
   if(depthBuffer!=0) {
    GLES30.glDeleteRenderbuffers(1,intArrayOf(depthBuffer),0)
    depthBuffer=0
   }
  }

  private fun buildProgram(): Int {
   val vertex=compile(GLES30.GL_VERTEX_SHADER,VERTEX_SHADER)
   val fragment=compile(GLES30.GL_FRAGMENT_SHADER,FRAGMENT_SHADER)
   if(vertex==0 || fragment==0) return 0
   val program=GLES30.glCreateProgram()
   GLES30.glAttachShader(program,vertex)
   GLES30.glAttachShader(program,fragment)
   GLES30.glLinkProgram(program)
   val linked=IntArray(1)
   GLES30.glGetProgramiv(program,GLES30.GL_LINK_STATUS,linked,0)
   GLES30.glDeleteShader(vertex)
   GLES30.glDeleteShader(fragment)
   if(linked[0]==0) {
    GLES30.glDeleteProgram(program)
    return 0
   }
   return program
  }

  private fun compile(type: Int,source: String): Int {
   val shader=GLES30.glCreateShader(type)
   GLES30.glShaderSource(shader,source)
   GLES30.glCompileShader(shader)
   val compiled=IntArray(1)
   GLES30.glGetShaderiv(shader,GLES30.GL_COMPILE_STATUS,compiled,0)
   if(compiled[0]==0) {
    GLES30.glDeleteShader(shader)
    return 0
   }
   return shader
  }

  fun release() {
   releaseFramebuffer()
   if(buffer!=0) {
    GLES30.glDeleteBuffers(1,intArrayOf(buffer),0)
    buffer=0
   }
   if(program!=0) {
    GLES30.glDeleteProgram(program)
    program=0
   }
   vertexData=null
   capacity=0
   if(display!=EGL14.EGL_NO_DISPLAY) {
    EGL14.eglMakeCurrent(display,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_SURFACE,EGL14.EGL_NO_CONTEXT)
    if(surface!=EGL14.EGL_NO_SURFACE) EGL14.eglDestroySurface(display,surface)
    if(context!=EGL14.EGL_NO_CONTEXT) EGL14.eglDestroyContext(display,context)
    EGL14.eglTerminate(display)
   }
   surface=EGL14.EGL_NO_SURFACE
   context=EGL14.EGL_NO_CONTEXT
   display=EGL14.EGL_NO_DISPLAY
  }
 }

 companion object {
  private const val VERTEX_SHADER="""
   attribute vec4 aPosition;
   attribute vec4 aColor;
   uniform vec2 uSize;
   uniform vec2 uDepth;
   varying vec4 vColor;
   void main() {
    vec2 point=aPosition.xy/max(uSize,vec2(1.0));
    float span=max(uDepth.y-uDepth.x,0.0001);
    float z=clamp((aPosition.z-uDepth.x)/span,0.0,1.0);
    gl_Position=vec4(point.x*2.0-1.0,1.0-point.y*2.0,z,1.0);
    vColor=aColor;
   }
  """
  private const val FRAGMENT_SHADER="""
   precision mediump float;
   varying vec4 vColor;
   void main() { gl_FragColor=vColor; }
  """
 }
}
