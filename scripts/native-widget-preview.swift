// Simulator-only harness: renders the production SwiftUI view, not an HTML mock.
import SwiftUI
import ActivityKit
import WidgetKit

struct LiveActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable { var name: String; var props: String }
}
enum WidgetsStorage {
  static let appGroupIdentifier: String? = nil
  static func getArray(forKey key: String) -> [Any]? { nil }
}

@main struct NativeWidgetPreview: App {
  let mode = CommandLine.arguments.last ?? "normal"
  var props: [String: Any] {
    let long = mode == "long"
    return ["agents": [["key":"live:pc:123", "project":"Помощник", "where":"ПК", "number":2, "mascotId":14,
      "title":long ? "Очень длинное название диалога о проверке всех семидесяти семи товаров" : "Обновление Arra на iPhone",
      "note":mode == "question" ? "Выбирает расположение блока. Нужен ваш ответ." : "Проверяет виджеты и уведомления с маскотом",
      "state":mode == "question" ? "wait" : "work"],
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
    }
  }
}
