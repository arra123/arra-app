// Appended to the real ExpoWidgets pod only by the Simulator integration job.
public struct ArraWidgetTestDriver: View {
  @State private var ready = false
  @State private var selected = ""
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
      ArraDialogCard(props: props)
    }.task {
      do {
        for activity in Activity<LiveActivityAttributes>.activities { await activity.end(nil, dismissalPolicy: .immediate) }
        let value = props
        try ArraSelection.save("widget-test:first")
        UserDefaults(suiteName: WidgetsStorage.appGroupIdentifier)?.set([["props":value]], forKey:"__expo_widgets_ArraAgents_timeline")
        let data = try JSONSerialization.data(withJSONObject: value)
        let state = LiveActivityAttributes.ContentState(name:"ArraRings",props:String(decoding:data,as:UTF8.self))
        _ = try Activity.request(attributes:LiveActivityAttributes(),content:ActivityContent(state:state,staleDate:nil))
        selected = ArraSelection.selectedKey([:]) ?? "missing"
        ready = true
      } catch { selected = "ERROR: " + String(describing:error) }
    }.onReceive(timer) { _ in selected = ArraSelection.selectedKey([:]) ?? "missing" }
  }
}
