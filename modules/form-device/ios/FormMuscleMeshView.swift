import ExpoModulesCore
import Metal
import MetalKit
import UIKit

/// 근육 표면은 Metal로 그립니다. 기기 배율 전체(Retina 3x) 해상도에 4x MSAA를 더해
/// 실루엣의 계단 현상 없이 그리고, Metal을 쓸 수 없을 때만 예전 CPU 래스터라이저로 물러납니다.
final class FormMuscleMeshView: ExpoView, MTKViewDelegate {
  private static let faceSize = 16
  private static let faceLimit = 110_000
  private static let colorSpace = CGColorSpaceCreateDeviceRGB()
  private static let shaderSource = """
  #include <metal_stdlib>
  using namespace metal;

  struct FormUniforms { float2 size; float2 depth; };
  struct FormVertexIn { float4 position [[attribute(0)]]; float4 color [[attribute(1)]]; };
  struct FormVertexOut { float4 position [[position]]; float4 color; };

  vertex FormVertexOut formAnatomyVertex(FormVertexIn in [[stage_in]], constant FormUniforms &uniforms [[buffer(1)]]) {
    // Vertices arrive in view points; fragments are drawn at the drawable pixel resolution.
    float2 point = in.position.xy / max(uniforms.size, float2(1.0));
    float span = max(uniforms.depth.y - uniforms.depth.x, 0.0001);
    float z = clamp((in.position.z - uniforms.depth.x) / span, 0.0, 1.0);
    FormVertexOut out;
    out.position = float4(point.x * 2.0 - 1.0, 1.0 - point.y * 2.0, z, 1.0);
    out.color = in.color;
    return out;
  }

  fragment float4 formAnatomyFragment(FormVertexOut in [[stage_in]]) { return in.color; }
  """

  private struct Vertex { var position: SIMD4<Float>; var color: SIMD4<Float> }
  private struct Uniforms { var size: SIMD2<Float>; var depth: SIMD2<Float> }

  private let metalView: MTKView?
  private let commandQueue: MTLCommandQueue?
  private let pipeline: MTLRenderPipelineState?
  private let depthState: MTLDepthStencilState?
  private var buffer: MTLBuffer?
  private var capacity = 0
  private var vertexCount = 0
  private var depth = SIMD2<Float>(0, 1)
  private var faces: [Double] = []
  private var stale = true

  required init(appContext: AppContext? = nil) {
    let device = MTLCreateSystemDefaultDevice()
    let samples = device.map { $0.supportsTextureSampleCount(4) ? 4 : 1 } ?? 1
    let view = device.map { MTKView(frame: .zero, device: $0) }
    let queue = device?.makeCommandQueue()
    let pipeline = device.flatMap { FormMuscleMeshView.makePipeline($0, samples: samples) }
    metalView = queue != nil && pipeline != nil ? view : nil
    commandQueue = queue
    self.pipeline = pipeline
    depthState = device.flatMap { FormMuscleMeshView.makeDepthState($0) }
    super.init(appContext: appContext)
    isOpaque = false
    contentMode = .redraw
    isUserInteractionEnabled = false
    guard let metalView = metalView else { return }
    metalView.delegate = self
    metalView.isPaused = true
    metalView.enableSetNeedsDisplay = true
    metalView.autoResizeDrawable = true
    metalView.framebufferOnly = false
    metalView.isOpaque = false
    metalView.backgroundColor = .clear
    metalView.colorPixelFormat = .bgra8Unorm
    metalView.sampleCount = samples
    metalView.depthStencilPixelFormat = .depth32Float
    metalView.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 0)
    metalView.clearDepth = 0
    metalView.isUserInteractionEnabled = false
    metalView.contentScaleFactor = UIScreen.main.scale
    addSubview(metalView)
  }

  private static func makePipeline(_ device: MTLDevice, samples: Int) -> MTLRenderPipelineState? {
    guard let library = try? device.makeLibrary(source: shaderSource, options: nil),
      let vertex = library.makeFunction(name: "formAnatomyVertex"),
      let fragment = library.makeFunction(name: "formAnatomyFragment") else { return nil }
    let attributes = MTLVertexDescriptor()
    attributes.attributes[0].format = .float4
    attributes.attributes[0].offset = 0
    attributes.attributes[0].bufferIndex = 0
    attributes.attributes[1].format = .float4
    attributes.attributes[1].offset = MemoryLayout<SIMD4<Float>>.stride
    attributes.attributes[1].bufferIndex = 0
    attributes.layouts[0].stride = MemoryLayout<Vertex>.stride
    attributes.layouts[0].stepFunction = .perVertex
    let descriptor = MTLRenderPipelineDescriptor()
    descriptor.vertexFunction = vertex
    descriptor.fragmentFunction = fragment
    descriptor.vertexDescriptor = attributes
    descriptor.rasterSampleCount = samples
    descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
    descriptor.depthAttachmentPixelFormat = .depth32Float
    return try? device.makeRenderPipelineState(descriptor: descriptor)
  }

  private static func makeDepthState(_ device: MTLDevice) -> MTLDepthStencilState? {
    let descriptor = MTLDepthStencilDescriptor()
    // 깊이 값은 0(먼 곳)에서 1(가까운 곳)로 정규화하고, 빈 픽셀은 0으로 지웁니다.
    descriptor.depthCompareFunction = .greaterEqual
    descriptor.isDepthWriteEnabled = true
    return device.makeDepthStencilState(descriptor: descriptor)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard let metalView = metalView else { return }
    metalView.frame = bounds
    metalView.contentScaleFactor = UIScreen.main.scale
    // 배치가 끝난 뒤 드로어블 크기가 바뀌므로 한 번 다시 그립니다.
    if bounds.width > 0, bounds.height > 0 { metalView.setNeedsDisplay() }
  }

  func setFaces(_ next: [Double]) {
    faces = next.count.isMultiple(of: Self.faceSize) && next.count <= Self.faceLimit ? next : []
    stale = true
    if let metalView = metalView { metalView.setNeedsDisplay() } else { setNeedsDisplay() }
  }

  func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {}

  func draw(in view: MTKView) {
    guard let queue = commandQueue, let pipeline = pipeline, let depthState = depthState,
      let descriptor = view.currentRenderPassDescriptor, let drawable = view.currentDrawable else { return }
    if stale { rebuild() }
    let width = Float(max(bounds.width, 1)), height = Float(max(bounds.height, 1))
    if vertexCount > 0, let buffer = buffer,
      let command = queue.makeCommandBuffer(),
      let encoder = command.makeRenderCommandEncoder(descriptor: descriptor) {
      var uniforms = Uniforms(size: SIMD2<Float>(width, height), depth: depth)
      encoder.setRenderPipelineState(pipeline)
      encoder.setDepthStencilState(depthState)
      encoder.setVertexBuffer(buffer, offset: 0, index: 0)
      encoder.setVertexBytes(&uniforms, length: MemoryLayout<Uniforms>.stride, index: 1)
      encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: vertexCount)
      encoder.endEncoding()
      command.present(drawable)
      command.commit()
      return
    }
    // 표면이 비어 있으면 투명한 드로어블만 돌려주고 이전 프레임을 남기지 않습니다.
    if let command = queue.makeCommandBuffer(), let encoder = command.makeRenderCommandEncoder(descriptor: descriptor) {
      encoder.endEncoding()
      command.present(drawable)
      command.commit()
    }
  }

  /// 정점 버퍼를 만듭니다. 좌표는 뷰 포인트, 깊이는 이번 표면의 최솟값·최댓값 사이로 정규화합니다.
  private func rebuild() {
    stale = false
    vertexCount = 0
    let triangles = faces.count / Self.faceSize * 6
    guard triangles > 0, let device = metalView?.device else { return }
    if buffer == nil || capacity < triangles {
      let next = max(triangles, 4096)
      buffer = device.makeBuffer(length: next * MemoryLayout<Vertex>.stride, options: .storageModeShared)
      capacity = buffer == nil ? 0 : next
    }
    guard let buffer = buffer else { return }
    var low = Double.infinity, high = -.infinity
    faces.withUnsafeBufferPointer { source in
      let count = source.count
      for offset in stride(from: 0, to: count, by: Self.faceSize) {
        for corner in 0..<4 {
          let z = source[offset + corner * 4 + 2]
          low = min(low, z)
          high = max(high, z)
        }
      }
      depth = SIMD2<Float>(Float(low), Float(low + max(high - low, 0.0001)))
      let target = buffer.contents().bindMemory(to: Vertex.self, capacity: capacity)
      var index = 0
      func write(_ base: Int) {
        let color = Int(source[base + 3])
        target[index] = Vertex(
          position: SIMD4<Float>(Float(source[base]), Float(source[base + 1]), Float(source[base + 2]), 1),
          color: SIMD4<Float>(Float((color >> 16) & 255) / 255, Float((color >> 8) & 255) / 255,
            Float(color & 255) / 255, 1))
        index += 1
      }
      for offset in stride(from: 0, to: count, by: Self.faceSize) {
        write(offset)
        write(offset + 4)
        write(offset + 8)
        write(offset)
        write(offset + 8)
        write(offset + 12)
      }
      vertexCount = index
    }
  }

  /// Metal을 쓸 수 없는 기기에서만 쓰는 예전 소프트웨어 경로입니다.
  override func draw(_ rect: CGRect) {
    guard metalView == nil, let context = UIGraphicsGetCurrentContext(),
      !faces.isEmpty, bounds.width > 0, bounds.height > 0 else { return }
    let scale = Double(min(1.5, 700 / max(bounds.width, bounds.height)))
    let width = max(1, Int(ceil(Double(bounds.width) * scale)))
    let height = max(1, Int(ceil(Double(bounds.height) * scale)))
    var pixels = [UInt32](repeating: 0, count: width * height)
    var depthBuffer = [Float](repeating: -.infinity, count: width * height)

    func channel(_ color: Int, _ shift: Int) -> Double { Double((color >> shift) & 255) }
    func triangle(_ a: Int, _ b: Int, _ c: Int) {
      let ax = faces[a] * scale, ay = faces[a + 1] * scale
      let bx = faces[b] * scale, by = faces[b + 1] * scale
      let cx = faces[c] * scale, cy = faces[c + 1] * scale
      let denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
      guard abs(denominator) > 0.000001 else { return }
      let left = max(0, Int(floor(min(ax, min(bx, cx)))))
      let right = min(width - 1, Int(ceil(max(ax, max(bx, cx)))))
      let top = max(0, Int(floor(min(ay, min(by, cy)))))
      let bottom = min(height - 1, Int(ceil(max(ay, max(by, cy)))))
      guard left <= right, top <= bottom else { return }
      let ca = Int(faces[a + 3]), cb = Int(faces[b + 3]), cc = Int(faces[c + 3])
      let ar = channel(ca, 16), ag = channel(ca, 8), ab = channel(ca, 0)
      let br = channel(cb, 16), bg = channel(cb, 8), bb = channel(cb, 0)
      let cr = channel(cc, 16), cg = channel(cc, 8), cbBlue = channel(cc, 0)
      for y in top...bottom {
        for x in left...right {
          let dx = Double(x) + 0.5 - cx, dy = Double(y) + 0.5 - cy
          let u = ((by - cy) * dx + (cx - bx) * dy) / denominator
          let v = ((cy - ay) * dx + (ax - cx) * dy) / denominator
          let w = 1 - u - v
          guard u >= -0.000001, v >= -0.000001, w >= -0.000001 else { continue }
          let z = Float(u * faces[a + 2] + v * faces[b + 2] + w * faces[c + 2])
          let index = y * width + x
          guard z > depthBuffer[index] else { continue }
          depthBuffer[index] = z
          let red = UInt32(clamping: Int(ar * u + br * v + cr * w + 0.5))
          let green = UInt32(clamping: Int(ag * u + bg * v + cg * w + 0.5))
          let blue = UInt32(clamping: Int(ab * u + bb * v + cbBlue * w + 0.5))
          pixels[index] = 0xff000000 | (red << 16) | (green << 8) | blue
        }
      }
    }
    for offset in stride(from: 0, to: faces.count, by: Self.faceSize) {
      triangle(offset, offset + 4, offset + 8)
      triangle(offset, offset + 8, offset + 12)
    }
    let data = pixels.withUnsafeBytes { Data($0) }
    guard let provider = CGDataProvider(data: data as CFData),
      let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32, bytesPerRow: width * 4,
        space: Self.colorSpace, bitmapInfo: [.byteOrder32Little, CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedFirst.rawValue)],
        provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else { return }
    context.interpolationQuality = .high
    UIImage(cgImage: image).draw(in: bounds)
  }
}
