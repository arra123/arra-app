import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { FileSystemUploadType, uploadAsync } from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { RemoteScreen, type RemoteScreenHandle } from '@/components/remote-screen';
import { SlidingSegment } from '@/components/sliding-segment';
import { SyncPanel } from '@/components/sync-panel';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, Radius, Spacing } from '@/constants/theme';
import { API_URL, getToken } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { useWorkspace } from '@/lib/workspace';

const c = Colors.dark;
const WS_URL = API_URL.replace(/^http/, 'ws') + '/client';

type Device = { id: string; name: string; online: boolean };
type Entry = { name: string; dir: boolean; size: number; path: string };

let reqN = 0;
const newReq = () => 'p' + ++reqN;

// HTML с xterm (грузится с CDN — телефон онлайн). Двусторонний мост с RN.
const TERM_HTML = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css">
<style>html,body{height:100%;margin:0;background:#0a0b0d;overflow:hidden}#t{height:100%;padding:6px}</style>
</head><body><div id="t"></div>
<script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-webgl@0.18.0/lib/addon-webgl.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@xterm/addon-canvas@0.7.0/lib/addon-canvas.min.js"></script>
<script>
(function(){
  function send(o){ if(window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function boot(){
    if(!window.Terminal){ setTimeout(boot,200); return; }
    var term=new Terminal({fontSize:12,lineHeight:1.0,letterSpacing:0,cursorBlink:true,convertEol:false,scrollback:8000,
      fontFamily:'Menlo, Courier, monospace',
      theme:{background:'#0a0b0d',foreground:'#cfd3da',cursor:'#6E79E6'}});
    var fit=new FitAddon.FitAddon(); term.loadAddon(fit); var host=document.getElementById('t'); term.open(host);
    // Рендер в canvas/GPU вместо DOM: убирает «тряску» при частой перерисовке TUI (Claude, vim).
    // DOM-рендер на мобильном WebView дрожит из-за рефлоу; WebGL/canvas рисуют кадр целиком.
    try {
      if(window.WebglAddon){ var gl=new WebglAddon.WebglAddon(); gl.onContextLoss(function(){ try{gl.dispose();}catch(e){} }); term.loadAddon(gl); }
      else if(window.CanvasAddon){ term.loadAddon(new CanvasAddon.CanvasAddon()); }
    } catch(e){ try{ if(window.CanvasAddon) term.loadAddon(new CanvasAddon.CanvasAddon()); }catch(e2){} }
    function doFit(){ try{ fit.fit(); send({t:'resize',cols:term.cols,rows:term.rows}); }catch(e){} }
    window.__recv=function(d){ term.write(d, function(){ try{ term.refresh(0, term.rows-1); }catch(e){} }); };
    window.__setsize=function(c,r){ try{ if(c>0&&r>0){ term.resize(c,r); term.refresh(0,term.rows-1); } }catch(e){} };
    window.__fit=doFit;
    window.__focus=function(){ term.focus(); };
    window.__blur=function(){ try{ if(term.textarea) term.textarea.blur(); term.blur(); }catch(e){} };
    window.__scroll=function(n){ try{ term.scrollLines(n); }catch(e){} };
    term.onData(function(d){ send({t:'data',d:d}); });
    window.addEventListener('resize',doFit);
    // авто-подгонка под контейнер при любом изменении (клавиатура, строка сообщения) — без обрезки
    try { if(window.ResizeObserver){ var __ro=new ResizeObserver(function(){ doFit(); }); __ro.observe(host); __ro.observe(document.body); } } catch(e){}
    // Скролл пальцем. В обычном буфере — прокрутка истории xterm.
    // Внутри claude/vim (альтернативный экран) истории нет — шлём «колесо мыши»,
    // чтобы приложение само листало (иначе свайп замирал).
    // Полный контроль скролла пальцем (без конфликта с нативным — иначе «то листает, то нет»).
    var ty=null, acc=0;
    function rowH(){ try{ var h=term._core&&term._core._renderService&&term._core._renderService.dimensions.css.cell.height; return (h&&h>4)?h:16; }catch(e){ return 16; } }
    host.addEventListener('touchstart',function(e){ if(e.touches.length===1){ ty=e.touches[0].clientY; acc=0; } },{passive:false});
    host.addEventListener('touchmove',function(e){
      if(ty===null||e.touches.length!==1) return;
      var y=e.touches[0].clientY; acc+=(y-ty); ty=y; var h=rowH(); var n=0;
      while(Math.abs(acc)>=h){ var up=acc>0; acc+= up?-h:h; n += up?1:-1; }
      if(n!==0){
        e.preventDefault();
        if(term.buffer.active.type==='alternate'){
          var one = n>0 ? '\\x1b[<64;1;1M' : '\\x1b[<65;1;1M', seq='';
          for(var i=0;i<Math.abs(n);i++) seq+=one;
          send({t:'data',d:seq});
        } else {
          term.scrollLines(n>0 ? -Math.abs(n) : Math.abs(n));
        }
      }
    },{passive:false});
    host.addEventListener('touchend',function(){ ty=null; },{passive:false});
    setTimeout(function(){ doFit(); send({t:'ready',cols:term.cols,rows:term.rows}); },300);
  }
  boot();
})();
</script></body></html>`;


const KEYS: { label: string; seq: string }[] = [
  { label: 'esc', seq: '\x1b' },
  { label: 'tab', seq: '\t' },
  { label: 'ctrl c', seq: '\x03' },
  { label: '↑', seq: '\x1b[A' },
  { label: '↓', seq: '\x1b[B' },
  { label: '←', seq: '\x1b[D' },
  { label: '→', seq: '\x1b[C' },
];

export default function PcScreen() {
  const insets = useSafeAreaInsets();
  const workspace = useWorkspace();
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [devOpen, setDevOpen] = useState(false); // открыт ли список выбора ПК
  const [termEpoch, setTermEpoch] = useState(0); // ремоунт терминалов только при ручной смене ПК
  const [sub, setSub] = useState<'term' | 'explorer' | 'screen' | 'transfer'>('term');

  // удалённый экран
  const screenRef = useRef<RemoteScreenHandle>(null);
  const [screens, setScreens] = useState<{ id: string; label: string; primary: boolean; width: number; height: number }[]>([]);
  const [activeScreen, setActiveScreen] = useState<string | null>(null);
  const screenOn = useRef(false);

  // терминалы (несколько вкладок, как в VS Code). У каждого свой termId, своя папка и сессия на ПК.
  const [terms, setTerms] = useState<{ id: string; cwd: string }[]>([{ id: '1', cwd: '' }]);
  const [activeTerm, setActiveTerm] = useState('1');
  const nextTermId = useRef(2);
  const webRefs = useRef<Record<string, WebView | null>>({});
  const termReady = useRef<Record<string, boolean>>({});
  const termCwds = useRef<Record<string, string>>({ '1': '' }); // termId -> папка (для pty_start)
  const termAttach = useRef<Record<string, boolean>>({}); // termId -> подключаемся к уже открытой на ПК сессии
  const [pcTerms, setPcTerms] = useState<{ termId: string; cwd: string }[]>([]); // сессии, открытые на самом ПК
  const activeWeb = () => webRefs.current[activeTerm];
  // refs для доступа из замыкания WS-обработчика (иначе видит устаревшее состояние)
  const termsRef = useRef(terms);
  const activeTermRef = useRef(activeTerm);
  const pendingAttach = useRef(0);
  const [recentPicker, setRecentPicker] = useState(false);

  // всплывающий выбор папки при открытии нового терминала
  const [picker, setPicker] = useState(false);
  const [pickerTree, setPickerTree] = useState<{ path: string; parent: string | null; drives: boolean; entries: Entry[] }>({ path: '', parent: null, drives: true, entries: [] });
  const pickReq = () => 'pk' + ++reqN;
  const pickerOpenDir = (path: string) => send({ type: 'fs_list', reqId: pickReq(), path });

  // проводник
  const [tree, setTree] = useState<{ path: string; parent: string | null; drives: boolean; entries: Entry[] }>({ path: '', parent: null, drives: true, entries: [] });
  const [file, setFile] = useState<{ path: string; content: string; editable: boolean } | null>(null);
  const [draft, setDraft] = useState('');
  const [preview, setPreview] = useState<{ path: string; name: string; mime: string; data: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyMsg, setBusyMsg] = useState('');
  const [compose, setCompose] = useState('');

  const deviceIdRef = useRef<string | null>(null);
  const manualPick = useRef(false); // пользователь выбрал ПК вручную → не переключать автоматически

  useEffect(() => { termsRef.current = terms; }, [terms]);
  useEffect(() => { activeTermRef.current = activeTerm; }, [activeTerm]);
  useEffect(() => { deviceIdRef.current = deviceId; }, [deviceId]);

  // Переход из проекта в меню открывает терминал сразу в его локальной папке.
  // Это связывает «выбрать проект» и «продолжить работу» в один понятный поток.
  useEffect(() => {
    const project = workspace.activeProject;
    if (!project?.path) return;
    if (workspace.activeDeviceId && workspace.activeDeviceId !== deviceIdRef.current) {
      manualPick.current = true;
      deviceIdRef.current = workspace.activeDeviceId;
      setDeviceId(workspace.activeDeviceId);
    }
    const safeName = project.name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48) || 'project';
    const termId = `project-${safeName}`;
    termCwds.current[termId] = project.path;
    termAttach.current[termId] = false;
    setTerms((previous) => previous.some((term) => term.id === termId) ? previous : [...previous, { id: termId, cwd: project.path! }]);
    setActiveTerm(termId);
    setSub('term');
  }, [workspace.activeDeviceId, workspace.activeProject]);

  const send = useCallback((obj: any) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ to: 'pc', deviceId: deviceIdRef.current, ...obj }));
  }, []);

  // ---- WebSocket ----
  useEffect(() => {
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    async function connect() {
      const token = await getToken();
      if (!token || !alive) return;
      const ws = new WebSocket(`${WS_URL}?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => { if (alive) { setConnected(true); ws.send(JSON.stringify({ type: 'list_devices' })); } };
      ws.onclose = () => { if (!alive) return; setConnected(false); reconnectTimer = setTimeout(connect, 2500); };
      ws.onerror = () => { try { ws.close(); } catch {} };
      ws.onmessage = (ev) => { let m: any; try { m = JSON.parse(ev.data as string); } catch { return; } handle(m); };
    }

    function handle(m: any) {
      switch (m.type) {
        case 'devices':
          setDevices(m.devices || []);
          setDeviceId((cur) => {
            // Если выбрал ПК вручную — НЕ переключаем сам (раньше авто-опрос скакал
            // между ноутом и ПК → два потока, лаг, клики не туда). Держим выбор,
            // пока устройство вообще существует в списке.
            if (manualPick.current && cur && (m.devices || []).some((d: Device) => d.id === cur)) return cur;
            if (cur && (m.devices || []).some((d: Device) => d.id === cur && d.online)) return cur;
            const online = (m.devices || []).find((d: Device) => d.online);
            return online ? online.id : cur || (m.devices?.[0]?.id ?? null);
          });
          break;
        case 'pty_out': {
          const ref = webRefs.current[m.termId || '1'];
          ref?.injectJavaScript(`window.__recv && window.__recv(${JSON.stringify(m.data)});true;`);
          break;
        }
        case 'pty_size': {
          // подключились к ПК-сессии — подстраиваем свой терминал под её размер (видим то же самое)
          const ref = webRefs.current[m.termId];
          if (ref && m.cols && m.rows) ref.injectJavaScript(`window.__setsize&&window.__setsize(${m.cols},${m.rows});true;`);
          break;
        }
        case 'pty_exit':
          // сессия на ПК завершилась — перезапустим терминал в той же вкладке
          termReady.current[m.termId || '1'] = false;
          setPcTerms((prev) => prev.filter((t) => t.termId !== (m.termId || '')));
          break;
        case 'pty_list':
          // список сессий, открытых на ПК — можно подключиться к той же
          setPcTerms((m.terms || []).filter((t: any) => t.termId));
          break;
        case 'pty_opened':
          setPcTerms((prev) => prev.some((t) => t.termId === m.termId) ? prev : [...prev, { termId: m.termId, cwd: m.cwd || '' }]);
          // PC→телефон: сессию, открытую на ПК, сразу показываем вкладкой и подключаемся к ней
          if (m.termId) setTerms((prev) => {
            if (prev.some((t) => t.id === m.termId)) return prev;
            termAttach.current[m.termId] = true;
            termCwds.current[m.termId] = m.cwd || '';
            return [...prev, { id: m.termId, cwd: m.cwd || '' }];
          });
          break;
        case 'screen_frame':
          screenRef.current?.pushFrame(m.data);
          break;
        case 'screens':
          setScreens(m.screens || []);
          setActiveScreen((cur) => cur || (m.screens || []).find((s: any) => s.primary)?.id || (m.screens?.[0]?.id ?? null));
          break;
        case 'claude_done': {
          const idx = termsRef.current.findIndex((t) => t.id === (m.termId || '1'));
          haptic.success(); // заметная вибрация — видно/чувствуется, даже если не смотришь
          setTimeout(() => haptic.success(), 350); // двойной импульс — точно не пропустить
          setBusyMsg(`✅ Claude закончил${idx >= 0 ? ` в терминале ${idx + 1}` : ''}`);
          setTimeout(() => setBusyMsg(''), 9000);
          break;
        }
        case 'file_saved':
          // файл с телефона сохранён на ПК — если ждём прикрепление, вставляем путь в терминал
          if (pendingAttach.current > 0 && m.path) {
            pendingAttach.current = Math.max(0, pendingAttach.current - 1);
            setCompose((prev) => (prev.trim() ? prev.trimEnd() + ' ' : '') + `"${m.path}" `);
            setBusyMsg(pendingAttach.current ? `Добавлено · осталось ${pendingAttach.current}` : 'Файлы добавлены в сообщение ✓');
            setTimeout(() => setBusyMsg(''), 2500);
          }
          break;
        case 'fs_list': {
          const t = { path: m.path || '', parent: m.parent ?? null, drives: !!m.drives, entries: m.entries || [] };
          if ((m.reqId || '').startsWith('pk')) setPickerTree(t);
          else setTree(t);
          break;
        }
        case 'fs_read': setFile({ path: m.path, content: m.content, editable: m.editable }); setDraft(m.content); break;
        case 'fs_preview': setBusyMsg(''); setPreview({ path: m.path, name: m.name, mime: m.mime, data: m.data }); break;
        case 'fs_write': setSaving(false); break;
        case 'fs_download': setBusyMsg('Файл отправлен в приложение ✓'); setTimeout(() => setBusyMsg(''), 2500); break;
        case 'fs_zip': setBusyMsg(`Архив готов: ${m.name} → во вкладке «Файлы»`); setTimeout(() => setBusyMsg(''), 3500); break;
        case 'pc_offline': setBusyMsg('Компьютер не в сети'); setTimeout(() => setBusyMsg(''), 2500); break;
        case 'err': setBusyMsg(m.message || 'Ошибка'); setSaving(false); setTimeout(() => setBusyMsg(''), 3000); break;
        default: break;
      }
    }

    connect();
    return () => { alive = false; clearTimeout(reconnectTimer); try { wsRef.current?.close(); } catch {} };
  }, []);

  useEffect(() => {
    if (connected && deviceId) { send({ type: 'hello' }); send({ type: 'pty_list' }); if (tree.entries.length === 0) send({ type: 'fs_list', reqId: newReq(), path: '' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, deviceId]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ type: 'list_devices' }));
        if (deviceIdRef.current) ws.send(JSON.stringify({ to: 'pc', deviceId: deviceIdRef.current, type: 'phone_presence' }));
      }
    }, 5000);
    return () => clearInterval(t);
  }, [connected]);

  const [kb, setKb] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKb(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // ---- терминал: сообщения из WebView (каждая вкладка шлёт со своим termId) ----
  const onWebMessage = (termId: string) => (e: any) => {
    let m: any; try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.t === 'data') send({ type: 'pty_input', termId, data: m.d });
    else if (m.t === 'resize') send({ type: 'pty_resize', termId, cols: m.cols, rows: m.rows });
    else if (m.t === 'ready') {
      termReady.current[termId] = true;
      // если это подключение к уже открытой на ПК сессии — attach (получим текущий экран),
      // иначе — старт новой
      if (termAttach.current[termId]) send({ type: 'pty_attach', termId, cols: m.cols, rows: m.rows, cwd: termCwds.current[termId] || undefined });
      else send({ type: 'pty_start', termId, cols: m.cols, rows: m.rows, cwd: termCwds.current[termId] || undefined });
    }
  };
  const sendKey = (seq: string) => { send({ type: 'pty_input', termId: activeTerm, data: seq }); };
  const hideKeyboard = () => { activeWeb()?.injectJavaScript('window.__blur&&window.__blur();if(document.activeElement)document.activeElement.blur();true;'); Keyboard.dismiss(); };
  useFocusEffect(
    useCallback(() => {
      Keyboard.dismiss();
      Object.values(webRefs.current).forEach((w) => w?.injectJavaScript('window.__blur&&window.__blur();if(document.activeElement)document.activeElement.blur();true;'));
      return () => {
        Keyboard.dismiss();
        Object.values(webRefs.current).forEach((w) => w?.injectJavaScript('window.__blur&&window.__blur();if(document.activeElement)document.activeElement.blur();true;'));
      };
    }, []),
  );
  const pickMode = useRef(false);
  const pickFileForTerminal = () => { pickMode.current = true; setSub('explorer'); setBusyMsg('Выбери файл — его путь вставится в терминал'); setTimeout(() => setBusyMsg(''), 3500); };

  // ---- удалённый экран ----
  const startScreenShare = (displayId?: string) => { screenOn.current = true; send({ type: 'screen_start', displayId: displayId || activeScreen || undefined, fps: 16, quality: 68, width: 1600 }); };
  const stopScreenShare = () => { screenOn.current = false; send({ type: 'screen_stop' }); };
  // Мгновенное переключение монитора — без перезапуска потока на ПК.
  const switchScreen = (id: string) => { setActiveScreen(id); send({ type: 'screen_switch', displayId: id }); };
  useEffect(() => {
    if (!connected || !deviceId) return;
    if (sub === 'screen') { send({ type: 'screen_list' }); startScreenShare(); }
    else if (screenOn.current) { stopScreenShare(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, connected, deviceId]);

  // вставить то, что скопировано на телефоне
  const pasteFromClipboard = async () => {
    try {
      const Clipboard = await import('expo-clipboard');
      const txt = await Clipboard.getStringAsync();
      if (txt) sendKey(txt);
      else { setBusyMsg('Буфер пуст'); setTimeout(() => setBusyMsg(''), 1500); }
    } catch { setBusyMsg('Не удалось вставить'); setTimeout(() => setBusyMsg(''), 2000); }
  };

  // прикрепить фото/файл с телефона прямо в терминал: загрузить на ПК → вставить путь
  async function uploadToPc(uri: string) {
    setBusyMsg('Отправляю файл на ПК…');
    pendingAttach.current += 1;
    try {
      const token = await getToken();
      const target = deviceIdRef.current ? `?targetTokenId=${encodeURIComponent(deviceIdRef.current)}` : '';
      const res = await uploadAsync(`${API_URL}/files${target}`, uri, {
        httpMethod: 'POST', uploadType: FileSystemUploadType.MULTIPART, fieldName: 'file',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (res.status >= 400) throw new Error('Ошибка ' + res.status);
      // путь вставится, когда ПК сохранит файл и пришлёт file_saved
      setTimeout(() => { if (pendingAttach.current > 0) { setBusyMsg(`Жду ПК · файлов в очереди ${pendingAttach.current}`); } }, 15000);
    } catch {
      pendingAttach.current = Math.max(0, pendingAttach.current - 1);
      setBusyMsg('Не удалось отправить'); setTimeout(() => setBusyMsg(''), 2500);
    }
  }
  async function attachRecentPhotos(count: number) {
    setRecentPicker(false);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) { setBusyMsg('Нужен доступ к фото'); return; }
      const result = await MediaLibrary.getAssetsAsync({ first: count, mediaType: 'photo', sortBy: [['creationTime', false]] });
      const assets = result.assets?.slice(0, count) || [];
      if (!assets.length) { setBusyMsg('Фото не найдены'); return; }
      for (let i = 0; i < assets.length; i++) {
        setBusyMsg(`Отправляю фото ${i + 1} из ${assets.length}…`);
        const info = await MediaLibrary.getAssetInfoAsync(assets[i]);
        await uploadToPc(info.localUri || assets[i].uri);
      }
    } catch { setBusyMsg('Не удалось отправить последние фото'); setTimeout(() => setBusyMsg(''), 2500); }
  }
  const attachToTerminal = () => {
    Alert.alert('Прикрепить в терминал', 'Откуда взять?', [
      { text: 'Фото из галереи', onPress: async () => {
        const ImagePicker = await import('expo-image-picker');
        const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, mediaTypes: ['images', 'videos'] });
        if (!r.canceled && r.assets?.[0]) uploadToPc(r.assets[0].uri);
      } },
      { text: 'Снять фото', onPress: async () => {
        const ImagePicker = await import('expo-image-picker');
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) { setBusyMsg('Нужен доступ к камере'); setTimeout(() => setBusyMsg(''), 2000); return; }
        const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
        if (!r.canceled && r.assets?.[0]) uploadToPc(r.assets[0].uri);
      } },
      { text: 'Файл', onPress: async () => {
        const DocumentPicker = await import('expo-document-picker');
        const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
        if (!r.canceled && r.assets?.[0]) uploadToPc(r.assets[0].uri);
      } },
      { text: 'С компьютера', onPress: pickFileForTerminal },
      { text: 'Отмена', style: 'cancel' },
    ]);
  };

  // открыть/закрыть/переключить вкладки терминала
  const addTerm = () => {
    if (terms.length >= 4) { setBusyMsg('Максимум 4 терминала'); setTimeout(() => setBusyMsg(''), 2000); return; }
    // показываем выбор папки — терминал откроется именно в ней
    setPicker(true);
    pickerOpenDir(termCwds.current[activeTerm] || '');
  };
  const createTermIn = (cwd: string) => {
    const id = String(nextTermId.current++);
    termCwds.current[id] = cwd || '';
    setTerms((p) => [...p, { id, cwd: cwd || '' }]);
    setActiveTerm(id);
    setPicker(false);
  };
  // Подключиться к сессии, открытой НА ПК (тот же терминал — продолжаем работу с телефона)
  const attachPcTerm = (t: { termId: string; cwd: string }) => {
    if (terms.some((x) => x.id === t.termId)) { switchTerm(t.termId); return; }
    termAttach.current[t.termId] = true;
    termCwds.current[t.termId] = t.cwd || '';
    setTerms((p) => [...p, { id: t.termId, cwd: t.cwd || '' }]);
    setActiveTerm(t.termId);
  };
  const doCloseTerm = (id: string) => {
    send({ type: 'pty_kill', termId: id });
    termReady.current[id] = false;
    delete webRefs.current[id];
    delete termCwds.current[id];
    setTerms((p) => {
      const left = p.filter((t) => t.id !== id);
      const safe = left.length ? left : [{ id: '1', cwd: '' }];
      if (id === activeTerm) setActiveTerm(safe[safe.length - 1].id);
      return safe;
    });
  };
  const closeTerm = (id: string) => {
    const idx = terms.findIndex((t) => t.id === id);
    Alert.alert('Закрыть терминал?', `Сессия ${idx >= 0 ? idx + 1 : ''} и её процессы будут завершены.`, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Закрыть', style: 'destructive', onPress: () => doCloseTerm(id) },
    ]);
  };
  const switchTerm = (id: string) => {
    setActiveTerm(id);
    Keyboard.dismiss();
    setTimeout(() => webRefs.current[id]?.injectJavaScript('window.__fit&&window.__fit();window.__blur&&window.__blur();true;'), 60);
  };

  // Поле «сообщения»: набираешь/диктуешь/прикрепляешь, потом «отправить» → вставляется в терминал
  const appendCompose = (t: string) => setCompose((prev) => (prev.trim() ? prev.trimEnd() + ' ' : '') + t);
  const sendCompose = () => {
    const t = compose.trim();
    if (!t) return;
    send({ type: 'pty_input', termId: activeTerm, data: t }); // вставляем в терминал (без Enter — можно доредактировать)
    setCompose('');
    hideKeyboard();
  };

  // голосовой ввод → в поле сообщения (а не сразу в терминал)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  async function startVoice() {
    if (recording) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { setBusyMsg('Нужен доступ к микрофону'); setTimeout(() => setBusyMsg(''), 2500); return; }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldPlayInBackground: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setRecording(true);
  }
  async function stopVoice() {
    if (!recording) return;
    setRecording(false);
    try { await recorder.stop(); } catch {}
    const uri = recorder.uri;
    if (!uri) return;
    setBusyMsg('Распознаю…');
    try {
      const token = await getToken();
      const res = await uploadAsync(`${API_URL}/ai/transcribe`, uri, {
        httpMethod: 'POST', uploadType: FileSystemUploadType.MULTIPART, fieldName: 'file',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = JSON.parse(res.body || '{}');
      setBusyMsg('');
      if (data.text) appendCompose(data.text); // надиктованное → в поле сообщения
    } catch {
      setBusyMsg('Не распознал'); setTimeout(() => setBusyMsg(''), 2500);
    }
  }

  // ---- проводник ----
  const openDir = (path: string) => send({ type: 'fs_list', reqId: newReq(), path });
  const goUp = () => {
    if (tree.drives) return;
    if (/^[A-Za-z]:\\?$/.test(tree.path)) { openDir(''); return; }
    openDir(tree.parent != null ? tree.parent : '');
  };
  const openTerminalHere = () => {
    // открыть новый терминал в выбранной папке проводника
    createTermIn(tree.path || '');
    setSub('term');
  };
  const downloadFile = (path: string) => { setBusyMsg('Скачиваю в приложение → смотри во вкладке «Файлы»'); send({ type: 'fs_download', reqId: newReq(), path }); };
  const zipFolder = (path: string) => { setBusyMsg('Архивирую папку… появится во вкладке «Файлы»'); send({ type: 'fs_zip', reqId: newReq(), path }); };
  const TEXT_EXT = /\.(txt|md|js|jsx|ts|tsx|json|css|scss|html|xml|ya?ml|py|java|c|cpp|h|cs|go|rs|rb|php|sh|bat|ps1|env|gitignore|sql|toml|ini|conf|log|mjs|cjs|vue|svelte)$/i;
  const PREVIEW_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|svg|pdf)$/i;
  const openEntry = (e: Entry) => {
    if (e.dir) { openDir(e.path); return; }
    if (pickMode.current) { pickMode.current = false; appendCompose(`"${e.path}" `); setSub('term'); return; }
    if (TEXT_EXT.test(e.name)) send({ type: 'fs_read', reqId: newReq(), path: e.path });
    else if (PREVIEW_EXT.test(e.name)) { setBusyMsg('Открываю…'); send({ type: 'fs_preview', reqId: newReq(), path: e.path }); }
    else downloadFile(e.path); // прочий бинарь — скачиваем в приложение
  };
  const saveFile = () => { if (!file) return; setSaving(true); send({ type: 'fs_write', reqId: newReq(), path: file.path, content: draft }); };

  const selDevice = devices.find((d) => d.id === deviceId);
  const online = connected && selDevice?.online;
  // Ручной выбор ПК (ноут / стационарный и т.д.). Сбрасываем состояние, чтобы оно
  // перезапросилось у нового устройства; терминалы перемонтируются (см. key с deviceId).
  const pickDevice = (id: string) => {
    setDevOpen(false);
    if (id === deviceId) return;
    manualPick.current = true;
    // Останавливаем трансляцию на ТЕКУЩЕМ ПК (send ещё уходит на старый deviceId),
    // иначе оба ПК продолжают слать кадры → каша и лаг.
    if (screenOn.current) send({ type: 'screen_stop' });
    setDeviceId(id);
    setTree({ path: '', parent: null, drives: true, entries: [] });
    setScreens([]);
    setActiveScreen(null);
    setTerms([{ id: '1', cwd: '' }]);
    setActiveTerm('1');
    setPcTerms([]);
    termAttach.current = {};
    termReady.current = {};
    setTermEpoch((e) => e + 1); // принудительный ремоунт терминалов под новый ПК
  };

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: Spacing.two }]}>
        <View style={styles.headerRight}>
          <View style={styles.agentShortcuts}>
            <TouchableOpacity onPress={() => sendKey('codex --yolo\r')} style={[styles.agentShortcut, { borderColor: c.separator }]}>
              <View style={[styles.presetDot, { backgroundColor: c.accent }]} /><ThemedText type="smallBold">Codex</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => sendKey('claude --dangerously-skip-permissions\r')} style={[styles.agentShortcut, { borderColor: c.separator }]}>
              <View style={[styles.presetDot, { backgroundColor: '#D88B5A' }]} /><ThemedText type="smallBold">Claude</ThemedText>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.statusRow}
            activeOpacity={devices.length > 1 ? 0.6 : 1}
            onPress={() => { if (devices.length > 1) setDevOpen((v) => !v); }}>
            <View style={[styles.dot, { backgroundColor: online ? c.success : c.textSecondary }]} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {!connected ? 'подключаюсь…' : online ? (selDevice?.name || 'ПК на связи') : (selDevice?.name ? `${selDevice.name} — не в сети` : 'ПК не в сети')}
            </ThemedText>
            {devices.length > 1 && <SymbolView name={devOpen ? 'chevron.up' : 'chevron.down'} tintColor={c.textSecondary} size={12} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Выбор ПК: ноут / стационарный и т.д. (когда устройств больше одного) */}
      {devOpen && devices.length > 1 && (
        <View style={styles.devList}>
          {devices.map((d) => (
            <TouchableOpacity key={d.id} style={styles.devRow} onPress={() => pickDevice(d.id)}>
              <View style={[styles.dot, { backgroundColor: d.online ? c.success : c.textSecondary }]} />
              <ThemedText style={{ flex: 1 }} numberOfLines={1}>{d.name || 'ПК'}</ThemedText>
              {d.id === deviceId && <SymbolView name="checkmark" tintColor={c.accent} size={15} />}
            </TouchableOpacity>
          ))}
        </View>
      )}

      <SlidingSegment
        compact
        value={sub}
        onChange={setSub}
        style={styles.seg}
        options={[
          { value: 'term', label: 'Терминал' },
          { value: 'explorer', label: 'Файлы' },
          { value: 'screen', label: 'Экран' },
          { value: 'transfer', label: 'Sync' },
        ]}
      />

      {!!busyMsg && <ThemedText type="small" style={styles.toast}>{busyMsg}</ThemedText>}

      {sub === 'term' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <View style={styles.termTabs}>
            {terms.map((t, i) => (
              <Pressable key={t.id} onPress={() => switchTerm(t.id)} style={[styles.termTab, t.id === activeTerm && styles.termTabOn]}>
                <SymbolView name="terminal.fill" tintColor={t.id === activeTerm ? '#fff' : c.textSecondary} size={12} />
                <ThemedText type="smallBold" style={{ color: t.id === activeTerm ? '#fff' : c.textSecondary }}>{i + 1}</ThemedText>
                {terms.length > 1 && (
                  <TouchableOpacity hitSlop={8} onPress={() => closeTerm(t.id)} style={{ marginLeft: 2 }}>
                    <SymbolView name="xmark" tintColor={t.id === activeTerm ? '#fff' : c.textSecondary} size={11} />
                  </TouchableOpacity>
                )}
              </Pressable>
            ))}
            <TouchableOpacity onPress={addTerm} style={styles.termAdd}>
              <SymbolView name="plus" tintColor={c.accent} size={16} />
            </TouchableOpacity>
            {pcTerms.filter((pt) => !terms.some((t) => t.id === pt.termId)).map((pt) => (
              <TouchableOpacity key={pt.termId} onPress={() => attachPcTerm(pt)} style={[styles.termTab, styles.termTabPc]}>
                <SymbolView name="desktopcomputer" tintColor={c.success} size={12} />
                <ThemedText type="smallBold" style={{ color: c.success }}>ПК</ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.termWrap}>
            {terms.map((t) => (
              <View
                key={`${termEpoch}:${t.id}`}
                style={[StyleSheet.absoluteFill, { opacity: t.id === activeTerm ? 1 : 0, zIndex: t.id === activeTerm ? 1 : 0 }]}
                pointerEvents={t.id === activeTerm ? 'auto' : 'none'}>
                <WebView
                  ref={(r) => { webRefs.current[t.id] = r; }}
                  originWhitelist={['*']}
                  source={{ html: TERM_HTML }}
                  onMessage={onWebMessage(t.id)}
                  keyboardDisplayRequiresUserAction
                  hideKeyboardAccessoryView
                  style={{ backgroundColor: '#0a0b0d' }}
                  scrollEnabled={false}
                />
              </View>
            ))}
          </View>
          {/* Компактный ряд клавиш: свернуть клавиатуру, Enter и стрелки (↑↓←→), esc/tab/ctrl c */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.keybar} contentContainerStyle={{ gap: 6, paddingHorizontal: Spacing.three, alignItems: 'center' }}>
            <TouchableOpacity style={[styles.key, { backgroundColor: c.backgroundElement }]} onPress={hideKeyboard}>
              <SymbolView name="keyboard.chevron.compact.down" tintColor={c.text} size={18} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, { backgroundColor: c.accent, minWidth: 50 }]} onPress={() => sendKey('\r')}>
              <ThemedText type="smallBold" style={{ color: '#fff', fontSize: 16 }}>↵</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.key, { minWidth: 88 }]} onPress={pasteFromClipboard}>
              <SymbolView name="doc.on.clipboard" tintColor={c.text} size={15} />
              <ThemedText type="smallBold" style={{ color: c.text }}>Вставить</ThemedText>
            </TouchableOpacity>
            {KEYS.map((k) => (
              <TouchableOpacity key={k.label} style={[styles.key, /↑|↓|←|→/.test(k.label) && { minWidth: 46 }]} onPress={() => sendKey(k.seq)}>
                <ThemedText type="smallBold" style={{ color: c.text, fontSize: /↑|↓|←|→/.test(k.label) ? 17 : 13 }}>{k.label}</ThemedText>
              </TouchableOpacity>
            ))}
            <View style={{ width: Spacing.two }} />
          </ScrollView>
          {/* Строка сообщения (как в Telegram): диктуй / прикрепляй / правь → стрелка вверх вставляет в терминал */}
          <View style={[styles.composeBar, { paddingBottom: kb ? 6 : insets.bottom + BottomTabInset - 6 }]}>
            <TouchableOpacity onPress={recording ? stopVoice : startVoice} style={[styles.composeBtn, { backgroundColor: recording ? c.danger : c.backgroundElement }]}>
              <SymbolView name={recording ? 'stop.fill' : 'mic.fill'} tintColor={recording ? '#fff' : c.text} size={20} />
            </TouchableOpacity>
            <TouchableOpacity onPress={attachToTerminal} style={[styles.composeBtn, { backgroundColor: c.backgroundElement }]}>
              <SymbolView name="paperclip" tintColor={c.text} size={19} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRecentPicker(true)} style={[styles.composeBtn, { backgroundColor: c.backgroundElement }]}>
              <SymbolView name="photo.stack.fill" tintColor={c.text} size={18} />
            </TouchableOpacity>
            <TextInput
              value={compose}
              onChangeText={setCompose}
              placeholder="Команда или сообщение…"
              placeholderTextColor={c.textSecondary}
              style={styles.composeInput}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={sendCompose} disabled={!compose.trim()} style={[styles.composeSend, { backgroundColor: compose.trim() ? c.accent : c.backgroundElement }]}>
              <SymbolView name="arrow.up" tintColor="#fff" size={20} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      ) : sub === 'screen' ? (
        <RemoteScreen
          ref={screenRef}
          send={send}
          screens={screens}
          activeScreen={activeScreen}
          onSwitch={switchScreen}
          bottomInset={kb ? 0 : insets.bottom + BottomTabInset - 16}
        />
      ) : sub === 'transfer' ? (
        <SyncPanel preferredDeviceId={deviceId} compact />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.pathBar}>
            {!tree.drives && (
              <TouchableOpacity onPress={goUp} hitSlop={10} style={styles.backBtn}>
                <SymbolView name="chevron.left" tintColor={c.accent} size={18} />
                <ThemedText type="small" style={{ color: c.accent }}>Назад</ThemedText>
              </TouchableOpacity>
            )}
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flex: 1, textAlign: tree.drives ? 'left' : 'center' }}>
              {tree.drives ? 'Этот компьютер' : (tree.path || '').split(/[\\/]/).filter(Boolean).pop() || tree.path}
            </ThemedText>
            <TouchableOpacity onPress={() => openDir('')}><ThemedText type="small" style={{ color: c.accent }}>Диски</ThemedText></TouchableOpacity>
          </View>
          {!tree.drives && (
            <TouchableOpacity style={styles.termHereBtn} onPress={openTerminalHere}>
              <SymbolView name="terminal.fill" tintColor={c.accent} size={16} />
              <ThemedText type="smallBold" style={{ color: c.accent }}>Открыть терминал здесь</ThemedText>
            </TouchableOpacity>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: BottomTabInset + Spacing.four }}>
            {tree.entries.length === 0 ? (
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', padding: Spacing.four }}>
                {online ? 'Пусто' : 'Нет связи с ПК'}
              </ThemedText>
            ) : (
              tree.entries.map((e) => (
                <View key={e.path} style={styles.treeRow}>
                  <TouchableOpacity style={styles.treeMain} onPress={() => openEntry(e)}>
                    <SymbolView name={e.dir ? 'folder.fill' : 'doc.text'} tintColor={e.dir ? c.accent : c.textSecondary} size={18} />
                    <ThemedText style={{ flex: 1 }} numberOfLines={1}>{e.name}</ThemedText>
                  </TouchableOpacity>
                  {e.dir ? (
                    <TouchableOpacity hitSlop={8} onPress={() => zipFolder(e.path)} style={styles.dlBtn}>
                      <SymbolView name="archivebox" tintColor={c.accent} size={18} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity hitSlop={8} onPress={() => downloadFile(e.path)} style={styles.dlBtn}>
                      <SymbolView name="square.and.arrow.down" tintColor={c.accent} size={18} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      )}

      <Modal visible={recentPicker} transparent animationType="fade" onRequestClose={() => setRecentPicker(false)}>
        <Pressable style={styles.recentBackdrop} onPress={() => setRecentPicker(false)}>
          <Pressable style={styles.recentSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.recentHandle} />
            <ThemedText style={styles.recentTitle}>Последние фото в терминал</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">На ПК сохранятся файлы, а их пути появятся в строке команды.</ThemedText>
            <View style={styles.recentGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <TouchableOpacity key={n} onPress={() => attachRecentPhotos(n)} style={[styles.recentCount, n === 1 && { backgroundColor: c.accent }]}>
                  <ThemedText style={{ color: n === 1 ? '#fff' : c.text, fontWeight: '700' }}>{n}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Выбор папки для нового терминала */}
      <Modal visible={picker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPicker(false)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={[styles.editHead, { paddingTop: Spacing.three }]}>
            <TouchableOpacity onPress={() => setPicker(false)}><ThemedText style={{ color: c.accent }}>Отмена</ThemedText></TouchableOpacity>
            <ThemedText type="smallBold" style={{ flex: 1, textAlign: 'center' }}>Где открыть терминал</ThemedText>
            <TouchableOpacity onPress={() => pickerOpenDir('')}><ThemedText style={{ color: c.accent }}>Диски</ThemedText></TouchableOpacity>
          </View>
          <View style={styles.pathBar}>
            {!pickerTree.drives && (
              <TouchableOpacity hitSlop={10} style={styles.backBtn} onPress={() => {
                if (/^[A-Za-z]:\\?$/.test(pickerTree.path)) pickerOpenDir('');
                else pickerOpenDir(pickerTree.parent != null ? pickerTree.parent : '');
              }}>
                <SymbolView name="chevron.left" tintColor={c.accent} size={18} />
                <ThemedText type="small" style={{ color: c.accent }}>Назад</ThemedText>
              </TouchableOpacity>
            )}
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
              {pickerTree.drives ? 'Этот компьютер' : pickerTree.path}
            </ThemedText>
          </View>
          {!pickerTree.drives && (
            <TouchableOpacity style={[styles.termHereBtn, { backgroundColor: c.accent }]} onPress={() => createTermIn(pickerTree.path)}>
              <SymbolView name="terminal.fill" tintColor="#fff" size={16} />
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Открыть терминал здесь</ThemedText>
            </TouchableOpacity>
          )}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Spacing.four }}>
            {pickerTree.entries.filter((e) => e.dir).length === 0 ? (
              <ThemedText themeColor="textSecondary" style={{ textAlign: 'center', padding: Spacing.four }}>Нет вложенных папок</ThemedText>
            ) : (
              pickerTree.entries.filter((e) => e.dir).map((e) => (
                <TouchableOpacity key={e.path} style={styles.treeRow} onPress={() => pickerOpenDir(e.path)}>
                  <View style={styles.treeMain}>
                    <SymbolView name="folder.fill" tintColor={c.accent} size={18} />
                    <ThemedText style={{ flex: 1 }} numberOfLines={1}>{e.name}</ThemedText>
                  </View>
                  <SymbolView name="chevron.right" tintColor={c.textSecondary} size={14} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </ThemedView>
      </Modal>

      {/* Редактор файла */}
      <Modal visible={!!file} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFile(null)}>
        <ThemedView style={{ flex: 1 }}>
          <View style={[styles.editHead, { paddingTop: Spacing.three }]}>
            <TouchableOpacity onPress={() => setFile(null)}><ThemedText style={{ color: c.accent }}>Закрыть</ThemedText></TouchableOpacity>
            <ThemedText type="smallBold" numberOfLines={1} style={{ flex: 1, textAlign: 'center', marginHorizontal: Spacing.two }}>
              {file ? file.path.split(/[\\/]/).pop() : ''}
            </ThemedText>
            {file?.editable ? (
              <TouchableOpacity onPress={saveFile} disabled={saving}>
                {saving ? <ActivityIndicator color={c.accent} /> : <ThemedText style={{ color: c.accent, fontWeight: '700' }}>Сохранить</ThemedText>}
              </TouchableOpacity>
            ) : <ThemedText type="small" themeColor="textSecondary">просмотр</ThemedText>}
          </View>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TextInput style={styles.editArea} value={draft} onChangeText={setDraft} editable={!!file?.editable} multiline autoCapitalize="none" autoCorrect={false} spellCheck={false} />
          </KeyboardAvoidingView>
        </ThemedView>
      </Modal>

      {/* Предпросмотр файла с ПК (картинка/PDF) прямо на телефоне, без отправки */}
      <Modal visible={!!preview} animationType="fade" onRequestClose={() => setPreview(null)} supportedOrientations={['portrait', 'landscape']}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={[styles.previewBar, { paddingTop: insets.top + 6 }]}>
            <ThemedText type="smallBold" style={{ color: '#fff', flex: 1 }} numberOfLines={1}>{preview?.name}</ThemedText>
            <TouchableOpacity onPress={() => { if (preview) downloadFile(preview.path); }} hitSlop={8} style={styles.previewBtn}>
              <SymbolView name="square.and.arrow.down" tintColor="#fff" size={18} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPreview(null)} hitSlop={8} style={styles.previewBtn}>
              <SymbolView name="xmark" tintColor="#fff" size={18} />
            </TouchableOpacity>
          </View>
          {preview?.mime === 'application/pdf' ? (
            <WebView
              originWhitelist={['*']}
              source={{ uri: `data:application/pdf;base64,${preview.data}` }}
              style={{ flex: 1, backgroundColor: '#000' }}
            />
          ) : preview ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
              maximumZoomScale={5}
              minimumZoomScale={1}
              centerContent>
              <Image
                source={{ uri: `data:${preview.mime};base64,${preview.data}` }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="contain"
              />
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </ThemedView>
  );
}

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.two },
  h1: { fontSize: 30, lineHeight: 36 },
  headerRight: { flex: 1, alignItems: 'flex-end', gap: 5 },
  agentShortcuts: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  agentShortcut: { minHeight: 30, paddingHorizontal: 9, borderRadius: Radius.sm, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusRow: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end' },
  devList: { marginHorizontal: Spacing.three, marginBottom: Spacing.two, borderRadius: Radius.md, backgroundColor: c.backgroundElement, overflow: 'hidden' },
  devRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
  dot: { width: 9, height: 9, borderRadius: 5 },
  seg: { marginHorizontal: Spacing.three, marginBottom: Spacing.two },
  toast: { textAlign: 'center', color: c.text, paddingVertical: 4 },
  termTabs: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: Spacing.three, marginBottom: Spacing.two },
  presetDot: { width: 7, height: 7, borderRadius: 2 },
  termTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.sm, backgroundColor: c.backgroundElement },
  termTabOn: { backgroundColor: c.accent },
  termTabPc: { borderWidth: 1, borderColor: c.success },
  termAdd: { width: 34, height: 30, borderRadius: Radius.sm, backgroundColor: c.backgroundElement, alignItems: 'center', justifyContent: 'center' },
  termWrap: { flex: 1, marginHorizontal: Spacing.three, borderRadius: Radius.md, overflow: 'hidden', backgroundColor: '#0a0b0d', borderWidth: 1, borderColor: c.glassBorder },
  keybar: { flexGrow: 0, paddingVertical: Spacing.two },
  key: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: Radius.sm, backgroundColor: c.backgroundSelected, minWidth: 40, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  composeBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  composeBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  composeInput: { flex: 1, minHeight: 42, maxHeight: 120, backgroundColor: c.backgroundElement, borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: 11, color: c.text, fontSize: 16 },
  composeSend: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, top: 0, left: 0 },
  pathBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  termHereBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, marginHorizontal: Spacing.three, marginBottom: Spacing.two, paddingVertical: Spacing.two, borderRadius: Radius.md, backgroundColor: c.backgroundElement },
  treeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingRight: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
  treeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three, paddingLeft: Spacing.three },
  dlBtn: { padding: Spacing.two },
  editHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  editArea: { flex: 1, fontFamily: mono, fontSize: 13, lineHeight: 19, color: c.text, padding: Spacing.three, textAlignVertical: 'top' },
  previewBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: 8, backgroundColor: 'rgba(0,0,0,0.6)' },
  previewBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  recentBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  recentSheet: { backgroundColor: c.backgroundElement, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, paddingBottom: Spacing.five, gap: Spacing.two },
  recentHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: c.separator, alignSelf: 'center', marginBottom: Spacing.two },
  recentTitle: { fontSize: 21, fontWeight: '700', lineHeight: 27 },
  recentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  recentCount: { width: '18%', aspectRatio: 1, borderRadius: Radius.md, backgroundColor: c.backgroundSelected, alignItems: 'center', justifyContent: 'center' },
});
