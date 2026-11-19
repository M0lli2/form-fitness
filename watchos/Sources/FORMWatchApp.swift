import SwiftUI
import HealthKit
import WatchConnectivity

/// SwiftUI 워치 앱: 휴대폰 세트 리모컨과 독립 HealthKit 운동 세션을 제공합니다.
@main struct FORMWatchApp: App {
  @StateObject private var model = WatchModel()
  var body: some Scene { WindowGroup { WatchHome().environmentObject(model) } }
}

struct WatchHome: View {
  @EnvironmentObject var model: WatchModel
  var body: some View {
    ScrollView {
      VStack(spacing: 12) {
        Text("form.").font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(.green)
        if model.running {
          Text("근력 트레이닝").font(.headline)
          Text(model.start, style: .timer).font(.title2.monospacedDigit())
          // Wear OS와 같이 심박이 아직 없으면 0이 아니라 측정 대기를 표시합니다.
          HStack {
            Text(model.heartRate > 0 ? "♥ \(Int(model.heartRate)) bpm" : "심박 측정 대기")
            Text("\(Int(model.energy)) kcal")
          }.font(.caption)
          Button(model.paused ? "계속" : "일시정지") { model.togglePause() }
          Button("운동 마치고 저장") { model.end() }.tint(.green).disabled(model.saving)
        } else {
          if let next = model.next, let name = next["exerciseName"] as? String {
            Text(name).font(.headline)
            // 유산소·아이소메트릭 세트는 중량 대신 시간으로 표시합니다(Wear OS와 동일).
            if next["type"] as? String == "strength" {
              Text("\(next["weight"] as? Double ?? 0, specifier: "%.1f") kg × \(next["reps"] as? Int ?? 0)회").font(.caption)
            } else {
              Text("\(next["seconds"] as? Int ?? 0)초").font(.caption)
            }
            if let rest = model.restEnd, rest > Date() { Text(rest, style: .timer).foregroundStyle(.green) }
            Button("세트 완료 ✓") { model.completeSet() }.tint(.green).disabled(model.sentSet == next["setId"] as? String)
            Text("휴대폰 입력값으로 기록됩니다.").font(.system(size: 10)).foregroundStyle(.secondary)
          } else { Text("휴대폰에서 운동을 시작하거나, 워치에서 기록하세요.").font(.caption).multilineTextAlignment(.center) }
          Button("워치에서 운동 시작") { Task { await model.begin() } }.disabled(model.busy)
        }
        if !model.message.isEmpty { Text(model.message).font(.caption2).foregroundStyle(.secondary) }
      }.padding(.horizontal, 8)
    }
  }
}

/// HealthKit이 수집한 심박·에너지만 표시합니다. 임의의 칼로리 추정치는 만들지 않습니다.
final class WatchModel: NSObject, ObservableObject, WCSessionDelegate, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
  @Published var next: [String: Any]?
  @Published var restEnd: Date?
  @Published var running = false
  @Published var paused = false
  @Published var saving = false
  @Published var busy = false
  @Published var heartRate = 0.0
  @Published var energy = 0.0
  @Published var start = Date()
  @Published var message = ""
  @Published var sentSet: String?
  private let store = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?
  private var phoneSession: String?
  private var workoutID = UUID().uuidString
  override init() { super.init(); if WCSession.isSupported() { WCSession.default.delegate = self; WCSession.default.activate() } }

  /// transferUserInfo가 연결 끊김을 견디는 영속 전송 큐를 제공합니다.
  func send(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object), let text = String(data: data, encoding: .utf8) else { return }
    WCSession.default.transferUserInfo(["payload": text])
    if WCSession.default.isReachable { WCSession.default.sendMessage(["payload": text], replyHandler: nil, errorHandler: nil) }
  }
  func completeSet() {
    guard let n = next, let session = phoneSession, let set = n["setId"] as? String, let exercise = n["exerciseId"] as? String else { return }
    send(["id": UUID().uuidString, "action": "completeSet", "sessionId": session, "exerciseId": exercise, "setId": set])
    sentSet = set; message = "휴대폰 동기화 대기"
  }
  func receive(_ object: [String: Any]) {
    guard let text = object["payload"] as? String, let data = text.data(using: .utf8), let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
    DispatchQueue.main.async { self.phoneSession = value["sessionId"] as? String; self.next = value["next"] as? [String: Any]; self.restEnd = (value["restEndsAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) }; if self.next?["setId"] as? String != self.sentSet { self.sentSet = nil; self.message = "" } }
  }
  @MainActor func begin() async {
    guard !running, !busy else { return }; busy = true; defer { busy = false }
    do {
      try await store.requestAuthorization(toShare: [HKObjectType.workoutType(), HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!], read: [HKObjectType.quantityType(forIdentifier: .heartRate)!, HKObjectType.quantityType(forIdentifier: .activeEnergyBurned)!])
      let config = HKWorkoutConfiguration(); config.activityType = .traditionalStrengthTraining; config.locationType = .indoor
      let workout = try HKWorkoutSession(healthStore: store, configuration: config)
      let live = workout.associatedWorkoutBuilder(); live.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
      workout.delegate = self; live.delegate = self; session = workout; builder = live
      start = Date(); workoutID = UUID().uuidString; heartRate = 0; energy = 0; paused = false
      workout.startActivity(with: start); try await live.beginCollection(at: start)
      running = true; message = ""
    } catch { session?.end(); session = nil; builder = nil; message = error.localizedDescription }
  }
  func togglePause() { if paused { session?.resume() } else { session?.pause() } }
  func end() { guard running, !saving else { return }; saving = true; session?.end() }
  /// 운동은 워치에서 한 번만 저장하며 휴대폰은 해당 기록을 다시 HealthKit에 쓰지 않습니다.
  private func finish(at end: Date) {
    guard let builder = builder else { return }
    Task { @MainActor in
      do {
        try await builder.endCollection(at: end)
        _ = try await builder.finishWorkout()
        let format = ISO8601DateFormatter()
        send(["id": workoutID, "action": "workoutFinished", "start": format.string(from: start), "end": format.string(from: end), "healthSaved": true])
        running = false; saving = false; session = nil; self.builder = nil; message = "건강 앱에 저장 · 휴대폰 전송 대기"
      } catch { saving = false; message = "저장 실패: " + error.localizedDescription }
    }
  }
  func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo state: HKWorkoutSessionState, from oldState: HKWorkoutSessionState, date: Date) { DispatchQueue.main.async { self.paused = state == .paused }; if state == .ended { finish(at: date) } }
  func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) { DispatchQueue.main.async { self.message = error.localizedDescription; self.saving = false } }
  func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
  func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
    for type in collectedTypes { guard let quantity = type as? HKQuantityType, let statistics = workoutBuilder.statistics(for: quantity) else { continue }; DispatchQueue.main.async { if quantity.identifier == HKQuantityTypeIdentifier.heartRate.rawValue { self.heartRate = statistics.mostRecentQuantity()?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) ?? self.heartRate }; if quantity.identifier == HKQuantityTypeIdentifier.activeEnergyBurned.rawValue { self.energy = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) ?? self.energy } } }
  }
  func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { receive(session.receivedApplicationContext) }
  func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) { receive(applicationContext) }
  func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { receive(message) }
}
