import ExpoModulesCore
import HealthKit
import WatchConnectivity

public final class FormDeviceModule: Module {
  private let health = HKHealthStore()
  private let watch = PhoneWatchBridge.shared
  public func definition() -> ModuleDefinition {
    Name("FormDevice")
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
      async let hr = self.latest(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()))
      async let weight = self.latest(.bodyMass, unit: .gramUnit(with: .kilo))
      async let fat = self.latest(.bodyFatPercentage, unit: .percent())
      async let workouts = self.workouts()
      let (s,h,w,f,x) = try await (steps,hr,weight,fat,workouts)
      return ["steps": s as Any? ?? NSNull(), "heartRate": h as Any? ?? NSNull(), "weight": w as Any? ?? NSNull(), "bodyFat": f.map { $0 * 100 } as Any? ?? NSNull(), "workouts": x]
    }
    AsyncFunction("saveBody") { (id: String, date: String, weight: Double, fat: Double?) async throws in
      guard weight >= 20, weight <= 400, let time = Self.date(date) else { throw FormError.invalid }
      var values: [HKSample] = [self.quantity(.bodyMass, unit: .gramUnit(with: .kilo), value: weight, date: time, id: id + "-weight")]
      if let f = fat { guard f >= 0, f <= 75 else { throw FormError.invalid }; values.append(self.quantity(.bodyFatPercentage, unit: .percent(), value: f / 100, date: time, id: id + "-fat")) }
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
      guard WCSession.isSupported(), WCSession.default.activationState == .activated else { throw FormError.watchUnavailable }
      try WCSession.default.updateApplicationContext(["payload": payload])
      if WCSession.default.isReachable { WCSession.default.sendMessage(["payload": payload], replyHandler: nil, errorHandler: nil) }
    }
    AsyncFunction("drainWatch") { self.watch.pending() }
    AsyncFunction("ackWatch") { (ids: [String]) in self.watch.ack(ids) }
  }
  private var writeTypes: Set<HKSampleType> { [HKObjectType.quantityType(forIdentifier: .bodyMass)!, HKObjectType.quantityType(forIdentifier: .bodyFatPercentage)!, HKObjectType.workoutType()] }
  private var readTypes: Set<HKObjectType> { [.quantityType(forIdentifier: .stepCount)!, .quantityType(forIdentifier: .heartRate)!, .quantityType(forIdentifier: .bodyMass)!, .quantityType(forIdentifier: .bodyFatPercentage)!, .workoutType()] }
  static func date(_ text: String) -> Date? { let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f.date(from: text) ?? ISO8601DateFormatter().date(from: text) }
  private func quantity(_ type: HKQuantityTypeIdentifier, unit: HKUnit, value: Double, date: Date, id: String) -> HKQuantitySample { HKQuantitySample(type: HKObjectType.quantityType(forIdentifier: type)!, quantity: HKQuantity(unit: unit, doubleValue: value), start: date, end: date, metadata: [HKMetadataKeySyncIdentifier: "form-" + id, HKMetadataKeySyncVersion: 1]) }
  private func latest(_ type: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
    try await withCheckedThrowingContinuation { continuation in
      let query = HKSampleQuery(sampleType: HKObjectType.quantityType(forIdentifier: type)!, predicate: nil, limit: 1, sortDescriptors: [NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)]) { _, samples, error in
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
  func activate() { if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() } }
  func pending() -> [String] { lock.lock(); defer { lock.unlock() }; return UserDefaults.standard.stringArray(forKey: key) ?? [] }
  func ack(_ ids: [String]) { lock.lock(); defer { lock.unlock() }; let values = UserDefaults.standard.stringArray(forKey: key) ?? []; UserDefaults.standard.set(values.filter { text in guard let data = text.data(using: .utf8), let item = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let id = item["id"] as? String else { return false }; return !ids.contains(id) }, forKey: key) }
  private func receive(_ info: [String: Any]) { guard let text = info["payload"] as? String, text.utf8.count < 64000 else { return }; lock.lock(); defer { lock.unlock() }; var queue = UserDefaults.standard.stringArray(forKey: key) ?? []; if !queue.contains(text) { queue.append(text) }; UserDefaults.standard.set(queue, forKey: key) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
  func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) { receive(userInfo) }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {}
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { session.activate() }
}
