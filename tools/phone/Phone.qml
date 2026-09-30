import QtQuick
import QtQuick.Controls
import QtQuick.Effects
import QtQuick.Window
import QtWebEngine

// iPhone 17 Pro Max on the desktop: 440 x 956 pt screen, titanium frame,
// Dynamic Island, status bar, home indicator; the app runs inside. No window
// frame: drag it by the frame, the panel at the side does the rest.
Window {
    id: win
    required property string startUrl
    property real zoom: 1.0
    property bool onTop: false
    readonly property int screenW: 440
    readonly property int screenH: 956
    readonly property int bezel: 12
    readonly property int bodyW: screenW + bezel * 2
    readonly property int bodyH: screenH + bezel * 2
    readonly property int panelW: 60
    readonly property int baseW: bodyW + 12 + 18 + panelW
    readonly property int baseH: bodyH + 16
    width: Math.round(baseW * zoom)
    height: Math.round(baseH * zoom)
    minimumWidth: width; maximumWidth: width
    minimumHeight: height; maximumHeight: height
    color: "transparent"
    flags: Qt.Window | Qt.FramelessWindowHint | (onTop ? Qt.WindowStaysOnTopHint : 0)
    title: "Arra"
    visible: true

    readonly property string fIcon: "Material Symbols Rounded"
    readonly property string fMain: "Google Sans Flex"
    property string clock: Qt.formatTime(new Date(), "H:mm")
    Timer { interval: 5000; running: true; repeat: true; onTriggered: win.clock = Qt.formatTime(new Date(), "H:mm") }
    property string toast: ""
    Timer { id: toastOff; interval: 2200; onTriggered: win.toast = "" }
    function say(t) { toast = t; toastOff.restart(); }

    Item {
        id: stage
        width: win.baseW
        height: win.baseH
        scale: win.zoom
        transformOrigin: Item.TopLeft

        // ------------------------------------------------------------ the phone
        Item {
            id: phone
            x: 6; y: 8
            width: win.bodyW
            height: win.bodyH

            // side buttons: action, volume up / down on the left; side button
            // and Camera Control on the right
            Repeater {
                model: [[-3, 196, 34], [-3, 250, 62], [-3, 324, 62], [win.bodyW - 1, 270, 100], [win.bodyW - 1, 560, 64]]
                Rectangle {
                    required property var modelData
                    x: modelData[0]; y: modelData[1]
                    width: 4; height: modelData[2]; radius: 2
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0; color: "#55575e" }
                        GradientStop { position: 1; color: "#2b2c31" }
                    }
                }
            }
            // titanium frame
            Rectangle {
                anchors.fill: parent
                radius: 74
                gradient: Gradient {
                    GradientStop { position: 0; color: "#6b6d74" }
                    GradientStop { position: 0.5; color: "#3d3f45" }
                    GradientStop { position: 1; color: "#5c5e65" }
                }
                // the frame moves the window
                MouseArea {
                    anchors.fill: parent
                    cursorShape: Qt.OpenHandCursor
                    onPressed: win.startSystemMove()
                }
            }
            // black glass around the screen
            Rectangle {
                anchors.fill: parent
                anchors.margins: 3
                radius: 71
                color: "#050505"
            }

            // ------------------------------------------------------------ screen
            Item {
                id: screen
                x: win.bezel; y: win.bezel
                width: win.screenW
                height: win.screenH
                layer.enabled: true
                layer.effect: MultiEffect {
                    maskEnabled: true
                    maskSource: screenMask
                    maskThresholdMin: 0.5
                    maskSpreadAtMin: 1.0
                }

                Rectangle { anchors.fill: parent; color: "#0a0a0c" }

                WebEngineView {
                    id: web
                    x: 0; y: 59
                    width: parent.width
                    height: parent.height - 59 - 30
                    backgroundColor: "#0a0a0c"
                    url: win.startUrl
                    settings.showScrollBars: false
                    settings.focusOnNavigationEnabled: true
                    profile: WebEngineProfile {
                        storageName: "arra-phone"
                        offTheRecord: false
                        persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
                        httpUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
                    }
                    onNewWindowRequested: request => Qt.openUrlExternally(request.requestedUrl)
                }

                // status bar: time, the island, signal / wi-fi / battery
                Item {
                    width: parent.width
                    height: 59
                    Text {
                        x: 52; anchors.verticalCenter: parent.verticalCenter; anchors.verticalCenterOffset: 2
                        text: win.clock
                        color: "white"
                        font.family: win.fMain; font.pixelSize: 17; font.weight: Font.DemiBold
                    }
                    Row {
                        anchors.right: parent.right; anchors.rightMargin: 34
                        anchors.verticalCenter: parent.verticalCenter; anchors.verticalCenterOffset: 2
                        spacing: 6
                        Text { text: "signal_cellular_alt"; font.family: win.fIcon; font.pixelSize: 19; color: "white"; font.variableAxes: { "FILL": 1 } }
                        Text { text: "wifi"; font.family: win.fIcon; font.pixelSize: 19; color: "white"; font.variableAxes: { "FILL": 1 } }
                        // battery
                        Item {
                            width: 29; height: 14
                            anchors.verticalCenter: parent.verticalCenter
                            Rectangle { width: 25; height: 13; radius: 4; color: "transparent"; border.color: "#8cffffff"; border.width: 1.2
                                Rectangle { x: 2; y: 2; width: 17; height: 9; radius: 2; color: "white" } }
                            Rectangle { x: 26; y: 4; width: 2; height: 5; radius: 1; color: "#8cffffff" }
                        }
                    }
                }
                // Dynamic Island
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    y: 11
                    width: 126; height: 37; radius: 18.5
                    color: "black"
                    Rectangle { x: parent.width - 30; anchors.verticalCenter: parent.verticalCenter; width: 12; height: 12; radius: 6; color: "#0c0f1a"
                        Rectangle { anchors.centerIn: parent; width: 5; height: 5; radius: 2.5; color: "#1b2340" } }
                }
                // home indicator
                Rectangle {
                    anchors.horizontalCenter: parent.horizontalCenter
                    anchors.bottom: parent.bottom; anchors.bottomMargin: 9
                    width: 146; height: 5; radius: 2.5
                    color: "#e6ffffff"
                }
                // a loading line while a page loads
                Rectangle {
                    y: 59; height: 2
                    width: parent.width * web.loadProgress / 100
                    visible: web.loading
                    color: "#6fb6ff"
                }
            }
            Rectangle {
                id: screenMask
                x: win.bezel; y: win.bezel
                width: win.screenW; height: win.screenH
                radius: 62
                visible: false
                layer.enabled: true
            }
        }

        // ------------------------------------------------------ control panel
        Rectangle {
            id: panel
            x: phone.x + phone.width + 18
            anchors.verticalCenter: phone.verticalCenter
            width: win.panelW
            height: tools.implicitHeight + 20
            radius: 30
            color: "#e6141518"
            border.color: "#1fffffff"
            MouseArea { anchors.fill: parent; onPressed: win.startSystemMove() }
            Column {
                id: tools
                anchors.horizontalCenter: parent.horizontalCenter
                y: 10
                spacing: 6
                Repeater {
                    model: [
                        { id: "reload", icon: "refresh", tip: "Обновить" },
                        { id: "back", icon: "arrow_back", tip: "Назад" },
                        { id: "home", icon: "home", tip: "На главный экран" },
                        { id: "build", icon: "construction", tip: "Пересобрать из кода" },
                        { id: "shot", icon: "photo_camera", tip: "Скриншот экрана" },
                        { id: "zoom", icon: "zoom_in", tip: "Масштаб" },
                        { id: "top", icon: "push_pin", tip: "Поверх окон" },
                        { id: "quit", icon: "power_settings_new", tip: "Выключить" }
                    ]
                    Rectangle {
                        id: btn
                        required property var modelData
                        readonly property bool on: modelData.id === "top" && win.onTop
                        width: 44; height: 44; radius: 22
                        color: on ? "#f2f2f5" : bMouse.containsMouse ? "#2a2b31" : "transparent"
                        Behavior on color { ColorAnimation { duration: 120 } }
                        scale: bMouse.pressed ? 0.9 : 1
                        Behavior on scale { NumberAnimation { duration: 90 } }
                        Text {
                            anchors.centerIn: parent
                            text: btn.modelData.id === "build" && building ? "progress_activity" : btn.modelData.icon
                            font.family: win.fIcon; font.pixelSize: 22
                            color: btn.on ? "#0a0a0c" : btn.modelData.id === "quit" ? "#ff6b62" : "#f2f2f5"
                            RotationAnimation on rotation { running: btn.modelData.id === "build" && building; from: 0; to: 360; duration: 900; loops: Animation.Infinite }
                        }
                        ToolTip.visible: bMouse.containsMouse
                        ToolTip.delay: 400
                        ToolTip.text: btn.modelData.id === "zoom" ? "Масштаб: " + Math.round(win.zoom * 100) + "%" : btn.modelData.tip
                        MouseArea {
                            id: bMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: win.act(btn.modelData.id)
                        }
                    }
                }
            }
        }

        // a small note under the panel (saved, rebuilt...)
        Rectangle {
            visible: win.toast !== ""
            x: panel.x - width + panel.width
            y: panel.y + panel.height + 10
            width: toastText.implicitWidth + 24; height: 32; radius: 16
            color: "#e6141518"
            Text { id: toastText; anchors.centerIn: parent; text: win.toast; color: "#f2f2f5"; font.family: win.fMain; font.pixelSize: 12 }
        }
    }

    property bool building: false
    Connections {
        target: host
        function onRebuilt(ok, tail) {
            win.building = false;
            win.say(ok ? "Пересобрано" : "Сборка не удалась");
            if (ok) web.reload();
        }
    }
    function act(id) {
        if (id === "reload") web.reload();
        else if (id === "back") web.goBack();
        else if (id === "home") web.url = win.startUrl;
        else if (id === "build") { if (!building) { building = true; say("Пересобираю…"); host.rebuild(); } }
        else if (id === "shot") {
            const path = host.shotPath();
            phone.grabToImage(r => { r.saveToFile(path); win.say("Скриншот сохранён"); });
        }
        else if (id === "zoom") zoom = zoom > 0.95 ? 0.85 : zoom > 0.8 ? 0.72 : 1.0;
        else if (id === "top") onTop = !onTop;
        else if (id === "quit") Qt.quit();
    }
}
