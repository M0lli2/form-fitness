import ExpoModulesCore
import UIKit

/// Draws the projected anatomy as one native view in UIKit points.
final class FormMuscleMeshView: ExpoView {
  private var faces: [Double] = []
  private let rgb = CGColorSpaceCreateDeviceRGB()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isOpaque = false
    isUserInteractionEnabled = false
  }

  func setFaces(_ next: [Double]) {
    faces = next.count.isMultiple(of: 9) && next.count <= 18_000 ? next : []
    setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    guard let context = UIGraphicsGetCurrentContext() else { return }
    context.setFillColorSpace(rgb)
    context.setStrokeColorSpace(rgb)
    // Cover antialiasing seams between the opaque faces.
    context.setLineWidth(0.35)
    for offset in stride(from: 0, to: faces.count, by: 9) {
      context.beginPath()
      context.move(to: CGPoint(x: faces[offset], y: faces[offset + 1]))
      for vertex in 1...3 {
        let at = offset + vertex * 2
        context.addLine(to: CGPoint(x: faces[at], y: faces[at + 1]))
      }
      context.closePath()
      let color = Int(faces[offset + 8])
      let red = CGFloat((color >> 16) & 255) / 255
      let green = CGFloat((color >> 8) & 255) / 255
      let blue = CGFloat(color & 255) / 255
      context.setFillColor(red: red, green: green, blue: blue, alpha: 1)
      context.setStrokeColor(red: red, green: green, blue: blue, alpha: 1)
      context.drawPath(using: .fillStroke)
    }
  }
}
