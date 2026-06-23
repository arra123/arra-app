import { GlassView } from 'expo-glass-effect';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCard } from '@/components/glass-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';

export function AuthScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!loginValue.trim() || !password) {
      setError('Введи логин и пароль');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Логин передаём в поле email бэкенда (как уникальный идентификатор)
      if (mode === 'login') await login(loginValue.trim(), password);
      else await register(loginValue.trim(), password, name.trim() || undefined);
    } catch (e: any) {
      setError(e?.message || 'Что-то пошло не так');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.center, { paddingTop: insets.top }]}>
        <GlassCard radius={Radius.xl} style={styles.card}>
          {/* Переключатель Войти / Регистрация */}
          <View style={[styles.segment, { backgroundColor: theme.backgroundSelected }]}>
            {(['register', 'login'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                activeOpacity={0.9}
                onPress={() => {
                  setError(null);
                  setMode(m);
                }}
                style={[styles.segmentBtn, mode === m && { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="smallBold" themeColor={mode === m ? 'text' : 'textSecondary'}>
                  {m === 'register' ? 'Создать аккаунт' : 'Войти'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {mode === 'register' && (
            <TextInput
              placeholder="Имя (необязательно)"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
            />
          )}
          <TextInput
            placeholder="Логин"
            placeholderTextColor={theme.textSecondary}
            value={loginValue}
            onChangeText={setLoginValue}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
          />
          <TextInput
            placeholder="Пароль"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.separator }]}
          />

          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}

          <TouchableOpacity activeOpacity={0.85} onPress={submit} disabled={busy}>
            <GlassView isInteractive tintColor={theme.tint} style={[styles.button, { borderRadius: Radius.pill }]}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.buttonText}>
                  {mode === 'login' ? 'Войти' : 'Создать аккаунт'}
                </ThemedText>
              )}
            </GlassView>
          </TouchableOpacity>
        </GlassCard>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: Spacing.four, gap: Spacing.four },
  logoWrap: { alignItems: 'center', gap: Spacing.two },
  logoBadge: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  logoBadgeText: { color: '#fff', fontSize: 40, fontWeight: '800' },
  logo: { fontSize: 40, fontWeight: '700', marginTop: Spacing.one },
  subtitle: { textAlign: 'center' },
  card: { padding: Spacing.four, gap: Spacing.three },
  segment: { flexDirection: 'row', borderRadius: Radius.md, padding: 4, gap: 4 },
  segmentBtn: { flex: 1, alignItems: 'center', paddingVertical: Spacing.two, borderRadius: Radius.sm },
  input: {
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: { height: 54, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  hint: { textAlign: 'center' },
});
