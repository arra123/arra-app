import SwiftUI
import WidgetKit
import ActivityKit
import AppIntents

#if !ARRA_WIDGET_PREVIEW
internal import ExpoWidgets
#endif

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

/// tito's mascot drawn in code: a slightly squashed ball lit from the top-left, two eyes,
/// and a mark at its top-left that says what the agent is up to.
struct ArraBall: View {
  let mascot: Int
  let state: String
  var size: CGFloat = 76
  var look: CGFloat = 0

  static func rgb(_ id: Int) -> (Double, Double, Double) {
    let colors: [Int: UInt32] = [3:0xffd23f, 4:0xa887f5, 5:0x5cc4f5, 6:0xff7aa8, 8:0x7ed35f, 11:0xf4505f, 12:0xff9442, 13:0x38d6bd, 14:0x5b8cff, 15:0xff7aa8, 16:0xc9c2b6, 19:0xa887f5]
    let value = colors[id] ?? 0xffffff
    return (Double((value >> 16) & 255) / 255, Double((value >> 8) & 255) / 255, Double(value & 255) / 255)
  }
  static func color(_ id: Int) -> Color { let c = rgb(id); return Color(red: c.0, green: c.1, blue: c.2) }
  private func shade(_ toward: Double, _ k: Double) -> Color {
    let c = ArraBall.rgb(mascot)
    return Color(red: c.0 + (toward - c.0) * k, green: c.1 + (toward - c.1) * k, blue: c.2 + (toward - c.2) * k)
  }
  private var plain: Bool { let c = ArraBall.rgb(mascot); return c.0 > 0.93 && c.1 > 0.93 && c.2 > 0.93 }

  var body: some View {
    let height = size / 1.1
    let top = plain ? Color.white : shade(1, 0.34)
    let mid = plain ? Color(red: 0.945, green: 0.949, blue: 0.961) : ArraBall.color(mascot)
    let low = plain ? Color(red: 0.706, green: 0.729, blue: 0.784) : shade(0, 0.3)
    let ink = Color(red: 0.05, green: 0.055, blue: 0.07)
    // the eyes say the state: dashes when it failed, a thin line when it sleeps, tall when it asks
    let eyeWidth = state == "error" ? size * 0.17 : size * 0.12
    let eyeHeight = state == "error" ? size * 0.055 : state == "idle" ? size * 0.05 : state == "wait" ? size * 0.3 : size * 0.24
    ZStack(alignment: .topLeading) {
      Ellipse()
        .fill(RadialGradient(colors: [top, mid, low], center: UnitPoint(x: 0.36, y: 0.28), startRadius: 0, endRadius: size * 0.92))
        .frame(width: size, height: height)
      HStack(spacing: size * 0.15) {
        Capsule().fill(ink).frame(width: eyeWidth, height: eyeHeight)
        Capsule().fill(ink).frame(width: eyeWidth, height: eyeHeight)
      }
      .frame(width: size, height: height)
      .offset(x: look * size * 0.13, y: state == "work" ? -size * 0.09 : state == "idle" ? size * 0.05 : 0)
      mark.offset(x: -size * 0.02, y: -size * 0.02)
    }
    .frame(width: size, height: height)
    .accessibilityHidden(true)
  }

  @ViewBuilder private var mark: some View {
    let rim = Color(red: 0.063, green: 0.067, blue: 0.078)
    if state == "work" {
      HStack(spacing: size * 0.028) {
        ForEach(0..<3, id: \.self) { _ in Circle().fill(Color.white).frame(width: size * 0.05, height: size * 0.05) }
      }
      .frame(width: size * 0.32, height: size * 0.32)
      .background(Circle().fill(Color(red: 0.184, green: 0.549, blue: 0.965)))
      .overlay(Circle().stroke(rim, lineWidth: max(1.5, size * 0.025)))
    } else if state == "wait" {
      Text("?").font(.system(size: size * 0.21, weight: .heavy, design: .rounded)).foregroundStyle(rim)
        .frame(width: size * 0.32, height: size * 0.32)
        .background(Circle().fill(Color(red: 0.961, green: 0.773, blue: 0.259)))
        .overlay(Circle().stroke(rim, lineWidth: max(1.5, size * 0.025)))
    } else if state == "error" || state == "done" {
      Circle().fill(state == "error" ? Color(red: 1, green: 0.302, blue: 0.369) : Color(red: 0.204, green: 0.827, blue: 0.435))
        .frame(width: size * 0.17, height: size * 0.17)
        .overlay(Circle().stroke(rim, lineWidth: max(1.5, size * 0.025)))
        .offset(x: size * 0.07, y: size * 0.07)
    }
  }
}

public struct ArraDialogCard: View {
  @Environment(\.dynamicTypeSize) private var dynamicTypeSize
  private let props: [String: Any]
  private let activityID: String
  public init(props: [String: Any]) { self.props = props; activityID = "" }
  public init(json: String, activityID: String = "") { props = ArraSelection.parse(json); self.activityID = activityID }

  public var body: some View {
    let list = ArraSelection.agents(props)
    let index = ArraSelection.index(list, props: props)
    let agent = list.isEmpty ? [:] : list[index]
    let key = agent["key"] as? String ?? ""
    let mascot = agent["mascotId"] as? Int ?? 0
    let state = agent["state"] as? String ?? "idle"
    let number = agent["number"] as? Int ?? 0
    let label = state == "work" ? "В работе" : state == "wait" ? "Нужен ответ" : state == "error" ? "Ошибка" : state == "done" ? "Готово" : "Не работает сейчас"
    let accessible = dynamicTypeSize.isAccessibilitySize
    let project = [agent["project"] as? String ?? "Arra", agent["where"] as? String ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    let title = agent["title"] as? String ?? "Нет открытых диалогов"
    let note = agent["note"] as? String ?? "Откройте агента в Arra"
    // the eyes move a little with every new step: left, centre, right
    let look = CGFloat(note.utf8.reduce(0) { ($0 + Int($1)) % 3 }) - 1
    HStack(spacing: 14) {
      // under the ball: «+» opens a new conversation with Arra at once, the microphone on
      VStack(spacing: 8) {
        Link(destination: ArraSelection.url(props)) {
          ArraBall(mascot: mascot, state: state, size: accessible ? 44 : 64, look: state == "error" || state == "idle" ? 0 : look)
        }.buttonStyle(.plain).accessibilityHidden(true)
        if !accessible {
          Link(destination: URL(string: "arra://ask?fresh=1&voice=1")!) {
            HStack(spacing: 4) {
              Image(systemName: "plus").font(.system(size: 12, weight: .bold))
              Image(systemName: "mic.fill").font(.system(size: 11, weight: .semibold))
            }
            .frame(width: 64, height: 30).background(Capsule().fill(Color.white.opacity(0.14))).contentShape(Rectangle())
          }.buttonStyle(.plain).accessibilityLabel("Новый разговор с Arra")
        }
      }
      Link(destination: ArraSelection.url(props)) {
        content(state: state, number: number, project: project, title: title, note: note, mascot: mascot, accessible: accessible)
          .frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
      }.buttonStyle(.plain).accessibilityLabel("Открыть диалог: \(project), \(number). \(title). \(note). \(label)")
      VStack(spacing: 0) {
        if #available(iOS 17.0, *) {
          cycleButton(-1, key: key, enabled: list.count > 1)
          Text("\(list.isEmpty ? 0 : index + 1)/\(list.count)").font(.caption2).foregroundStyle(.secondary).monospacedDigit()
          cycleButton(1, key: key, enabled: list.count > 1)
        } else { Text("\(index + 1)/\(list.count)").font(.caption2) }
      }
    }
    .padding(.leading, 16).padding(.trailing, 8).padding(.vertical, 12)
    .foregroundStyle(.white).frame(maxWidth: .infinity)
    .background(glow(state: state, mascot: mascot))
    .widgetURL(ArraSelection.url(props))
  }

  /// What stands at the right of the ball. Working: three lines like a list of steps,
  /// the middle one is what it does now. Asking or failed: the name and the words in colour.
  @ViewBuilder private func content(state: String, number: Int, project: String, title: String, note: String, mascot: Int, accessible: Bool) -> some View {
    let tone: Color = state == "wait" ? Color(red: 0.961, green: 0.773, blue: 0.259) : state == "error" ? Color(red: 1, green: 0.42, blue: 0.47)
      : state == "done" ? Color(red: 0.204, green: 0.827, blue: 0.435) : .secondary
    if state == "work" {
      VStack(alignment: .leading, spacing: 7) {
        if !accessible { line("folder", (number > 0 ? "\(number) · " : "") + project, dim: true) }
        line("terminal", note, dim: false).id(note).transition(.push(from: .bottom))
        if !accessible { line("text.bubble", title, dim: true) }
      }
    } else {
      VStack(alignment: .leading, spacing: 5) {
        Text(title).font(accessible ? .caption.weight(.semibold) : .subheadline.weight(.semibold)).lineLimit(accessible ? 1 : 2)
        Text(state == "idle" ? project : note).font(.caption).foregroundStyle(tone).lineLimit(accessible ? 2 : 3)
          .id(note).transition(.opacity)
        if !accessible && state != "idle" {
          Text((number > 0 ? "\(number) · " : "") + project).font(.caption2).foregroundStyle(.secondary).lineLimit(1)
        }
      }
    }
  }

  private func line(_ icon: String, _ text: String, dim: Bool) -> some View {
    HStack(spacing: 8) {
      Image(systemName: icon).font(.system(size: dim ? 11 : 14, weight: .medium)).frame(width: 18)
      Text(text).font(dim ? .caption : .subheadline.weight(.semibold)).lineLimit(dim ? 1 : 2)
    }
    .foregroundStyle(dim ? Color.white.opacity(0.42) : Color.white)
  }

  /// A soft light in the state's colour from the lower-left corner; none when nothing happens.
  @ViewBuilder private func glow(state: String, mascot: Int) -> some View {
    let tint: Color? = state == "error" ? Color(red: 1, green: 0.3, blue: 0.37) : state == "wait" ? Color(red: 0.96, green: 0.77, blue: 0.26)
      : state == "done" ? Color(red: 0.2, green: 0.83, blue: 0.44) : state == "work" ? ArraBall.color(mascot) : nil
    if let tint {
      RadialGradient(colors: [tint.opacity(state == "work" ? 0.2 : 0.3), tint.opacity(0)], center: UnitPoint(x: 0.12, y: 1.05), startRadius: 0, endRadius: 190)
    } else { Color.clear }
  }

  @available(iOS 17.0, *)
  private func cycleButton(_ direction: Int, key: String, enabled: Bool) -> some View {
    Button(intent: ArraCycleDialog(direction: direction, currentKey: key, activityID: activityID)) {
      Image(systemName: direction < 0 ? "chevron.up" : "chevron.down").font(.system(size: 19, weight: .semibold))
        .frame(width: 44, height: 44).background(Circle().fill(Color.white.opacity(0.12)))
        .frame(width: 60, height: 58).contentShape(Rectangle())
    }.buttonStyle(.plain).disabled(!enabled).opacity(enabled ? 1 : 0.35)
      .accessibilityLabel(direction < 0 ? "Предыдущий диалог" : "Следующий диалог")
  }
}

/// Kept for the generated ArraAgents.swift (Expo still owns its snapshot for the app);
/// that widget is no longer in the gallery, the wide «Arra» below replaced it.
public struct ArraWidgetEntryView: View {
  public init(props: [String: Any]) {}
  public var body: some View { ArraActionsView() }
}

/// The wide widget has no data, so its timeline is one fixed entry. Expo's provider
/// returns an empty timeline until the app writes one, and WidgetKit then keeps
/// showing the redacted placeholder (grey bars instead of the words).
public struct ArraActionsEntry: TimelineEntry {
  public let date: Date
}
public struct ArraActionsProvider: TimelineProvider {
  public init() {}
  public func placeholder(in context: Context) -> ArraActionsEntry { ArraActionsEntry(date: Date()) }
  public func getSnapshot(in context: Context, completion: @escaping @Sendable (ArraActionsEntry) -> Void) {
    completion(ArraActionsEntry(date: Date()))
  }
  public func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<ArraActionsEntry>) -> Void) {
    completion(Timeline(entries: [ArraActionsEntry(date: Date())], policy: .never))
  }
}

/// One row across the Home Screen: «Буфер на ПК», «Фото на ПК», «Новый чат».
/// Widgets cannot read the clipboard or the photos, so each tap opens the app
/// on its link (arra://clip, arra://photo, arra://ask?fresh=1) for a moment,
/// the same links as the Control Center buttons.
public struct ArraActionsWidget: Widget {
  public init() {}
  public var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ArraActions", provider: ArraActionsProvider()) { _ in
      ArraActionsView()
    }
    .configurationDisplayName("Arra")
    .description("Буфер на ПК, фото на ПК, новый чат")
    .supportedFamilies([.systemMedium])
  }
}

struct ArraAction {
  let symbol: String
  let title: String
  let tint: Color
  let url: URL
  let spoken: String
  static let all = [
    ArraAction(symbol: "doc.on.clipboard", title: "Буфер на ПК", tint: Color(red: 0.36, green: 0.55, blue: 1),
      url: URL(string: "arra://clip")!, spoken: "Отправить буфер на компьютер"),
    ArraAction(symbol: "photo", title: "Фото на ПК", tint: Color(red: 0.2, green: 0.78, blue: 0.47),
      url: URL(string: "arra://photo")!, spoken: "Отправить последнее фото на компьютер"),
    ArraAction(symbol: "square.and.pencil", title: "Новый чат", tint: Color(red: 0.69, green: 0.45, blue: 1),
      url: URL(string: "arra://ask?fresh=1")!, spoken: "Новый чат с Arra"),
  ]
}

public struct ArraActionsView: View {
  public init() {}
  private static let base = Color(red: 0.067, green: 0.067, blue: 0.078)

  public var body: some View {
    let row = HStack(spacing: 8) {
      ForEach(ArraAction.all, id: \.title) { action in
        Link(destination: action.url) { tile(action) }
          .buttonStyle(.plain)
          .accessibilityLabel(action.spoken)
      }
    }
    .unredacted()
    .environment(\.colorScheme, .dark)
    if #available(iOS 17.0, *) {
      row.containerBackground(for: .widget) { ArraActionsView.base }
    } else {
      row.padding(16).frame(maxWidth: .infinity, maxHeight: .infinity).background(ArraActionsView.base)
    }
  }

  private func tile(_ action: ArraAction) -> some View {
    VStack(spacing: 10) {
      Image(systemName: action.symbol)
        .font(.system(size: 22, weight: .semibold))
        .foregroundStyle(action.tint)
        .frame(width: 44, height: 44)
        .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(action.tint.opacity(0.16)))
      Text(action.title)
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color.white)
        .lineLimit(1)
        .minimumScaleFactor(0.75)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Color.white.opacity(0.07)))
    .contentShape(Rectangle())
  }
}

/// Controls (iOS 18): one-cell buttons for Control Center, the Lock Screen
/// corners and the Action button. Each opens the same link as its widget.
@available(iOS 18.0, *)
struct ArraClipControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.arratima.aura.control.clip") {
      ControlWidgetButton(action: ArraOpenLinkIntent(link: .clip)) { Label("Буфер на ПК", systemImage: "doc.on.clipboard") }
    }.displayName("Буфер на ПК").description("Скопированное уходит в буфер компьютера")
  }
}
@available(iOS 18.0, *)
struct ArraPhotoControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.arratima.aura.control.photo") {
      ControlWidgetButton(action: ArraOpenLinkIntent(link: .photo)) { Label("Фото на ПК", systemImage: "photo") }
    }.displayName("Фото на ПК").description("Последнее фото уходит в буфер компьютера")
  }
}
@available(iOS 18.0, *)
struct ArraNewChatControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.arratima.aura.control.new-chat") {
      ControlWidgetButton(action: ArraOpenLinkIntent(link: .newChat)) { Label("Новый чат", systemImage: "square.and.pencil") }
    }.displayName("Новый чат Arra").description("Сразу пустой чат с Arra")
  }
}
@available(iOS 18.0, *)
public struct ArraControls: WidgetBundle {
  public init() {}
  public var body: some Widget {
    ArraClipControl()
    ArraPhotoControl()
    ArraNewChatControl()
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
      ArraDialogCard(json: context.state.props, activityID: context.activityID)
        .activityBackgroundTint(Color(red: 0.125, green: 0.137, blue: 0.157))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) { ArraDialogCard(json: context.state.props, activityID: context.activityID) }
      } compactLeading: {
        Text(arraNeedsAttention(context.state.props) ? "•" : "")
      } compactTrailing: { EmptyView() }
        minimal: { Text(arraNeedsAttention(context.state.props) ? "•" : "") }
      .widgetURL(arraActivityURL(context.state.props))
    }
  }
}
