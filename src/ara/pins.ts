import { File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';

const FILE_NAME = 'pins.json';

/**
 * Закреплённые агенты — только на телефоне (pins.json в документах приложения).
 * Закреплённый агент стоит первым в своём устройстве.
 */
class PinStore {
  private keys: string[] = [];
  private loaded = false;
  private listeners = new Set<() => void>();

  private file() {
    return new File(Paths.document, FILE_NAME);
  }

  private load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const file = this.file();
      if (file.exists) this.keys = (JSON.parse(file.textSync()) as string[]).filter((k) => typeof k === 'string');
    } catch {
      this.keys = [];
    }
  }

  private save() {
    this.listeners.forEach((l) => l());
    try {
      const file = this.file();
      if (!file.exists) file.create();
      file.write(JSON.stringify(this.keys));
    } catch {
      /* не сохранилось — закрепление проживёт до перезапуска */
    }
  }

  subscribe = (listener: () => void) => {
    this.load();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getKeys = () => {
    this.load();
    return this.keys;
  };

  toggle(key: string) {
    this.load();
    this.keys = this.keys.includes(key) ? this.keys.filter((k) => k !== key) : [key, ...this.keys];
    this.save();
  }

  unpin(key: string) {
    if (!this.getKeys().includes(key)) return;
    this.keys = this.keys.filter((k) => k !== key);
    this.save();
  }
}

export const pins = new PinStore();

export function usePins() {
  return useSyncExternalStore(pins.subscribe, pins.getKeys);
}
