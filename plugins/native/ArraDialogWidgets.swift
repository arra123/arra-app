import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

@available(iOS 17.0, *)
public struct ArraWidgetsIntentsPackage: AppIntentsPackage { public init() {} }

enum ArraSelection {
  static var defaults: UserDefaults? { UserDefaults(suiteName: WidgetsStorage.appGroupIdentifier) }
  static let key = "arra.selected-dialog"
  // WidgetKit renders in another process. Read an atomic shared file instead
  // of depending on a cached UserDefaults value becoming observable there.
  static var selectionURL: URL? {
    guard let group = WidgetsStorage.appGroupIdentifier else { return nil }
    return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)?.appendingPathComponent("arra-selected-dialog")
  }
  static func save(_ selected: String) throws {
    if let url = selectionURL { try Data(selected.utf8).write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]) }
    defaults?.set(selected, forKey: key)
  }
  static func selectedKey(_ props: [String: Any]) -> String? {
    if let selected = props["selectedKey"] as? String { return selected }
    if let url = selectionURL, let data = try? Data(contentsOf: url) { return String(data: data, encoding: .utf8) }
    return defaults?.string(forKey: key)
  }
  static func agents(_ props: [String: Any]) -> [[String: Any]] {
    if let list = props["agents"] as? [[String: Any]] { return list }
    // Compact APNs state: preserve every dialog within Apple's 4KB limit.
    let fields = ["key", "title", "project", "note", "state", "mascotId", "number", "where"]
    return (props["agents"] as? [[Any]] ?? []).map { row in
      var agent: [String: Any] = [:]
      for (index, value) in row.enumerated() where index < fields.count { agent[fields[index]] = value }
      return agent
    }
  }
  static func index(_ agents: [[String: Any]], props: [String: Any]) -> Int {
    let selected = selectedKey(props)
    return agents.firstIndex { ($0["key"] as? String) == selected } ?? 0
  }
  static func parse(_ json: String) -> [String: Any] {
    guard let data = json.data(using: .utf8) else { return [:] }
    return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
  }
  static func url(_ props: [String: Any]) -> URL {
    let list = agents(props)
    guard !list.isEmpty, let key = list[index(list, props: props)]["key"] as? String else { return URL(string: "arra://")! }
    var url = URLComponents()
    url.scheme = "arra"; url.host = "agent"; url.path = "/" + key
    return url.url ?? URL(string: "arra://")!
  }
}

// Unlike expo-widgets' Live Activity button event, this intent updates the
// ActivityKit content itself. It works even when the React Native app is closed.
@available(iOS 17.0, *)
public struct ArraCycleDialog: LiveActivityIntent {
  public static var title: LocalizedStringResource = "Переключить диалог Arra"
  public static var isDiscoverable = false
  public static var openAppWhenRun = false
  @Parameter(title: "Направление") public var direction: Int
  @Parameter(title: "Текущий диалог") public var currentKey: String
  public init() { direction = 1; currentKey = "" }
  public init(direction: Int, currentKey: String) { self.direction = direction; self.currentKey = currentKey }

  public func perform() async throws -> some IntentResult {
    let activities = Activity<LiveActivityAttributes>.activities.filter { $0.content.state.name == "ArraRings" }
    let timeline = WidgetsStorage.getArray(forKey: "__expo_widgets_ArraAgents_timeline")
    let entry = timeline?.last as? [String: Any]
    let widgetProps = entry?["props"] as? [String: Any] ?? [:]
    let props = activities.first.map { ArraSelection.parse($0.content.state.props) } ?? widgetProps
    let list = ArraSelection.agents(props)
    guard !list.isEmpty else { return .result() }
    let old = list.firstIndex { ($0["key"] as? String) == currentKey } ?? ArraSelection.index(list, props: props)
    let next = (old + (direction < 0 ? -1 : 1) + list.count) % list.count
    guard let selected = list[next]["key"] as? String else { return .result() }
    try ArraSelection.save(selected)
    for activity in activities {
      var updated = ArraSelection.parse(activity.content.state.props)
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

public struct ArraDialogCard: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  private let props: [String: Any]
  public init(props: [String: Any]) { self.props = props }
  public init(json: String) { props = ArraSelection.parse(json) }

  public var body: some View {
    let list = ArraSelection.agents(props)
    let index = ArraSelection.index(list, props: props)
    let agent = list.isEmpty ? [:] : list[index]
    let key = agent["key"] as? String ?? ""
    let mascot = agent["mascotId"] as? Int ?? 0
    let state = agent["state"] as? String ?? "idle"
    let number = agent["number"] as? Int ?? 0
    let color = Self.mascotColor(mascot)
    let label = state == "work" ? "В работе" : state == "wait" ? "Нужен ответ" : state == "error" ? "Ошибка" : state == "done" ? "Готово" : "Не работает сейчас"
    let statusColor: Color = state == "wait" ? .yellow : state == "error" ? .red : state == "done" ? .green : .secondary
    let accessible = dynamicTypeSize.isAccessibilitySize
    let project = [agent["project"] as? String ?? "Arra", agent["where"] as? String ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    let title = agent["title"] as? String ?? "Нет открытых диалогов"
    let note = agent["note"] as? String ?? "Откройте агента в Arra"
    HStack(spacing: 10) {
      Link(destination: ArraSelection.url(props)) {
        HStack(spacing: 10) {
          if !accessible { Image("mascot-\(mascot)").resizable().scaledToFit().frame(width: 76, height: 92).accessibilityHidden(true) }
          VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 4) {
              if accessible { Image("mascot-\(mascot)").resizable().scaledToFit().frame(width: 32, height: 32).accessibilityHidden(true) }
              if number > 0 { Text("\(number)").foregroundStyle(color).bold() }
              Text(accessible && ["wait", "error", "done"].contains(state) ? label : project).foregroundStyle(accessible && ["wait", "error", "done"].contains(state) ? statusColor : .secondary).lineLimit(1)
            }.font(.caption2).foregroundStyle(.secondary)
            Text(title).font(accessible ? .caption.weight(.semibold) : .subheadline.weight(.semibold)).lineLimit(accessible ? 1 : 2).layoutPriority(1)
            Text(note).font(accessible ? .caption2 : .caption).foregroundStyle(.secondary).lineLimit(2).layoutPriority(1)
            if !accessible {
              Text(label).font(.caption2.weight(.semibold)).foregroundStyle(statusColor).lineLimit(1)
              if let updated = props["updated"] as? Double {
                (Text("Обновлено ") + Text(Date(timeIntervalSince1970: updated / 1000), style: .relative) + Text(" назад"))
                  .font(.caption2).foregroundStyle(.secondary).lineLimit(1).layoutPriority(-1)
                  .environment(\.locale, Locale(identifier: "ru_RU"))
              }
            }
          }.frame(maxWidth: .infinity, alignment: .leading)
        }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
      }.buttonStyle(.plain).accessibilityLabel("Открыть диалог: \(project), \(number). \(title). \(note). \(label)")
      VStack(spacing: 2) {
        if #available(iOS 17.0, *) {
          cycleButton(-1, key: key, enabled: list.count > 1)
          Text("\(list.isEmpty ? 0 : index + 1) / \(list.count)").font(.caption2).foregroundStyle(.secondary).monospacedDigit()
          cycleButton(1, key: key, enabled: list.count > 1)
        } else { Text("\(index + 1) / \(list.count)").font(.caption2) }
      }
    }.padding(14).foregroundStyle(.white).frame(maxWidth: .infinity).widgetURL(ArraSelection.url(props))
  }

  @available(iOS 17.0, *)
  private func cycleButton(_ direction: Int, key: String, enabled: Bool) -> some View {
    Button(intent: ArraCycleDialog(direction: direction, currentKey: key)) {
      Image(systemName: direction < 0 ? "chevron.up" : "chevron.down").font(.system(size: 16, weight: .medium))
        .frame(width: 44, height: 44).contentShape(Rectangle())
    }.buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.35)
      .accessibilityLabel(direction < 0 ? "Предыдущий диалог" : "Следующий диалог")
  }

  private static func mascotColor(_ id: Int) -> Color {
    let colors: [Int: UInt32] = [3:0xffcf40, 4:0xad7bed, 5:0x55b9f2, 6:0xff6379, 8:0x8caf42, 11:0x984feb, 12:0xffbd83, 13:0xffd13b, 14:0x359fef, 15:0xd76b8d, 16:0xaaa194, 19:0x9b93ff]
    let value = colors[id] ?? 0xffffff
    return Color(red: Double((value >> 16) & 255)/255, green: Double((value >> 8) & 255)/255, blue: Double(value & 255)/255)
  }
}

public struct ArraWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  private let props: [String: Any]
  public init(props: [String: Any]) { self.props = props }
  public var body: some View {
    if #available(iOS 17.0, *) {
      content.containerBackground(Color(red: 0.125, green: 0.137, blue: 0.157), for: .widget)
    } else { content.background(Color.black) }
  }
  @ViewBuilder private var content: some View {
    let list = ArraSelection.agents(props)
    let agent = list.isEmpty ? [:] : list[ArraSelection.index(list, props: props)]
    if family == .systemMedium { ArraDialogCard(props: props) }
    else {
      Link(destination: ArraSelection.url(props)) {
        VStack(alignment: .leading, spacing: 6) {
          Image("mascot-\(agent["mascotId"] as? Int ?? 0)").resizable().scaledToFit().frame(width: family == .systemSmall ? 44 : 22, height: family == .systemSmall ? 44 : 22)
          Text(agent["title"] as? String ?? "Откройте Arra").font(.caption.weight(.semibold)).lineLimit(2)
          if family == .systemSmall { Text(agent["note"] as? String ?? "Нет открытых диалогов").font(.caption2).foregroundStyle(.secondary).lineLimit(2) }
        }
      }.widgetURL(ArraSelection.url(props))
    }
  }
}

func arraActivityURL(_ json: String) -> URL { ArraSelection.url(ArraSelection.parse(json)) }
func arraNeedsAttention(_ json: String) -> Bool {
  ArraSelection.agents(ArraSelection.parse(json)).contains { ["wait", "error"].contains($0["state"] as? String ?? "") }
}

@available(iOS 16.4, *)
public struct ArraLiveActivity: Widget {
  public init() {}
  public var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { context in
      ArraDialogCard(json: context.state.props)
        .activityBackgroundTint(Color(red: 0.125, green: 0.137, blue: 0.157))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) { ArraDialogCard(json: context.state.props) }
      } compactLeading: {
        Text(arraNeedsAttention(context.state.props) ? "•" : "")
      } compactTrailing: { EmptyView() }
        minimal: { Text(arraNeedsAttention(context.state.props) ? "•" : "") }
      .widgetURL(arraActivityURL(context.state.props))
    }
  }
}
