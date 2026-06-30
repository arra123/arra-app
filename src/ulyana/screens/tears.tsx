import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { STK } from '../assets';
import { aiDiagnose, createCry, uploadCryMedia } from '../api';
import { U, UG, UR, US } from '../theme';
import { AudioPlayerBtn, Btn, Card, Chips, Gradient, MediaViewer, Slider, Sticker, Stepper, T, pop, tap, yay } from '../ui';
import { analyze, MOODS, REASONS, type Reason } from '../verdict';

type Media = { uri: string; name: string; kind: 'image' | 'video' | 'audio' };
type Result = ReturnType<typeof analyze>;

export function TearsScreen() {
  const insets = useSafeAreaInsets();

  const [intensity, setIntensity] = useState(5);
  const [reason, setReason] = useState<Reason | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [duration, setDuration] = useState(2);
  const [moodBefore, setMoodBefore] = useState<string | null>(null);
  const [moodAfter, setMoodAfter] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [media, setMedia] = useState<Media | null>(null);
  const [viewer, setViewer] = useState(false);

  const [result, setResult] = useState<Result | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [recording, setRecording] = useState(false);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const [recSecs, setRecSecs] = useState(0);

  useEffect(() => () => { if (recTimer.current) clearInterval(recTimer.current); }, []);

  // Причина в виде строки (для ИИ, сохранения и архива)
  const resolvedReason = reason === 'custom' ? (customReason.trim() || 'своё') : reason;

  async function pickMedia(fromCamera: boolean) {
    try {
      if (fromCamera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) return Alert.alert('Нужен доступ к камере');
      }
      const res = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.7, mediaTypes: ['images', 'videos'] })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ['images', 'videos'] });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      const kind = (a.type === 'video' ? 'video' : 'image') as Media['kind'];
      const ext = (a.mimeType || (kind === 'video' ? 'video/mp4' : 'image/jpeg')).split('/')[1];
      setMedia({ uri: a.uri, name: a.fileName || `cry_${Date.now()}.${ext}`, kind });
      tap();
    } catch (e: any) {
      Alert.alert('Не получилось', e?.message || '');
    }
  }

  async function toggleRecord() {
    if (recording) {
      if (recTimer.current) clearInterval(recTimer.current);
      setRecording(false);
      try { await recorder.stop(); } catch { /* ignore */ }
      // Возвращаем сессию в режим воспроизведения, чтобы прослушка шла через динамик
      try { await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }); } catch { /* ignore */ }
      const uri = recorder.uri;
      if (uri && recSecs >= 1) {
        setMedia({ uri, name: `cry_${Date.now()}.m4a`, kind: 'audio' });
        yay();
      } else {
        Alert.alert('Слишком коротко', 'Запиши хотя бы секунду рыданий 😢');
      }
      return;
    }
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return Alert.alert('Нужен доступ к микрофону');
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      pop();
      setRecSecs(0);
      setRecording(true);
      recTimer.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch (e: any) {
      setRecording(false);
      Alert.alert('Микрофон занят', e?.message || 'Не удалось начать запись');
    }
  }

  async function diagnose() {
    pop();
    // Мгновенный локальный диагноз, затем обогащаем через ИИ-Ульяну
    const local = analyze({ intensity, reason, duration });
    setResult(local);
    setAiLoading(true);
    try {
      const ai = await aiDiagnose({
        intensity,
        reason: resolvedReason,
        duration,
        note: note.trim() || null,
        mood_before: moodBefore,
        mood_after: moodAfter,
        score: local.score,
      });
      if (ai.verdict || ai.recommendation) {
        setResult({
          ...local,
          verdict: ai.verdict || local.verdict,
          recommendation: ai.recommendation || local.recommendation,
        });
      }
    } catch {
      /* ИИ недоступен — остаётся локальный диагноз */
    } finally {
      setAiLoading(false);
    }
  }

  async function save() {
    if (!result) return;
    setSaving(true);
    try {
      const cry = await createCry({
        intensity,
        reason: resolvedReason || 'none',
        duration_min: duration,
        mood_before: moodBefore,
        mood_after: moodAfter,
        score: result.score,
        verdict: result.verdict,
        recommendation: result.recommendation,
        note: note.trim() || null,
      });
      if (media) await uploadCryMedia(cry.id, media.uri, media.name);
      yay();
      reset();
    } catch (e: any) {
      Alert.alert('Не сохранилось', e?.message || '');
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setIntensity(5);
    setReason(null);
    setCustomReason('');
    setDuration(2);
    setMoodBefore(null);
    setMoodAfter(null);
    setNote('');
    setMedia(null);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: US.md, paddingTop: insets.top + US.sm, paddingBottom: 180, gap: US.md }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        {/* Шапка-герой */}
        <Gradient g={UG.tearHero} radius={UR.xl} style={styles.hero}>
          <Sticker src={STK.thermometer} size={56} />
          <View style={{ flex: 1 }}>
            <T kind="h1" color="#fff">Слёзометр 3000</T>
            <T kind="body" color="rgba(255,255,255,0.9)">Профессиональный анализ рыданий</T>
          </View>
        </Gradient>

        {/* Интенсивность */}
        <Card>
          <View style={styles.rowBetween}>
            <T kind="h3">Сила плача</T>
            <T kind="h2" color={U.blue}>{intensity}/10</T>
          </View>
          <View style={{ height: US.sm }} />
          <Slider value={intensity} min={1} max={10} onChange={setIntensity} tint={U.blue} />
          <T kind="tiny" color={U.textFaint} style={{ marginTop: 4 }}>
            {intensity <= 3 ? 'почти держался(ась)' : intensity <= 6 ? 'нормальные такие слёзки' : intensity <= 8 ? 'рыдания в голос' : 'затопил(а) район'}
          </T>
        </Card>

        {/* Причина */}
        <Card>
          <T kind="h3" style={{ marginBottom: US.sm }}>Причина потопа</T>
          <Chips options={REASONS} value={reason} onChange={setReason} />
          {reason === 'custom' && (
            <TextInput
              placeholder="опиши свою причину…"
              placeholderTextColor={U.textFaint}
              value={customReason}
              onChangeText={setCustomReason}
              style={[styles.input, styles.customInput]}
            />
          )}
        </Card>

        {/* Длительность */}
        <Card>
          <View style={styles.rowBetween}>
            <View style={styles.iconLabel}>
              <Sticker src={STK.droplet} size={26} />
              <T kind="h3">Длилось, мин</T>
            </View>
            <Stepper value={duration} onChange={setDuration} min={0} max={180} />
          </View>
        </Card>

        {/* Настроение */}
        <Card>
          <T kind="h3" style={{ marginBottom: US.sm }}>Настроение до</T>
          <Chips options={MOODS.map((m) => ({ value: m, label: m }))} value={moodBefore} onChange={setMoodBefore} />
          <View style={[styles.divider]} />
          <T kind="h3" style={{ marginBottom: US.sm }}>После</T>
          <Chips options={MOODS.map((m) => ({ value: m, label: m }))} value={moodAfter} onChange={setMoodAfter} />
        </Card>

        {/* Медиа */}
        <Card>
          <T kind="h3" style={{ marginBottom: US.sm }}>Вещдок (фото / видео / аудио)</T>
          <View style={styles.mediaRow}>
            <MediaBtn label="Камера" icon={STK.cry} onPress={() => pickMedia(true)} />
            <MediaBtn label="Галерея" icon={STK.sparkleHeart} onPress={() => pickMedia(false)} />
            <MediaBtn
              label={recording ? `Стоп · ${recSecs}с` : 'Рыдания'}
              icon={STK.sob}
              active={recording}
              onPress={toggleRecord}
            />
          </View>

          {/* Превью прикреплённого медиа */}
          {media?.kind === 'audio' && (
            <View style={styles.previewBox}>
              <AudioPlayerBtn uri={media.uri} tint={U.pink} />
            </View>
          )}
          {media?.kind === 'image' && (
            <Pressable onPress={() => { tap(); setViewer(true); }} style={styles.previewBox}>
              <Image source={media.uri} style={styles.previewImg} contentFit="cover" />
              <View style={styles.previewZoom}><Sticker src={STK.zoom} size={18} /></View>
            </Pressable>
          )}

          {media && (
            <View style={styles.mediaBadge}>
              <Sticker src={media.kind === 'audio' ? STK.sob : media.kind === 'video' ? STK.tv : STK.cry} size={22} />
              <T kind="tiny" color={U.text} style={{ flex: 1 }} numberOfLines={1}>
                Прикреплено: {media.kind === 'audio' ? 'аудио' : media.kind === 'video' ? 'видео' : 'фото'}
              </T>
              <Pressable onPress={() => { tap(); setMedia(null); }} hitSlop={10}>
                <T kind="label" color={U.danger}>убрать</T>
              </Pressable>
            </View>
          )}
        </Card>

        {/* Заметка */}
        <Card>
          <T kind="h3" style={{ marginBottom: US.sm }}>Что случилось</T>
          <TextInput
            placeholder="по желанию: пара слов о трагедии…"
            placeholderTextColor={U.textFaint}
            value={note}
            onChangeText={setNote}
            multiline
            style={styles.input}
          />
        </Card>

        <Btn label={aiLoading ? 'Ставлю диагноз…' : 'Поставить диагноз'} icon={STK.crystal} onPress={diagnose} g={UG.candy} disabled={aiLoading} />

        {/* Результат */}
        {result && (
          <Gradient g={UG.bubble} radius={UR.xl} style={styles.result}>
            <Sticker src={result.sticker} size={84} />
            <T kind="h1" color="#1B1030" style={{ textAlign: 'center' }}>{result.score}/100</T>
            <T kind="h3" color="#1B1030" style={{ textAlign: 'center' }}>{result.levelName}</T>
            {aiLoading ? (
              <View style={styles.aiThinking}>
                <ActivityIndicator color="#5A3E7A" />
                <T kind="tiny" color="#5A3E7A">Ульяна ставит диагноз…</T>
              </View>
            ) : (
              <T kind="body" color="#2A1247" style={{ textAlign: 'center' }}>{result.verdict}</T>
            )}
            <View style={styles.recBox}>
              <Sticker src={STK.sparkleHeart} size={22} />
              <T kind="body" color="#1B1030" style={{ flex: 1, fontWeight: '700' }}>{result.recommendation}</T>
            </View>
            <Btn label={saving ? 'Сохраняю…' : 'Сохранить в архив'} icon={STK.scroll} onPress={save} g={UG.pingA} disabled={saving || aiLoading} style={{ alignSelf: 'stretch' }} />
            <Pressable onPress={() => { tap(); setResult(null); }} hitSlop={10}>
              <T kind="label" color="#5A3E7A">переделать тест</T>
            </Pressable>
          </Gradient>
        )}
      </ScrollView>

      <MediaViewer visible={viewer} onClose={() => setViewer(false)} kind={media?.kind ?? null} uri={media?.uri ?? null} />
    </KeyboardAvoidingView>
  );
}

function MediaBtn({ label, icon, onPress, active }: { label: string; icon: string; onPress: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ flex: 1, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
      <View style={[styles.mediaBtn, active && { borderColor: U.danger, backgroundColor: 'rgba(255,92,122,0.16)' }]}>
        <Sticker src={icon} size={28} />
        <T kind="tiny" color={active ? U.danger : U.textDim}>{label}</T>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: US.md, padding: US.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconLabel: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: U.border, marginVertical: US.md },
  mediaRow: { flexDirection: 'row', gap: 8 },
  mediaBtn: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: US.md,
    borderRadius: UR.md,
    backgroundColor: U.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: U.border,
  },
  previewBox: {
    marginTop: US.sm,
    padding: US.sm,
    borderRadius: UR.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  previewImg: { width: '100%', height: 180, borderRadius: UR.sm },
  previewZoom: {
    position: 'absolute', right: US.sm + 6, bottom: US.sm + 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: UR.pill, padding: 6,
  },
  mediaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: US.sm,
    padding: US.sm,
    borderRadius: UR.md,
    backgroundColor: 'rgba(90,200,255,0.12)',
  },
  input: {
    minHeight: 60,
    color: U.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  customInput: {
    minHeight: 44,
    marginTop: US.sm,
    backgroundColor: U.card,
    borderColor: U.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: UR.md,
    paddingHorizontal: US.md,
    paddingVertical: US.sm,
  },
  result: { padding: US.lg, gap: US.sm, alignItems: 'center' },
  aiThinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  recBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: UR.md,
    padding: US.md,
    alignSelf: 'stretch',
  },
});
