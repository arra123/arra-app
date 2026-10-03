import AppIntents
internal import ExpoWidgets

@available(iOS 17.0, *)
struct ArraAppIntentsPackage: AppIntentsPackage {
  static var includedPackages: [any AppIntentsPackage.Type] { [ArraWidgetsIntentsPackage.self] }
}
