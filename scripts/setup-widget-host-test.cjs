// Diagnostic generated-project changes, never run by the production build.
const fs = require('node:fs');
const xcode = require('xcode');
const appSource = 'ios/Arra/ArraDialogWidgets.swift';
fs.appendFileSync(appSource, '\n' + fs.readFileSync('scripts/native-widget-driver.swift','utf8'));
const delegatePath = 'ios/Arra/AppDelegate.swift';
let delegate = fs.readFileSync(delegatePath,'utf8');
delegate = 'import SwiftUI\ninternal import ExpoWidgets\n' + delegate;
const marker = '    let delegate = ReactNativeDelegate()';
if (!delegate.includes(marker)) throw new Error('AppDelegate template changed');
delegate = delegate.replace(marker, `    let widgetTestDefaults = UserDefaults(suiteName: WidgetsStorage.appGroupIdentifier)
    if #available(iOS 17.2, *), CommandLine.arguments.contains("--arra-widget-ui-test") || widgetTestDefaults?.bool(forKey: "arra-widget-ui-test") == true {
      widgetTestDefaults?.set(true, forKey: "arra-widget-ui-test")
      window = UIWindow(frame: UIScreen.main.bounds)
      window?.rootViewController = UIHostingController(rootView: ArraWidgetTestDriver())
      window?.makeKeyAndVisible()
      return true
    }
${marker}`);
fs.writeFileSync(delegatePath,delegate);
fs.mkdirSync('ios/ArraWidgetUITests',{recursive:true});
fs.copyFileSync('scripts/native-widget-host-tests.swift','ios/ArraWidgetUITests/WidgetInteractionTests.swift');
const file = 'ios/Arra.xcodeproj/project.pbxproj';
const project = xcode.project(file); project.parseSync();
const app = project.getFirstTarget();
const target = project.addTarget('ArraWidgetUITests','unit_test_bundle','ArraWidgetUITests','com.arratima.aura.widgetuitests');
target.pbxNativeTarget.productType = '"com.apple.product-type.bundle.ui-testing"';
// xcode's addTarget defaults to app -> extension; a UI test instead depends on app.
const dependencies = project.hash.project.objects.PBXTargetDependency;
app.firstTarget.dependencies = app.firstTarget.dependencies.filter(ref => dependencies[ref.value]?.target !== target.uuid);
project.addTargetDependency(target.uuid,[app.uuid]);
project.addTargetAttribute('TestTargetID',app.uuid,target);
const configs = project.hash.project.objects.XCConfigurationList[target.pbxNativeTarget.buildConfigurationList].buildConfigurations;
for (const ref of configs) {
  const settings = project.hash.project.objects.XCBuildConfiguration[ref.value].buildSettings;
  delete settings.INFOPLIST_FILE;
  Object.assign(settings,{GENERATE_INFOPLIST_FILE:'YES',SWIFT_VERSION:'5.0',IPHONEOS_DEPLOYMENT_TARGET:'17.2',TEST_TARGET_NAME:'Arra',TARGETED_DEVICE_FAMILY:'1',CODE_SIGN_STYLE:'Automatic'});
}
project.addBuildPhase(['ArraWidgetUITests/WidgetInteractionTests.swift'],'PBXSourcesBuildPhase','Sources',target.uuid);
fs.writeFileSync(file,project.writeSync());
const reference = (id,name,product) => `<BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="${id}" BuildableName="${product}" BlueprintName="${name}" ReferencedContainer="container:Arra.xcodeproj"/>`;
const appRef = reference(app.uuid,'Arra','Arra.app');
const testRef = reference(target.uuid,'ArraWidgetUITests','ArraWidgetUITests.xctest');
fs.writeFileSync('ios/Arra.xcodeproj/xcshareddata/xcschemes/ArraWidgetUITests.xcscheme',`<?xml version="1.0" encoding="UTF-8"?>
<Scheme version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries>
<BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${appRef}</BuildActionEntry>
<BuildActionEntry buildForTesting="YES" buildForRunning="NO" buildForProfiling="NO" buildForArchiving="NO" buildForAnalyzing="YES">${testRef}</BuildActionEntry>
</BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.PosixSpawn" shouldUseLaunchSchemeArgsEnv="YES"><Testables><TestableReference skipped="NO">${testRef}</TestableReference></Testables><MacroExpansion>${appRef}</MacroExpansion></TestAction>
<LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB"><BuildableProductRunnable runnableDebuggingMode="0">${appRef}</BuildableProductRunnable></LaunchAction></Scheme>`);
