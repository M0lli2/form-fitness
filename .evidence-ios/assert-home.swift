
import Foundation
import Vision
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["ko-KR", "en-US"]
try VNImageRequestHandler(url: url).perform([request])
let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
print(text)
guard text.contains("오늘"), !text.contains("entitlement"), !text.contains("failed") else { exit(1) }
