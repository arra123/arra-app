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
          ArraBall(mascot: agent["mascotId"] as? Int ?? 0, state: agent["state"] as? String ?? "idle", size: family == .systemSmall ? 46 : 22)
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
