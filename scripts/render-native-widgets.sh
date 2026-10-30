#!/bin/bash
set -euo pipefail
preview_dir=$(mktemp -d)
preview_app="$preview_dir/WidgetPreview.app"
mkdir -p "$preview_app" "$preview_dir/Mascots.xcassets" native-widget-evidence
export ARRA_PREVIEW_DIR="$preview_dir"
node <<'JS'
const fs=require('node:fs'),path=require('node:path');
const root=path.join(process.env.ARRA_PREVIEW_DIR,'Mascots.xcassets');
fs.writeFileSync(path.join(process.env.ARRA_PREVIEW_DIR,'WidgetPreview.entitlements'), '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.application-groups</key><array><string>group.com.arratima.widgetpreview</string></array></dict></plist>');
fs.writeFileSync(path.join(root,'Contents.json'),JSON.stringify({info:{version:1,author:'xcode'}}));
for(const id of [0,3,4,5,6,8,11,12,13,14,15,16,19]){
  const folder=path.join(root,`mascot-${id}.imageset`),file=`dot-${String(id).padStart(2,'0')}.png`;
  fs.mkdirSync(folder);fs.copyFileSync(path.join('assets/mascots',file),path.join(folder,file));
  fs.writeFileSync(path.join(folder,'Contents.json'),JSON.stringify({images:[{idiom:'universal',filename:file}],info:{version:1,author:'xcode'}}));
}
JS
preview_sdk=$(xcrun --sdk iphonesimulator --show-sdk-path)
preview_arch=$(uname -m)
xcrun swiftc -sdk "$preview_sdk" -target "$preview_arch-apple-ios17.0-simulator" -D ARRA_WIDGET_PREVIEW -parse-as-library scripts/native-widget-preview.swift plugins/native/ArraDialogWidgets.swift plugins/native/ArraWidgetIntents.swift -o "$preview_app/WidgetPreview"
xcrun swiftc -sdk "$preview_sdk" -target "$preview_arch-apple-ios17.0-simulator" -typecheck plugins/native/NotificationService.swift
/usr/libexec/PlistBuddy -c 'Add :CFBundleIdentifier string com.arratima.widgetpreview' -c 'Add :CFBundleExecutable string WidgetPreview' -c 'Add :CFBundleName string WidgetPreview' -c 'Add :CFBundlePackageType string APPL' -c 'Add :CFBundleVersion string 1' -c 'Add :CFBundleShortVersionString string 1.0' -c 'Add :MinimumOSVersion string 17.0' -c 'Add :LSRequiresIPhoneOS bool true' -c 'Add :UILaunchScreen dict' -c 'Add :UIDeviceFamily array' -c 'Add :UIDeviceFamily:0 integer 1' "$preview_app/Info.plist"
/usr/libexec/PlistBuddy -c 'Add :ExpoWidgetsAppGroupIdentifier string group.com.arratima.widgetpreview' -c 'Add :NSSupportsLiveActivities bool true' "$preview_app/Info.plist"
xcrun actool "$preview_dir/Mascots.xcassets" --compile "$preview_app" --platform iphonesimulator --minimum-deployment-target 17.0 --target-device iphone >/dev/null
codesign --force --sign - --entitlements "$preview_dir/WidgetPreview.entitlements" "$preview_app"
preview_runtime=$(xcrun simctl list runtimes -j | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).runtimes.filter(r=>r.isAvailable&&r.name.startsWith("iOS")).at(-1).identifier))')
preview_device=$(xcrun simctl list devicetypes -j | node -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>console.log(JSON.parse(s).devicetypes.find(d=>d.name==="iPhone 16 Pro").identifier))')
preview_udid=$(xcrun simctl create ArraWidgetPreview "$preview_device" "$preview_runtime")
xcrun simctl boot "$preview_udid"
xcrun simctl bootstatus "$preview_udid" -b
xcrun simctl install "$preview_udid" "$preview_app"
xcrun simctl launch "$preview_udid" com.arratima.widgetpreview interaction
preview_data=$(xcrun simctl get_app_container "$preview_udid" com.arratima.widgetpreview data)
# the first launch on a cold Simulator can take long: wait for the report, up to a minute
for _ in $(seq 60); do [ -f "$preview_data/Documents/interaction.json" ] && break; sleep 1; done
cp "$preview_data/Documents/interaction.json" native-widget-evidence/interaction.json
node -e 'const r=require("./native-widget-evidence/interaction.json"); console.log(JSON.stringify(r)); if(r.checks.length<9 || r.checks.some(c=>!c.passed)) process.exit(1)'
xcrun simctl terminate "$preview_udid" com.arratima.widgetpreview
for preview_state in normal long question error done idle empty large; do
  xcrun simctl launch "$preview_udid" com.arratima.widgetpreview "$preview_state"
  sleep 2
  xcrun simctl io "$preview_udid" screenshot "native-widget-evidence/$preview_state.png"
  xcrun simctl terminate "$preview_udid" com.arratima.widgetpreview
done
xcrun simctl shutdown "$preview_udid"
