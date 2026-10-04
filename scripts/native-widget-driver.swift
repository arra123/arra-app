// Appended to the real ExpoWidgets pod only by the Simulator integration job.
@available(iOS 17.2, *)
public struct ArraWidgetTestDriver: View {
  @State private var ready = false
  @State private var selected = ""
  @State private var multipleResult = ""
  private let timer = Timer.publish(every: 0.2, on: .main, in: .common).autoconnect()
  private var props: [String: Any] {
    ["updated": Date().timeIntervalSince1970 * 1000, "agents": [
      ["key":"widget-test:first", "title":"Первый диалог", "project":"Тест", "number":1, "mascotId":14, "state":"work", "note":"Проверка системного нажатия"],
      ["key":"widget-test:second", "title":"Второй диалог", "project":"Тест", "number":2, "mascotId":3, "state":"wait", "note":"Второй агент ждёт ответа"]]]
  }
  public init() {}
  public var body: some View {
    VStack {
      Text(ready ? "ACTIVITY READY" : "STARTING").accessibilityIdentifier("activity-ready")
      Text(selected).accessibilityIdentifier("selected-key")
      Text(multipleResult)
      ArraDialogCard(props: props)
    }.task {
      do {
        if !CommandLine.arguments.contains("--arra-widget-ui-test-reset"), Activity<LiveActivityAttributes>.activities.contains(where: { $0.content.state.name == "ArraRings" && ($0.activityState == .active || $0.activityState == .stale) }) {
          selected = ArraSelection.selectedKey([:]) ?? "missing"
          ready = true
          return
        }
        for activity in Activity<LiveActivityAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
        let value = props
        try ArraSelection.save("widget-test:first")
        UserDefaults(suiteName: WidgetsStorage.appGroupIdentifier)?.set([["props":value]], forKey:"__expo_widgets_ArraAgents_timeline")
        let data = try JSONSerialization.data(withJSONObject: value)
        let state = LiveActivityAttributes.ContentState(name:"ArraRings",props:String(decoding:data,as:UTF8.self))
        var legacy: Activity<LiveActivityAttributes>?
        if CommandLine.arguments.contains("--arra-widget-ui-test-multiple") {
          let old: [String:Any] = ["agents":[["key":"widget-test:legacy","title":"Старый блок","state":"idle"]]]
          let data = try JSONSerialization.data(withJSONObject:old)
          legacy = try Activity.request(attributes:LiveActivityAttributes(),content:ActivityContent(state:.init(name:"ArraRings",props:String(decoding:data,as:UTF8.self)),staleDate:nil))
        }
        let activity = try Activity.request(attributes:LiveActivityAttributes(),content:ActivityContent(state:state,staleDate:nil))
        if let legacy {
          _ = try await ArraCycleDialog(direction:1,currentKey:"widget-test:first",activityID:activity.id).perform()
          let current = ArraSelection.parse(activity.content.state.props)
          let old = ArraSelection.parse(legacy.content.state.props)
          multipleResult = current["selectedKey"] as? String == "widget-test:second" && old["selectedKey"] == nil ? "MULTIPLE PASS" : "MULTIPLE FAIL"
        }
        selected = ArraSelection.selectedKey([:]) ?? "missing"
        ready = true
      } catch { selected = "ERROR: " + String(describing:error) }
    }.onReceive(timer) { _ in selected = ArraSelection.selectedKey([:]) ?? "missing" }
  }
}
