import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Segmented } from '@/components/segmented';
import { AgentIcon, Press, T } from '@/components/ui';
import { Colors, Radius, Type } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { haptic } from '@/lib/haptics';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginValue, setLoginValue] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!loginValue.trim() || !password) {
      setError('Введи логин и пароль');
      haptic.warning();
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(loginValue.trim(), password);
      else await register(loginValue.trim(), password);
      haptic.success();
    } catch (e: any) {
      setError(e?.message || 'Что-то пошло не так');
      haptic.error();
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.brand}>
        <AgentIcon agent="ara" size={64} />
        <T v="largeTitle" weight="800">Arra</T>
        <T v="callout" color={Colors.textSecondary} style={{ textAlign: 'center' }}>
          Агенты на ноутбуке и ПК — у тебя в кармане
        </T>
      </Animated.View>

      <Animated.View entering={FadeIn.delay(150).duration(400)} style={styles.form}>
        <Segmented
          glass={false}
          value={mode}
          onChange={(v) => {
            setMode(v);
            setError(null);
          }}
          options={[{ value: 'login', label: 'Вход' }, { value: 'register', label: 'Регистрация' }]}
        />
        <TextInput
          value={loginValue}
          onChangeText={setLoginValue}
          placeholder="Логин"
          placeholderTextColor={Colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
          autoComplete="username"
          keyboardAppearance="dark"
          returnKeyType="next"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Пароль"
          placeholderTextColor={Colors.textTertiary}
          secureTextEntry
          textContentType={mode === 'login' ? 'password' : 'newPassword'}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          keyboardAppearance="dark"
          returnKeyType="go"
          onSubmitEditing={submit}
          style={styles.input}
        />
        {error ? <T v="footnote" color={Colors.danger}>{error}</T> : null}
        <Press onPress={submit} disabled={busy} feedback="press" style={styles.button} accessibilityRole="button" accessibilityLabel={mode === 'login' ? 'Войти' : 'Создать аккаунт'}>
          {busy ? <ActivityIndicator color={Colors.onAccent} /> : (
            <T v="headline" weight="700" color={Colors.onAccent}>{mode === 'login' ? 'Войти' : 'Создать аккаунт'}</T>
          )}
        </Press>
      </Animated.View>
      <View style={{ flex: 1 }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  brand: { alignItems: 'center', gap: 10, marginTop: '22%' },
  form: { marginTop: 36, gap: 12 },
  input: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.hairline,
    color: Colors.text,
    fontSize: Type.body,
    paddingHorizontal: 16,
    height: 50,
  },
  button: {
    marginTop: 6,
    height: 50,
    borderRadius: Radius.pill,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
