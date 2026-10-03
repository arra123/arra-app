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
    // Expo places custom notification data under "body" on iOS.
    let data = info["body"] as? [AnyHashable: Any] ?? info["data"] as? [AnyHashable: Any] ?? info
    guard data["type"] as? String == "ara.agent", let key = data["agentKey"] as? String else { finish(request.content); return }
    let allowed = [0,3,4,5,6,8,11,12,13,14,15,16,19]
    let wanted = data["mascotId"] as? Int ?? 0
    let mascot = allowed.contains(wanted) ? wanted : 0
    let file = "dot-" + String(format: "%02d", mascot)
    let avatar = Bundle.main.url(forResource: file, withExtension: "png").flatMap { try? Data(contentsOf: $0) }.map { INImage(imageData: $0) }
    let project = data["project"] as? String ?? "Arra"
    let number = data["agentNumber"] as? Int ?? 0
    let name = project + (number > 0 ? " · агент \(number)" : " · агент")
    let person = INPerson(personHandle: INPersonHandle(value: key, type: .unknown), nameComponents: nil, displayName: name, image: avatar, contactIdentifier: nil, customIdentifier: key)
    let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText, content: request.content.body, speakableGroupName: nil, conversationIdentifier: key, serviceName: "Arra", sender: person, attachments: nil)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = INInteractionDirection.incoming
    interaction.donate { _ in }
    do { finish(try request.content.updating(from: intent)) }
    catch { finish(request.content) } // Missing entitlement must never swallow a push.
  }

  private func finish(_ content: UNNotificationContent) {
    guard let callback = handler else { return }
    handler = nil
    callback(content)
  }
  override func serviceExtensionTimeWillExpire() { if let content = original { finish(content) } }
}
