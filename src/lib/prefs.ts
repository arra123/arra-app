import * as SecureStore from 'expo-secure-store';

/**
 * Мелкие пользовательские предпочтения, которые должны пережить перезапуск.
 * AsyncStorage в проекте нет — держим в SecureStore, он уже есть в зависимостях.
 */

const memory = new Map<string, string>();

async function read(key: string): Promise<string | null> {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    const value = await SecureStore.getItemAsync(key);
    if (value != null) memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

async function write(key: string, value: string) {
  memory.set(key, value);
  try { await SecureStore.setItemAsync(key, value); } catch { /* нет хранилища — живём в памяти */ }
}

const CAR_SERVICE = 'noda_last_car_service';

export const loadLastCarService = () => read(CAR_SERVICE);
export const saveLastCarService = (service: string) => write(CAR_SERVICE, service);

const ASSISTANT_THREAD = 'noda_last_thread';

export const loadLastThread = () => read(ASSISTANT_THREAD);
export const saveLastThread = (id: string) => write(ASSISTANT_THREAD, id);
