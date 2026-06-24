import { SymbolView } from 'expo-symbols';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Modal, StatusBar, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptic } from '@/lib/haptics';
import * as ScreenOrientation from 'expo-screen-orientation';

export type RemoteScreenHandle = { pushFrame: (data: string) => void };

const SENT = String.fromCharCode(0x200b); // якорь скрытого ввода для детекта backspace

// HTML с зумом (pinch), паном и управлением одним пальцем. Картинка масштабируется
// ЛОКАЛЬНО на телефоне (мгновенно), на ПК уходят только нормализованные координаты.
const SCREEN_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>html,body{height:100%;margin:0;background:#000;overflow:hidden;touch-action:none}
#wrap{position:absolute;inset:0;overflow:hidden}
#stage{position:absolute;inset:0;transform-origin:0 0;will-change:transform}
#s{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block}
#hint{position:absolute;top:10px;left:0;right:0;text-align:center;color:#9aa;font:13px -apple-system,sans-serif;pointer-events:none}</style>
</head><body><div id="wrap"><div id="stage"><img id="s"/></div><div id="hint">подключаюсь к экрану…</div></div>
<script>(function(){
  function send(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  var wrap=document.getElementById('wrap'), stage=document.getElementById('stage'), img=document.getElementById('s'), hint=document.getElementById('hint');
  var scale=1, tx=0, ty=0, mode='control';
  window.__mode=function(m){ mode=m; };
  window.__reset=function(){ scale=1; tx=0; ty=0; applyT(); };
  window.__frame=function(b64){ img.src='data:image/jpeg;base64,'+b64; if(hint){hint.style.display='none';} };
  function applyT(){ stage.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')'; }
  // нормализованная координата [0..1] на исходной картинке (учитывает zoom/pan и letterbox)
  function norm(cx,cy){
    var W=wrap.clientWidth, H=wrap.clientHeight;
    var sx=(cx-tx)/scale, sy=(cy-ty)/scale;        // снять transform stage
    var iw=img.naturalWidth||16, ih=img.naturalHeight||9;
    var fc=Math.min(W/iw,H/ih), dw=iw*fc, dh=ih*fc, ox=(W-dw)/2, oy=(H-dh)/2;
    return { nx:Math.max(0,Math.min(1,(sx-ox)/dw)), ny:Math.max(0,Math.min(1,(sy-oy)/dh)) };
  }
  function clampPan(){
    var W=wrap.clientWidth, H=wrap.clientHeight;
    var minX=W-W*scale, minY=H-H*scale;
    tx=Math.min(0,Math.max(minX,tx)); ty=Math.min(0,Math.max(minY,ty));
  }
  var sx0=0,sy0=0,moved=false,lastMove=0,lastTap=0,lp=null,lpFired=false,dragging=false,lastNx=0,lastNy=0;
  var pinchD=0,pinchCx=0,pinchCy=0,pinching=false;
  function dist(a,b){ var dx=a.clientX-b.clientX, dy=a.clientY-b.clientY; return Math.sqrt(dx*dx+dy*dy); }
  function clearLp(){ if(lp){clearTimeout(lp);lp=null;} }
  wrap.addEventListener('touchstart',function(e){
    if(e.touches.length===2){
      pinching=true; clearLp();
      pinchD=dist(e.touches[0],e.touches[1]);
      pinchCx=(e.touches[0].clientX+e.touches[1].clientX)/2;
      pinchCy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      return;
    }
    var t=e.touches[0]; sx0=t.clientX; sy0=t.clientY; moved=false; lpFired=false; dragging=false;
    var p=norm(sx0,sy0); lastNx=p.nx; lastNy=p.ny;
    if(mode==='drag'){ dragging=true; send({t:'input',action:'down',nx:p.nx,ny:p.ny}); }
    else { lp=setTimeout(function(){ lpFired=true; var q=norm(sx0,sy0); send({t:'input',action:'click',nx:q.nx,ny:q.ny,button:'right'}); }, 480); }
  },{passive:false});
  wrap.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(pinching && e.touches.length===2){
      var nd=dist(e.touches[0],e.touches[1]);
      var ncx=(e.touches[0].clientX+e.touches[1].clientX)/2, ncy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      var k=nd/(pinchD||nd);
      var ns=Math.max(1,Math.min(5,scale*k));
      // зум к центру пинча
      tx=ncx-(ncx-tx)*(ns/scale); ty=ncy-(ncy-ty)*(ns/scale);
      scale=ns;
      tx+=ncx-pinchCx; ty+=ncy-pinchCy;        // пан картинки
      pinchD=nd; pinchCx=ncx; pinchCy=ncy;
      clampPan(); applyT(); return;
    }
    var t=e.touches[0], dx=t.clientX-sx0, dy=t.clientY-sy0;
    if(Math.abs(dx)>5||Math.abs(dy)>5){ if(!moved){moved=true;clearLp();} }
    if(!moved) return;
    var now=Date.now();
    if(mode==='scroll'){
      if(now-lastMove>40){ lastMove=now; var p=norm(t.clientX,t.clientY); send({t:'input',action:'scroll',nx:p.nx,ny:p.ny,dy: dy>0?-120:120}); sy0=t.clientY; }
      return;
    }
    if(mode==='drag'){
      if(now-lastMove>30){ lastMove=now; var p=norm(t.clientX,t.clientY); lastNx=p.nx; lastNy=p.ny; send({t:'input',action:'move',nx:p.nx,ny:p.ny}); }
      return;
    }
    // control: если увеличено — панорамируем вид; иначе двигаем курсор ПК
    if(scale>1.02){ tx+=dx; ty+=dy; sx0=t.clientX; sy0=t.clientY; clampPan(); applyT(); }
    else if(now-lastMove>30){ lastMove=now; var p=norm(t.clientX,t.clientY); lastNx=p.nx; lastNy=p.ny; send({t:'input',action:'move',nx:p.nx,ny:p.ny}); }
  },{passive:false});
  wrap.addEventListener('touchend',function(e){
    clearLp();
    if(pinching){ if(e.touches.length===0){pinching=false;} return; }
    if(dragging){ send({t:'input',action:'up',nx:lastNx,ny:lastNy}); dragging=false; return; }
    if(lpFired||moved) return;
    var now=Date.now(), p=norm(sx0,sy0);
    if(now-lastTap<300){ send({t:'input',action:'dbl',nx:p.nx,ny:p.ny}); lastTap=0; }
    else { send({t:'input',action:'click',nx:p.nx,ny:p.ny,button:'left'}); lastTap=now; }
  },{passive:false});
})();</script></body></html>`;

type Props = {
  send: (o: any) => void;
  screens: { id: string; label: string; primary: boolean }[];
  activeScreen: string | null;
  onSwitch: (id: string) => void;
  bottomInset: number;
};

export const RemoteScreen = forwardRef<RemoteScreenHandle, Props>(function RemoteScreen(
  { send, screens, activeScreen, onSwitch, bottomInset },
  ref,
) {
  const c = useTheme();
  const inlineWeb = useRef<WebView>(null);
  const fsWeb = useRef<WebView>(null);
  const kbInput = useRef<TextInput>(null);
  const [kbVal, setKbVal] = useState(SENT);
  const [full, setFull] = useState(false);
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState<'control' | 'drag' | 'scroll'>('control');
  const fullRef = useRef(false);

  // В полном экране — поворачиваем телефон в альбомную (как видео), потом обратно в портрет.
  useEffect(() => {
    if (full) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
    return () => { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {}); };
  }, [full]);

  const activeWeb = () => (fullRef.current ? fsWeb.current : inlineWeb.current);

  useImperativeHandle(ref, () => ({
    pushFrame: (data: string) => {
      const js = `window.__frame&&window.__frame(${JSON.stringify(data)});true;`;
      inlineWeb.current?.injectJavaScript(js);
      if (fullRef.current) fsWeb.current?.injectJavaScript(js);
    },
  }));

  function onMessage(e: any) {
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.t !== 'input') return;
    if (m.action === 'click' || m.action === 'dbl' || m.action === 'down') haptic.tap();
    send({ type: 'screen_input', action: m.action, nx: m.nx, ny: m.ny, dy: m.dy, button: m.button });
  }

  function setModeBoth(nm: 'control' | 'drag' | 'scroll') {
    const v = mode === nm ? 'control' : nm;
    setMode(v);
    const js = `window.__mode&&window.__mode('${v}');true;`;
    inlineWeb.current?.injectJavaScript(js);
    fsWeb.current?.injectJavaScript(js);
  }
  function resetZoom() {
    inlineWeb.current?.injectJavaScript('window.__reset&&window.__reset();true;');
    fsWeb.current?.injectJavaScript('window.__reset&&window.__reset();true;');
  }
  const key = (k: string) => { haptic.tap(); send({ type: 'screen_input', action: 'key', key: k }); };
  function onKbChange(t: string) {
    if (t.length > kbVal.length) send({ type: 'screen_input', action: 'key', text: t.slice(kbVal.length) });
    else if (t.length < kbVal.length) send({ type: 'screen_input', action: 'key', key: 'backspace' });
    setKbVal(SENT);
  }

  const screenView = (refW: React.RefObject<WebView | null>) => (
    <WebView
      ref={refW}
      originWhitelist={['*']}
      source={{ html: SCREEN_HTML }}
      onMessage={onMessage}
      style={{ backgroundColor: '#000', flex: 1 }}
      scrollEnabled={false}
      overScrollMode="never"
      androidLayerType="hardware"
    />
  );

  // Раскрывающееся меню управления (слева). Тап по кнопке ☰ → раскрывается группа.
  const controls = (inFull: boolean) => (
    <>
      {/* верхние кнопки: меню + развернуть/свернуть + сброс зума */}
      <View style={[styles.topBar, { top: inFull ? 44 : 8 }]} pointerEvents="box-none">
        <TouchableOpacity onPress={() => { haptic.press(); setMenu((v) => !v); }} style={[styles.fab, { backgroundColor: menu ? c.accent : 'rgba(20,22,28,0.82)' }]}>
          <SymbolView name={menu ? 'xmark' : 'slider.horizontal.3'} tintColor="#fff" size={18} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={resetZoom} style={[styles.fab, { backgroundColor: 'rgba(20,22,28,0.82)' }]}>
          <SymbolView name="arrow.up.left.and.arrow.down.right" tintColor="#fff" size={16} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { haptic.press(); fullRef.current = !inFull; setFull(!inFull); setMenu(false); }}
          style={[styles.fab, { backgroundColor: 'rgba(20,22,28,0.82)' }]}>
          <SymbolView name={inFull ? 'arrow.down.right.and.arrow.up.left' : 'arrow.up.left.and.arrow.down.right.circle'} tintColor="#fff" size={inFull ? 16 : 18} />
        </TouchableOpacity>
      </View>

      {/* раскрытая панель */}
      {menu && (
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={[styles.panel, { top: (inFull ? 44 : 8) + 50, backgroundColor: 'rgba(18,20,26,0.92)' }]}>
          <TouchableOpacity style={styles.row} onPress={() => { kbInput.current?.focus(); }}>
            <SymbolView name="keyboard" tintColor="#fff" size={16} />
            <ThemedText type="smallBold" style={styles.rowTxt}>Клавиатура</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => setModeBoth('drag')}>
            <SymbolView name="hand.draw" tintColor={mode === 'drag' ? c.accent : '#fff'} size={16} />
            <ThemedText type="smallBold" style={[styles.rowTxt, mode === 'drag' && { color: c.accent }]}>Перетаскивание</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={() => setModeBoth('scroll')}>
            <SymbolView name="arrow.up.arrow.down" tintColor={mode === 'scroll' ? c.accent : '#fff'} size={16} />
            <ThemedText type="smallBold" style={[styles.rowTxt, mode === 'scroll' && { color: c.accent }]}>Прокрутка</ThemedText>
          </TouchableOpacity>

          {screens.length > 1 && (
            <View style={styles.monitors}>
              {screens.map((s, i) => (
                <TouchableOpacity key={s.id} onPress={() => { haptic.select(); onSwitch(s.id); }}
                  style={[styles.monBtn, { backgroundColor: s.id === activeScreen ? c.accent : 'rgba(255,255,255,0.1)' }]}>
                  <ThemedText type="small" style={{ color: '#fff' }}>{s.primary ? 'Осн.' : `М${i + 1}`}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.keysRow}>
            {([['esc', 'esc'], ['tab', 'tab'], ['enter', '⏎'], ['backspace', '⌫']] as [string, string][]).map(([k, l]) => (
              <TouchableOpacity key={k} style={styles.keyBtn} onPress={() => key(k)}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>{l}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.keysRow}>
            {([['left', '←'], ['up', '↑'], ['down', '↓'], ['right', '→']] as [string, string][]).map(([k, l]) => (
              <TouchableOpacity key={k} style={styles.keyBtn} onPress={() => key(k)}>
                <ThemedText type="smallBold" style={{ color: '#fff' }}>{l}</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      )}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, overflow: 'hidden', borderRadius: Radius.md, marginHorizontal: Spacing.three }}>
        {screenView(inlineWeb)}
        {!full && controls(false)}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', paddingVertical: 6 }}>
        тап — клик · долгое — правый клик · 2 пальца — зум · ☰ — управление
      </ThemedText>
      <View style={{ height: bottomInset }} />

      {/* скрытый ввод текста с системной клавиатуры */}
      <TextInput
        ref={kbInput}
        value={kbVal}
        onChangeText={onKbChange}
        onSubmitEditing={() => key('enter')}
        blurOnSubmit={false}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.hidden}
      />

      {/* Полноэкранный режим */}
      <Modal visible={full} animationType="fade" onRequestClose={() => { fullRef.current = false; setFull(false); }} supportedOrientations={['portrait', 'landscape']}>
        <StatusBar hidden />
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {screenView(fsWeb)}
          {controls(true)}
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  topBar: { position: 'absolute', left: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fab: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  panel: { position: 'absolute', left: 8, width: 210, borderRadius: Radius.lg, padding: Spacing.two, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 9, paddingHorizontal: Spacing.two },
  rowTxt: { color: '#fff' },
  monitors: { flexDirection: 'row', gap: 6, paddingVertical: Spacing.one, paddingHorizontal: Spacing.two, flexWrap: 'wrap' },
  monBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.sm },
  keysRow: { flexDirection: 'row', gap: 6, paddingHorizontal: Spacing.two, paddingVertical: 3 },
  keyBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: Radius.sm, backgroundColor: 'rgba(255,255,255,0.1)' },
  hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, top: -100 },
});
