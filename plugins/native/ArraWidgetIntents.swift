// Compile the same intent in the app and WidgetKit extension, not the static pod.
import Foundation
import AppIntents
import ActivityKit
import WidgetKit
#if !ARRA_WIDGET_PREVIEW
internal import ExpoWidgets
#endif

// Unlike expo-widgets' Live Activity button event, this intent updates the
// ActivityKit content itself. It works even when the React Native app is closed.
@available(iOS 17.0, *)
public struct ArraCycleDialog: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Переключить диалог Arra"
  public static var isDiscoverable = false
  public static var openAppWhenRun = false
  @Parameter(title: "Направление") public var direction: Int
  @Parameter(title: "Текущий диалог") public var currentKey: String
  @Parameter(title: "Блок") public var activityID: String
  public init() { direction = 1; currentKey = ""; activityID = "" }
  public init(direction: Int, currentKey: String, activityID: String = "") { self.direction = direction; self.currentKey = currentKey; self.activityID = activityID }

  public func perform() async throws -> some IntentResult {
    let activities = Activity<LiveActivityAttributes>.activities.filter { $0.content.state.name == "ArraRings" && ($0.activityState == .active || $0.activityState == .stale) }
    let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_ArraAgents_timeline")
    let entry = timeline?.last as? [String: Any]
    let widgetProps = entry?["props"] as? [String: Any] ?? [:]
    let target = activities.first { $0.id == activityID }
    // A Live Activity owns its own snapshot. A Home Widget owns its timeline;
    // an unrelated/old Activity must not silently replace either one's list.
    if !activityID.isEmpty && target == nil { return .result() }
    let props = target.map { ArraSelection.parse($0.content.state.props) } ?? widgetProps
    let list = ArraSelection.agents(props)
    guard !list.isEmpty else { return .result() }
    // Serialized button parameters can lag during rapid taps; prefer the last
    // saved selection rather than repeating the same move from a stale key.
    let saved = ArraSelection.selectedKey([:])
    let old = list.firstIndex { ($0["key"] as? String) == saved } ?? list.firstIndex { ($0["key"] as? String) == currentKey } ?? ArraSelection.index(list, props: props)
    let next = (old + (direction < 0 ? -1 : 1) + list.count) % list.count
    guard let selected = list[next]["key"] as? String else { return .result() }
    try ArraSelection.save(selected)
    for activity in activities {
      var updated = ArraSelection.parse(activity.content.state.props)
      guard ArraSelection.agents(updated).contains(where: { ($0["key"] as? String) == selected }) else { continue }
      updated["selectedKey"] = selected
      updated["selectionRevision"] = Date().timeIntervalSince1970
      let data = try JSONSerialization.data(withJSONObject: updated)
      let state = LiveActivityAttributes.ContentState(name: "ArraRings", props: String(decoding: data, as: UTF8.self))
      await activity.update(ActivityContent(state: state, staleDate: Date().addingTimeInterval(300)))
    }
    // A reload with the same timeline is not a data change. Write the selection
    // into every entry too, so the archived view and its Link share that key.
    if let timeline = timeline as? [[String: Any]], let defaults = ArraSelection.defaults {
      let updated = timeline.map { entry in
        var entry = entry
        var props = entry["props"] as? [String: Any] ?? [:]
        props["selectedKey"] = selected
        props["selectionRevision"] = Date().timeIntervalSince1970
        entry["props"] = props
        return entry
      }
      defaults.set(updated, forKey: "__expo_widgets_ArraAgents_timeline")
    }
    WidgetCenter.shared.reloadTimelines(ofKind: "ArraAgents")
    return .result()
  }
}
