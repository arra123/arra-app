import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

// Известные бренды -> домен. Иконку берём по домену, поэтому это настоящий
// знак сервиса, а не сгенерированная буква на цветном фоне.
const DOMAINS: Record<string, string> = {
  'озон': 'ozon.ru', 'ozon': 'ozon.ru',
  'вайлдберриз': 'wildberries.ru', 'wildberries': 'wildberries.ru', 'вб': 'wildberries.ru',
  'яндекс еда': 'eda.yandex.ru', 'яндекс.еда': 'eda.yandex.ru', 'яндекс': 'yandex.ru',
  'самокат': 'samokat.ru', 'вкусвилл': 'vkusvill.ru',
  'пятёрочка': '5ka.ru', 'пятерочка': '5ka.ru', 'магнит': 'magnit.ru',
  'перекрёсток': 'perekrestok.ru', 'перекресток': 'perekrestok.ru', 'лента': 'lenta.com',
  'ашан': 'auchan.ru', 'metro': 'metro-cc.ru',
  'сбер': 'sberbank.ru', 'сбербанк': 'sberbank.ru', 'тинькофф': 'tinkoff.ru', 'т-банк': 'tbank.ru',
  'альфа': 'alfabank.ru', 'альфабанк': 'alfabank.ru', 'втб': 'vtb.ru',
  'мтс': 'mts.ru', 'билайн': 'beeline.ru', 'мегафон': 'megafon.ru', 'теле2': 'tele2.ru',
  'netflix': 'netflix.com', 'spotify': 'spotify.com', 'youtube': 'youtube.com',
  'apple': 'apple.com', 'icloud': 'apple.com', 'google': 'google.com',
  'openai': 'openai.com', 'open ai': 'openai.com', 'chatgpt': 'chatgpt.com', 'chat gpt': 'chatgpt.com', 'gpt': 'chatgpt.com', 'codex': 'openai.com',
  'anthropic': 'anthropic.com', 'claude': 'claude.ai', 'клод': 'claude.ai',
  'proxyapi': 'proxyapi.ru', 'proxy api': 'proxyapi.ru',
  'aliexpress': 'aliexpress.ru', 'али': 'aliexpress.ru',
  // каршеринги
  'белка': 'belkacar.ru', 'belkacar': 'belkacar.ru', 'белкакар': 'belkacar.ru',
  'ситидрайв': 'citydrive.ru', 'сити драйв': 'citydrive.ru', 'citydrive': 'citydrive.ru', 'city drive': 'citydrive.ru',
  'делимобиль': 'delimobil.ru', 'delimobil': 'delimobil.ru', 'дели': 'delimobil.ru',
  'яндекс драйв': 'drive.yandex.ru', 'яндекс.драйв': 'drive.yandex.ru', 'yandex drive': 'drive.yandex.ru', 'драйв': 'drive.yandex.ru',
  'kfc': 'kfc.ru', 'бургер кинг': 'burgerking.ru', 'burger king': 'burgerking.ru',
  'вкусно и точка': 'vkusnoitochka.ru', 'starbucks': 'starbucks.com', 'додо': 'dodopizza.ru',
  'delivery': 'delivery-club.ru', 'деливери': 'delivery-club.ru',
  'литрес': 'litres.ru', 'кинопоиск': 'kinopoisk.ru', 'okko': 'okko.tv', 'иви': 'ivi.ru',
  'steam': 'steampowered.com', 'ozon банк': 'ozon.ru',
};

// Спокойная палитра (Linear-стиль), без кислотных цветов
const PALETTE = ['#6E79E6', '#6F9AE8', '#69A5C8', '#E0A33E', '#E06C75', '#9A7BE0', '#5B8DEF', '#5FB8CF', '#C98AB8', '#8A8F98'];
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function domainFor(merchant: string) {
  const key = merchant.trim().toLowerCase();
  if (DOMAINS[key]) return DOMAINS[key];
  // частичное совпадение (например «озон банк» -> «озон»)
  for (const k of Object.keys(DOMAINS)) if (key.includes(k)) return DOMAINS[k];
  return null;
}

export function MerchantLogo({ merchant, size = 40 }: { merchant: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const domain = domainFor(merchant);
  const radius = size / 2; // круглые иконки, как в банках

  // Логотип берём из сервиса фавиконов Google (Clearbit закрыли в 2025).
  // Работает в РФ без ключа, отдаёт реальный логотип для крупных брендов.
  if (domain && !failed) {
    return (
      <View style={[styles.tile, { width: size, height: size, borderRadius: radius, backgroundColor: '#fff' }]}>
        <Image
          source={{ uri: `https://www.google.com/s2/favicons?domain=${domain}&sz=128` }}
          style={{ width: size * 0.86, height: size * 0.86 }}
          contentFit="contain"
          onError={() => setFailed(true)}
          transition={120}
        />
      </View>
    );
  }

  const color = colorFor(merchant);
  return (
    <View style={[styles.tile, { width: size, height: size, borderRadius: radius, backgroundColor: color }]}>
      <SymbolView name="building.2.fill" size={size * 0.48} tintColor="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
