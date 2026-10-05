import UserNotifications
import Intents
import UIKit

final class NotificationService: UNNotificationServiceExtension {
  private var handler: ((UNNotificationContent) -> Void)?
  private var original: UNNotificationContent?

  override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
    handler = contentHandler
    original = request.content
    let info = request.content.userInfo
    // Expo places custom notification data under "body" on iOS: a dictionary, or the same
    // JSON as a string. Without the string case the whole payload was skipped and the
    // notification kept the app's own white icon instead of the project's ball.
    let data = NotificationService.payload(info["body"]) ?? NotificationService.payload(info["data"]) ?? info
    guard data["type"] as? String == "ara.agent", let key = data["agentKey"] as? String else { finish(request.content); return }
    let allowed = [0,3,4,5,6,8,11,12,13,14,15,16,19]
    let wanted = NotificationService.number(data["mascotId"])
    let mascot = allowed.contains(wanted) ? wanted : 0
    let file = "dot-" + String(format: "%02d", mascot)
    let picture = Bundle.main.url(forResource: file, withExtension: "png")
    let avatar = picture.flatMap { try? Data(contentsOf: $0) }.map { INImage(imageData: $0) }
    let project = data["project"] as? String ?? "Arra"
    let number = NotificationService.number(data["agentNumber"])
    let name = project + (number > 0 ? " · агент \(number)" : " · агент")
    let person = INPerson(personHandle: INPersonHandle(value: key, type: .unknown), nameComponents: nil, displayName: name, image: avatar, contactIdentifier: nil, customIdentifier: key)
    let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText, content: request.content.body, speakableGroupName: nil, conversationIdentifier: key, serviceName: "Arra", sender: person, attachments: nil)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = INInteractionDirection.incoming
    interaction.donate { _ in }
    do { finish(try request.content.updating(from: intent)) }
    catch {
      // Missing entitlement must never swallow a push. The ball still comes, as a picture at the right.
      if let picture, let changed = request.content.mutableCopy() as? UNMutableNotificationContent {
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".png")
        if (try? FileManager.default.copyItem(at: picture, to: copy)) != nil,
           let attachment = try? UNNotificationAttachment(identifier: "mascot", url: copy, options: nil) {
          changed.attachments = [attachment]
          finish(changed)
          return
        }
      }
      finish(request.content)
    }
  }

  private static func payload(_ value: Any?) -> [AnyHashable: Any]? {
    if let dictionary = value as? [AnyHashable: Any] { return dictionary }
    guard let text = value as? String, let bytes = text.data(using: .utf8) else { return nil }
    return (try? JSONSerialization.jsonObject(with: bytes)) as? [AnyHashable: Any]
  }
  private static func number(_ value: Any?) -> Int {
    if let number = value as? NSNumber { return number.intValue }
    if let text = value as? String { return Int(text) ?? 0 }
    return 0
  }

  private func finish(_ content: UNNotificationContent) {
    guard let callback = handler else { return }
    handler = nil
    callback(content)
  }
  override func serviceExtensionTimeWillExpire() { if let content = original { finish(content) } }
}
