import ExpoModulesCore
import UIKit

/// One depth-buffered, smoothly shaded surface shared by the guide, atlas and volume views.
final class FormMuscleMeshView: ExpoView {
  private var faces: [Double] = []
  private static let faceSize = 16
  private static let colorSpace = CGColorSpaceCreateDeviceRGB()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isOpaque = false
    contentMode = .redraw
    isUserInteractionEnabled = false
  }

  func setFaces(_ next: [Double]) {
    faces = next.count.isMultiple(of: Self.faceSize) && next.count <= 110_000 ? next : []
    setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext(), !faces.isEmpty, bounds.width > 0, bounds.height > 0 else { return }
    // Cap render resolution on tablets. The viewport is small and the final image is filtered.
    let scale = Double(min(1.5, 700 / max(bounds.width, bounds.height)))
    let width = max(1, Int(ceil(Double(bounds.width) * scale)))
    let height = max(1, Int(ceil(Double(bounds.height) * scale)))
    var pixels = [UInt32](repeating: 0, count: width * height)
    var depth = [Float](repeating: -.infinity, count: width * height)

    func channel(_ color: Int, _ shift: Int) -> Double { Double((color >> shift) & 255) }
    func triangle(_ a: Int, _ b: Int, _ c: Int) {
      let ax=faces[a]*scale, ay=faces[a+1]*scale
      let bx=faces[b]*scale, by=faces[b+1]*scale
      let cx=faces[c]*scale, cy=faces[c+1]*scale
      let denominator=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
      guard abs(denominator) > 0.000001 else { return }
      let left=max(0,Int(floor(min(ax,min(bx,cx)))))
      let right=min(width-1,Int(ceil(max(ax,max(bx,cx)))))
      let top=max(0,Int(floor(min(ay,min(by,cy)))))
      let bottom=min(height-1,Int(ceil(max(ay,max(by,cy)))))
      guard left<=right, top<=bottom else { return }
      let ca=Int(faces[a+3]), cb=Int(faces[b+3]), cc=Int(faces[c+3])
      let ar=channel(ca,16), ag=channel(ca,8), ab=channel(ca,0)
      let br=channel(cb,16), bg=channel(cb,8), bb=channel(cb,0)
      let cr=channel(cc,16), cg=channel(cc,8), cbBlue=channel(cc,0)
      for y in top...bottom {
        for x in left...right {
          let dx=Double(x)+0.5-cx, dy=Double(y)+0.5-cy
          let u=((by-cy)*dx+(cx-bx)*dy)/denominator
          let v=((cy-ay)*dx+(ax-cx)*dy)/denominator
          let w=1-u-v
          guard u >= -0.000001, v >= -0.000001, w >= -0.000001 else { continue }
          let z=Float(u*faces[a+2]+v*faces[b+2]+w*faces[c+2])
          let index=y*width+x
          guard z > depth[index] else { continue }
          depth[index]=z
          let red=UInt32(clamping: Int(ar*u+br*v+cr*w+0.5))
          let green=UInt32(clamping: Int(ag*u+bg*v+cg*w+0.5))
          let blue=UInt32(clamping: Int(ab*u+bb*v+cbBlue*w+0.5))
          pixels[index]=0xff000000 | (red<<16) | (green<<8) | blue
        }
      }
    }
    for offset in stride(from: 0, to: faces.count, by: Self.faceSize) {
      triangle(offset,offset+4,offset+8)
      triangle(offset,offset+8,offset+12)
    }
    let data=pixels.withUnsafeBytes { Data($0) }
    guard let provider=CGDataProvider(data: data as CFData),
      let image=CGImage(width: width,height: height,bitsPerComponent: 8,bitsPerPixel: 32,bytesPerRow: width*4,
        space: Self.colorSpace,bitmapInfo: [.byteOrder32Little,CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedFirst.rawValue)],
        provider: provider,decode: nil,shouldInterpolate: true,intent: .defaultIntent) else { return }
    context.interpolationQuality = .high
    UIImage(cgImage: image).draw(in: bounds)
  }
}
