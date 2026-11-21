import ExpoModulesCore
import HealthKit
import UIKit
import Vision
import WatchConnectivity

public final class FormDeviceModule: Module {
  private let health = HKHealthStore()
  private let watch = PhoneWatchBridge.shared
  public func definition() -> ModuleDefinition {
    Name("FormDevice")
    View(FormMuscleMeshView.self) {
      Prop("faces") { (view: FormMuscleMeshView, faces: [Double]) in view.setFaces(faces) }
    }
    OnCreate { self.watch.activate() }
    AsyncFunction("healthAvailable") { HKHealthStore.isHealthDataAvailable() }
    AsyncFunction("authorize") { () async throws -> Bool in
      guard HKHealthStore.isHealthDataAvailable() else { return false }
      try await self.health.requestAuthorization(toShare: self.writeTypes, read: self.readTypes)
      // HealthKit deliberately does not disclose denied read authorization.
      return true
    }
    AsyncFunction("readHealth") { () async throws -> [String: Any] in
      let start = Calendar.current.startOfDay(for: Date())
      async let steps = self.sum(.stepCount, unit: .count(), start: start)
      // Android는 최근 30일 범위에서만 심박을 읽습니다. 범위를 두지 않으면 몇 달 전 값이
      // '최근 심박'으로 표시되므로 같은 30일 창을 사용합니다.
      async let hr = self.latest(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), since: Date().addingTimeInterval(-30 * 86400))
      async let weight = self.latest(.bodyMass, unit: .gramUnit(with: .kilo))
      async let fat = self.latest(.bodyFatPercentage, unit: .percent())
      async let workouts = self.workouts()
      let (s,h,w,f,x) = try await (steps,hr,weight,fat,workouts)
      return ["steps": s as Any? ?? NSNull(), "heartRate": h as Any? ?? NSNull(), "weight": w as Any? ?? NSNull(), "bodyFat": f.map { $0 * 100 } as Any? ?? NSNull(), "workouts": x]
    }
    /// 인바디 결과지 이미지에서 글자를 읽습니다. Vision을 쓰는 온디바이스 인식이라 외부 API가 필요 없습니다.
    AsyncFunction("recognizeText") { (uri: String) async throws -> String in
      guard let url = URL(string: uri) ?? URL(string: "file://" + uri), url.isFileURL else { throw FormError.invalid }
      let data = try Data(contentsOf: url)
      guard let image = UIImage(data: data)?.cgImage else { throw FormError.invalid }
      return try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<String, Error>) in
        let request = VNRecognizeTextRequest { request, error in
          if let error = error { continuation.resume(throwing: error); return }
          let lines = (request.results as? [VNRecognizedTextObservation] ?? []).compactMap { $0.topCandidates(1).first?.string }
          continuation.resume(returning: lines.joined(separator: "\n"))
        }
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["ko-KR", "en-US"]
        request.usesLanguageCorrection = true
        do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([request]) } catch { continuation.resume(throwing: error) }
      }
    }
    AsyncFunction("saveBody") { (id: String, date: String, weight: Double, fat: Double?, revision: Int) async throws in
      guard revision >= 1, revision <= 2147483647, weight >= 20, weight <= 400, let time = Self.date(date) else { throw FormError.invalid }
      var values: [HKSample] = [self.quantity(.bodyMass, unit: .gramUnit(with: .kilo), value: weight, date: time, id: id + "-weight", revision: revision)]
      if let f = fat { guard f >= 0, f <= 75 else { throw FormError.invalid }; values.append(self.quantity(.bodyFatPercentage, unit: .percent(), value: f / 100, date: time, id: id + "-fat", revision: revision)) }
      try await self.health.save(values)
    }
    AsyncFunction("saveWorkout") { (id: String, name: String, start: String, end: String) async throws in
      guard let a = Self.date(start), let b = Self.date(end), b > a else { throw FormError.invalid }
      let workout = HKWorkout(activityType: .traditionalStrengthTraining, start: a, end: b, duration: b.timeIntervalSince(a), totalEnergyBurned: nil, totalDistance: nil, metadata: [HKMetadataKeySyncIdentifier: "form-" + id, HKMetadataKeySyncVersion: 1, HKMetadataKeyWorkoutBrandName: "FORM", "FormWorkoutName": name])
      try await self.health.save(workout)
    }
    AsyncFunction("watchStatus") { () -> [String: Bool] in
      guard WCSession.isSupported() else { return ["connected": false, "paired": false] }
      return ["connected": WCSession.default.isReachable, "paired": WCSession.default.isPaired && WCSession.default.isWatchAppInstalled]
    }
    AsyncFunction("sendWatch") { (payload: String) throws in
      // Android는 워치가 연결되지 않아도 DataClient에 마지막 상태를 남겨 두고 연결되면 전달합니다.
      // iOS도 세션 활성화 전 호출을 실패시키지 않고 최신 상태를 보관했다가 활성화 후 보냅니다.
      guard WCSession.isSupported() else { throw FormError.watchUnavailable }
      self.watch.push(payload)
    }
    AsyncFunction("drainWatch") { self.watch.pending() }
    AsyncFunction("ackWatch") { (ids: [String]) in self.watch.ack(ids) }
  }
  private var writeTypes: Set<HKSampleType> { [HKObjectType.quantityType(forIdentifier: .bodyMass)!, HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)!, HKObjectType.workoutType()] }
  private var readTypes: Set<HKObjectType> { [.quantityType(forIdentifier: .stepCount)!, .quantityType(forIdentifier: .heartRate)!, .quantityType(forIdentifier: .bodyMass)!, .quantityType(forIdentifier: .bodyFatPercentage)!, .workoutType()] }
  static func date(_ text: String) -> Date? { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: text) ?? ISO8601DateFormatter().date(from: text) }
  private func quantity(_ type: HKQuantityTypeIdentifier, unit: HKUnit, value: Double, date: Date, id: String, revision: Int) -> HKQuantitySample { HKQuantitySample(type: HKObjectType.quantityType(forIdentifier: type)!, quantity: HKQuantity(unit: unit, doubleValue: value), start: date, end: date, metadata: [HKMetadataKeySyncIdentifier: "form-" + id, HKMetadataKeySyncVersion: revision]) }
  /// `since`를 주면 그 시각 이후 표본만 봅니다. 체중·체지방은 기간 제한 없이 최신 값을 쓰고,
  /// 심박만 Android와 같은 30일 창을 씁니다.
  private func latest(_ type: HKQuantityTypeIdentifier, unit: HKUnit, since: Date? = nil) async throws -> Double? {
    try await withCheckedThrowingContinuation { continuation in
      let predicate = since.map { HKQuery.predicateForSamples(withStart: $0, end: Date()) }
      let query = HKSampleQuery(sampleType: HKObjectType.quantityType(forIdentifier: type)!, predicate: predicate, limit: 1, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, error in
        if let error = error { continuation.resume(throwing: error) } else { continuation.resume(returning: (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)) }
      }; health.execute(query)
    }
  }
  private func sum(_ type: HKQuantityTypeIdentifier, unit: HKUnit, start: Date) async throws -> Double? {
    try await withCheckedThrowingContinuation { continuation in
      let query = HKStatisticsQuery(quantityType: HKObjectType.quantityType(forIdentifier: type)!, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: start, end: Date()), options: .cumulativeSum) { _, result, error in
        if let error = error { continuation.resume(throwing: error) } else { continuation.resume(returning: result?.sumQuantity()?.doubleValue(for: unit)) }
      }; health.execute(query)
    }
  }
  private func workouts() async throws -> [[String: Any]] {
    try await withCheckedThrowingContinuation { continuation in
      let predicate = HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-30 * 86400), end: Date())
      let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: predicate, limit: 100, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, error in
        if let error = error { continuation.resume(throwing: error); return }
        let format = ISO8601DateFormatter()
        continuation.resume(returning: (samples as? [HKWorkout] ?? []).map { ["id": $0.uuid.uuidString, "name": ($0.metadata?["FormWorkoutName"] as? String) ?? "건강 앱 운동", "start": format.string(from: $0.startDate), "end": format.string(from: $0.endDate)] })
      }; health.execute(query)
    }
  }
}
enum FormError: Error { case invalid, watchUnavailable }

final class PhoneWatchBridge: NSObject, WCSessionDelegate {
  static let shared = PhoneWatchBridge()
  private let lock = NSLock()
  private let key = "form.watch.inbox.v1"
  /// 워치로 보낼 최신 상태. 세션이 활성화되면 한 번만 전달합니다(Android DataClient와 같은 의미).
  private var latest: String?
  func activate() { if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() } }
  func push(_ payload: String) { lock.lock(); latest = payload; lock.unlock(); flush() }
  private func flush() {
    guard WCSession.isSupported(), WCSession.default.activationState == .activated else { activate(); return }
    lock.lock(); let text = latest; lock.unlock()
    guard let text = text else { return }
    // 전달에 실패하면 latest를 남겨 두고 다음 활성화·상태 변경에서 다시 시도합니다.
    guard (try? WCSession.default.updateApplicationContext(["payload": text])) != nil else { return }
    if WCSession.default.isReachable { WCSession.default.sendMessage(["payload": text], replyHandler: nil, errorHandler: nil) }
  }
  func pending() -> [String] { lock.lock(); defer { lock.unlock() }; return UserDefaults.standard.stringArray(forKey: key) ?? [] }
  func ack(_ ids: [String]) { lock.lock(); defer { lock.unlock() }; let values = UserDefaults.standard.stringArray(forKey: key) ?? []; UserDefaults.standard.set(values.filter { text in guard let data = text.data(using: .utf8), let item = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let id = item["id"] as? String else { return false }; return !ids.contains(id) }, forKey: key) }
  private func receive(_ info: [String: Any]) { guard let text = info["payload"] as? String, text.utf8.count < 64000 else { return }; lock.lock(); defer { lock.unlock() }; var queue = UserDefaults.standard.stringArray(forKey: key) ?? []; if !queue.contains(text) { queue.append(text) }; UserDefaults.standard.set(queue, forKey: key) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) { receive(userInfo) }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { if activationState == .activated { flush() } }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate(); flush() }
}
