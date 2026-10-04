// Simulator-only harness: renders the production SwiftUI view, not an HTML mock.
import SwiftUI
import ActivityKit
import WidgetKit

struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable { var name: String; var props: String }
}
enum WidgetsStorage {
  static var appGroupIdentifier: String? { Bundle.main.object(forInfoDictionaryKey: "ExpoWidgetsAppGroupIdentifier") as? String }
  static func getArray(forKey key: String) -> [Any]? { UserDefaults(suiteName: appGroupIdentifier)?.array(forKey: key) }
}

@main struct NativeWidgetPreview: App {
  let mode = CommandLine.arguments.last ?? "normal"
  var props: [String: Any] {
    let long = mode == "long"
    return ["updated":Date().timeIntervalSince1970 * 1000, "agents": [["key":"live:pc:123", "project":"Помощник", "where":"ПК", "number":2, "mascotId":14,
      "title":long ? "Очень длинное название диалога о проверке всех семидесяти семи товаров" : "Обновление Arra на iPhone",
      "note":mode == "question" ? "Выбирает расположение блока. Нужен ваш ответ." : mode == "error" ? "Сборка упала: не найден профиль подписи" : mode == "done" ? "Сборка 135 в TestFlight" : "Проверяет виджеты и уведомления с маскотом",
      "state":mode == "question" ? "wait" : mode == "error" ? "error" : mode == "done" ? "done" : mode == "idle" ? "idle" : "work"],
      ["key":"live:pc:456", "title":"Проверка", "project":"Помощник", "mascotId":3, "number":3, "state":"idle"]]]
  }
  var body: some Scene {
    WindowGroup {
      VStack(alignment: .leading, spacing: 24) {
        Text("Нативная проверка Arra").font(.title2.bold())
        Text("Экран блокировки · 160 pt").font(.caption)
        ArraDialogCard(props: mode == "empty" ? [:] : props).frame(height:160).background(Color(red:0.125,green:0.137,blue:0.157)).clipShape(RoundedRectangle(cornerRadius:20))
        Text("Домашний экран · 160 pt").font(.caption)
        // systemMedium uses this same production card; WidgetFamily is read-only
        // and can only be supplied by a real WidgetKit extension host.
        ArraDialogCard(props: mode == "empty" ? [:] : props).frame(height:160).background(Color(red:0.125,green:0.137,blue:0.157)).clipShape(RoundedRectangle(cornerRadius:20))
        Spacer()
      }.padding(16).padding(.top,24).background(Color.black).preferredColorScheme(.dark)
        .dynamicTypeSize(mode == "large" ? .accessibility1 : .large)
        .task { if mode == "interaction" { await checkInteractions() } }
    }
  }

  @MainActor private func checkInteractions() async {
    var checks: [[String: Any]] = []
    func check(_ name: String, _ passed: Bool) { checks.append(["name":name,"passed":passed]) }
    do {
      let original = props
      let list = ArraSelection.agents(original)
      let a = "live:pc:123", b = "live:pc:456"
      let defaults = UserDefaults(suiteName: WidgetsStorage.appGroupIdentifier)!
      defaults.set([["props":original]], forKey:"__expo_widgets_ArraAgents_timeline")
      try ArraSelection.save(a)
      _ = try await ArraCycleDialog(direction:1,currentKey:a).perform()
      let down = (WidgetsStorage.getArray(forKey:"__expo_widgets_ArraAgents_timeline")!.first as! [String:Any])["props"] as! [String:Any]
      check("down writes rendered selection", down["selectedKey"] as? String == b && ArraSelection.index(list,props:down) == 1)
      check("down Link opens selected key", ArraSelection.url(down).path == "/" + b)
      check("fresh snapshot preserves selected key", ArraSelection.index(list,props:original) == 1)
      check("shared file contains selected key", ArraSelection.selectionURL.flatMap {try? Data(contentsOf:$0)}.flatMap {String(data:$0,encoding:.utf8)} == b)
      _ = try await ArraCycleDialog(direction:1,currentKey:a).perform()
      check("rapid stale-key tap advances from saved selection", ArraSelection.index(list,props:original) == 0)
      _ = try await ArraCycleDialog(direction:1,currentKey:a).perform()
      _ = try await ArraCycleDialog(direction:-1,currentKey:b).perform()
      check("up returns first dialog", ArraSelection.index(list,props:original) == 0)
      _ = try await ArraCycleDialog(direction:-1,currentKey:a).perform()
      check("previous wraps to last dialog", ArraSelection.index(list,props:original) == 1)
      let reordered: [String:Any] = ["agents":[list[1],list[0]]]
      check("reorder keeps stable key", ArraSelection.index(ArraSelection.agents(reordered),props:reordered) == 0)
      let removed: [String:Any] = ["agents":[list[0]]]
      check("closed selection falls back safely", ArraSelection.url(removed).path == "/" + a)
      defaults.set([],forKey:"__expo_widgets_ArraAgents_timeline")
      _ = try await ArraCycleDialog(direction:1,currentKey:a).perform()
      check("empty list remains safe", ArraSelection.url([:]).absoluteString == "arra://")
      try ArraSelection.save(a)
    } catch { checks.append(["name":"native exception","passed":false,"error":String(describing:error)]) }
    let report: [String:Any] = ["checks":checks,"systemDispatchVerified":false,"activityUpdateVerified":false]
    let destination = FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("interaction.json")
    try? JSONSerialization.data(withJSONObject:report,options:.prettyPrinted).write(to:destination,options:.atomic)
  }
}
