import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SlidingSegment } from '@/components/sliding-segment';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
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
      <ScrollView
        contentContainerStyle={[styles.center, { paddingTop: insets.top }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        <View style={styles.brand}>
          <Image source={require('../../assets/images/noda-mark.png')} style={styles.mark} resizeMode="contain" />
          <ThemedText style={styles.logo}>Noda</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>Рабочее пространство на всех устройствах</ThemedText>
        </View>

        <View style={styles.card}>
          <SlidingSegment
            value={mode}
            onChange={(next) => { setError(null); setMode(next); }}
            options={[
              { value: 'login', label: 'Войти' },
              { value: 'register', label: 'Регистрация' },
            ]}
          />

          {mode === 'register' && (
            <TextInput
              placeholder="Имя (необязательно)"
              placeholderTextColor={theme.textSecondary}
              value={name}
              onChangeText={setName}
              style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
            />
          )}
          <TextInput
            placeholder="Логин"
            placeholderTextColor={theme.textSecondary}
            value={loginValue}
            onChangeText={setLoginValue}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />
          <TextInput
            placeholder="Пароль"
            placeholderTextColor={theme.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: theme.text, borderColor: theme.separator, backgroundColor: theme.backgroundElement }]}
          />

          {error && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          )}

          {busy ? (
            <View style={styles.button}><ActivityIndicator color="#171717" /></View>
          ) : (
            <TouchableOpacity activeOpacity={0.76} onPress={submit} style={styles.button}>
              <ThemedText type="smallBold" style={styles.buttonText}>{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.five, gap: Spacing.five },
  brand: { alignItems: 'center' },
  mark: { width: 46, height: 46, marginBottom: 12 },
  logo: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { textAlign: 'center' },
  card: { width: '100%', maxWidth: 420, gap: 12 },
  input: {
    height: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  button: { height: 50, marginTop: 2, borderRadius: 12, backgroundColor: '#ECECEC', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buttonText: { color: '#171717' },
});
