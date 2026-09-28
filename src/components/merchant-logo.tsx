import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';

type SymbolName = ComponentProps<typeof SymbolView>['name'];

/**
 * Тот же локальный каталог логотипов, который использует сайт.
 *
 * Статические require намеренные: Metro кладёт все изображения в iOS bundle,
 * поэтому финансы не зависят от Google Favicons и работают без сети.
 */
const BRAND_IMAGES = {
  adobe: require('../assets/merchants/adobe.png'),
  aeroflot: require('../assets/merchants/aeroflot.png'),
  alfa: require('../assets/merchants/alfa.png'),
  aliexpress: require('../assets/merchants/aliexpress.png'),
  anthropic: require('../assets/merchants/anthropic.png'),
  apple: require('../assets/merchants/apple.png'),
  apteka: require('../assets/merchants/apteka.png'),
  auchan: require('../assets/merchants/auchan.png'),
  avito: require('../assets/merchants/avito.png'),
  beeline: require('../assets/merchants/beeline.png'),
  belkacar: require('../assets/merchants/belkacar.png'),
  burgerking: require('../assets/merchants/burgerking.png'),
  citilink: require('../assets/merchants/citilink.png'),
  citydrive: require('../assets/merchants/citydrive.png'),
  citymobil: require('../assets/merchants/citymobil.png'),
  cloudflare: require('../assets/merchants/cloudflare.png'),
  decathlon: require('../assets/merchants/decathlon.png'),
  delimobil: require('../assets/merchants/delimobil.png'),
  deliveryclub: require('../assets/merchants/deliveryclub.png'),
  dns: require('../assets/merchants/dns.png'),
  dodo: require('../assets/merchants/dodo.png'),
  eapteka: require('../assets/merchants/eapteka.png'),
  eldorado: require('../assets/merchants/eldorado.png'),
  figma: require('../assets/merchants/figma.png'),
  gazprombank: require('../assets/merchants/gazprombank.png'),
  gazpromneft: require('../assets/merchants/gazpromneft.png'),
  gemotest: require('../assets/merchants/gemotest.png'),
  github: require('../assets/merchants/github.png'),
  globus: require('../assets/merchants/globus.png'),
  google: require('../assets/merchants/google.png'),
  hoff: require('../assets/merchants/hoff.png'),
  ikea: require('../assets/merchants/ikea.png'),
  invitro: require('../assets/merchants/invitro.png'),
  ivi: require('../assets/merchants/ivi.png'),
  jetbrains: require('../assets/merchants/jetbrains.png'),
  kfc: require('../assets/merchants/kfc.png'),
  kinopoisk: require('../assets/merchants/kinopoisk.png'),
  lamoda: require('../assets/merchants/lamoda.png'),
  lenta: require('../assets/merchants/lenta.png'),
  leroymerlin: require('../assets/merchants/leroymerlin.png'),
  litres: require('../assets/merchants/litres.png'),
  magnit: require('../assets/merchants/magnit.png'),
  megafon: require('../assets/merchants/megafon.png'),
  metro: require('../assets/merchants/metro.png'),
  mts: require('../assets/merchants/mts.png'),
  mvideo: require('../assets/merchants/mvideo.png'),
  netflix: require('../assets/merchants/netflix.png'),
  notion: require('../assets/merchants/notion.png'),
  obi: require('../assets/merchants/obi.png'),
  okey: require('../assets/merchants/okey.png'),
  okko: require('../assets/merchants/okko.png'),
  openai: require('../assets/merchants/openai.png'),
  ozon: require('../assets/merchants/ozon.png'),
  ozonbank: require('../assets/merchants/ozonbank.png'),
  perekrestok: require('../assets/merchants/perekrestok.png'),
  pobeda: require('../assets/merchants/pobeda.png'),
  proxyapi: require('../assets/merchants/proxyapi.png'),
  pyaterochka: require('../assets/merchants/pyaterochka.png'),
  raiffeisen: require('../assets/merchants/raiffeisen.png'),
  regru: require('../assets/merchants/regru.png'),
  s7: require('../assets/merchants/s7.png'),
  samokat: require('../assets/merchants/samokat.png'),
  sber: require('../assets/merchants/sber.png'),
  sportmaster: require('../assets/merchants/sportmaster.png'),
  spotify: require('../assets/merchants/spotify.png'),
  starbucks: require('../assets/merchants/starbucks.png'),
  steam: require('../assets/merchants/steam.png'),
  tatneft: require('../assets/merchants/tatneft.png'),
  tbank: require('../assets/merchants/tbank.png'),
  tele2: require('../assets/merchants/tele2.png'),
  telegram: require('../assets/merchants/telegram.png'),
  timeweb: require('../assets/merchants/timeweb.png'),
  tutu: require('../assets/merchants/tutu.png'),
  vk: require('../assets/merchants/vk.png'),
  vkusnotochka: require('../assets/merchants/vkusnotochka.png'),
  vkusvill: require('../assets/merchants/vkusvill.png'),
  vseinstrumenti: require('../assets/merchants/vseinstrumenti.png'),
  wildberries: require('../assets/merchants/wildberries.png'),
  yandex: require('../assets/merchants/yandex.png'),
  yandexdrive: require('../assets/merchants/yandexdrive.png'),
  yandexeda: require('../assets/merchants/yandexeda.png'),
  yandexlavka: require('../assets/merchants/yandexlavka.png'),
  yandexmarket: require('../assets/merchants/yandexmarket.png'),
  yandextaxi: require('../assets/merchants/yandextaxi.png'),
  yota: require('../assets/merchants/yota.png'),
  youtube: require('../assets/merchants/youtube.png'),
  zdravcity: require('../assets/merchants/zdravcity.png'),
} as const;

type BrandKey = keyof typeof BRAND_IMAGES;

const BRAND_RULES: [BrandKey, string[]][] = [
  ['belkacar', ['belkacar', 'белкакар', 'белка']],
  ['citydrive', ['city drive', 'citydrive', 'сити драйв', 'ситидрайв']],
  ['delimobil', ['delimobil', 'делимобиль', 'делимобил', 'дели']],
  ['yandexdrive', ['яндекс.драйв', 'яндекс драйв', 'yandex drive']],
  ['citymobil', ['ситимобил']],
  ['yandextaxi', ['яндекс такси']],
  ['yandexeda', ['яндекс.еда', 'яндекс еда']],
  ['yandexlavka', ['яндекс лавка', 'лавка']],
  ['samokat', ['самокат']],
  ['deliveryclub', ['delivery club', 'delivery', 'деливери']],
  ['burgerking', ['burger king', 'бургер кинг']],
  ['vkusnotochka', ['вкусно и точка', 'вкусно — и точка']],
  ['starbucks', ['starbucks', 'старбакс']],
  ['dodo', ['додо', 'dodo']],
  ['kfc', ['kfc', 'кфс']],
  ['vkusvill', ['вкусвилл']],
  ['pyaterochka', ['пятёрочка', 'пятерочка', '5ka']],
  ['perekrestok', ['перекрёсток', 'перекресток']],
  ['magnit', ['магнит']],
  ['lenta', ['лента']],
  ['auchan', ['ашан']],
  ['metro', ['metro', 'метро кэш']],
  ['okey', ['окей']],
  ['globus', ['глобус']],
  ['ozonbank', ['озон банк', 'ozon bank']],
  ['ozon', ['ozon', 'озон']],
  ['wildberries', ['wildberries', 'вайлдберриз', 'вб ']],
  ['aliexpress', ['aliexpress', 'алиэкспресс']],
  ['yandexmarket', ['яндекс маркет']],
  ['avito', ['avito', 'авито']],
  ['dns', ['dns', 'днс']],
  ['mvideo', ['м.видео', 'мвидео']],
  ['citilink', ['citilink', 'ситилинк']],
  ['eldorado', ['эльдорадо']],
  ['lamoda', ['lamoda', 'ламода']],
  ['sber', ['сбербанк', 'сбер']],
  ['tbank', ['тинькофф', 'т-банк', 'тбанк', 't-bank', 'tbank']],
  ['alfa', ['альфабанк', 'альфа']],
  ['vtb' as BrandKey, ['втб']],
  ['gazprombank', ['газпромбанк']],
  ['raiffeisen', ['райффайзен', 'райф']],
  ['mts', ['mts', 'мтс']],
  ['beeline', ['beeline', 'билайн']],
  ['megafon', ['megafon', 'мегафон']],
  ['tele2', ['tele2', 'теле2', 'т2']],
  ['yota', ['yota', 'йота']],
  ['openai', ['chat gpt', 'chatgpt', 'openai', 'опенаи']],
  ['anthropic', ['anthropic', 'claude', 'клод']],
  ['proxyapi', ['proxyapi', 'прокси апи']],
  ['google', ['google', 'гугл']],
  ['apple', ['icloud', 'apple', 'айклауд', 'эпл']],
  ['microsoft' as BrandKey, ['microsoft', 'office', 'майкрософт']],
  ['github', ['github', 'гитхаб']],
  ['notion', ['notion', 'ноушен', 'ноушн']],
  ['figma', ['figma', 'фигма']],
  ['adobe', ['adobe', 'адоб']],
  ['jetbrains', ['jetbrains', 'джетбрейнс']],
  ['spotify', ['spotify', 'спотифай']],
  ['youtube', ['youtube', 'ютуб']],
  ['netflix', ['netflix', 'нетфликс']],
  ['kinopoisk', ['кинопоиск']],
  ['okko', ['okko', 'окко']],
  ['ivi', ['ivi', 'иви']],
  ['litres', ['litres', 'литрес']],
  ['steam', ['steam', 'стим']],
  ['telegram', ['telegram', 'телеграм']],
  ['vk', ['вконтакте', ' vk ']],
  ['cloudflare', ['cloudflare']],
  ['timeweb', ['timeweb', 'таймвеб']],
  ['regru', ['reg.ru', 'регру']],
  ['gazpromneft', ['газпром нефть', 'газпромнефть']],
  ['tatneft', ['татнефть']],
  ['aeroflot', ['аэрофлот']],
  ['pobeda', ['победа']],
  ['s7', [' s7 ', 'эс севен']],
  ['tutu', ['tutu', 'туту']],
  ['eapteka', ['еаптека']],
  ['zdravcity', ['здравсити']],
  ['invitro', ['инвитро']],
  ['gemotest', ['гемотест']],
  ['apteka', ['аптека']],
  ['sportmaster', ['спортмастер']],
  ['decathlon', ['декатлон']],
  ['ikea', ['ikea', 'икеа']],
  ['leroymerlin', ['leroy', 'леруа']],
  ['obi', [' obi ', 'оби ']],
  ['hoff', ['hoff', 'хофф']],
  ['vseinstrumenti', ['всеинструменты']],
];

const CATEGORY_RULES: { pattern: RegExp; symbol: SymbolName; color: string }[] = [
  { pattern: /каршер|аренд.*авто|прокат.*авто/i, symbol: 'car.fill', color: '#5B8DEF' },
  { pattern: /такси/i, symbol: 'car.side.fill', color: '#E0B33E' },
  { pattern: /бензин|топлив|азс|заправ/i, symbol: 'fuelpump.fill', color: '#E06C75' },
  { pattern: /бад|витамин|добавк|коллаген|омега/i, symbol: 'pill.fill', color: '#4CB7A5' },
  { pattern: /аптек|лекарств|таблет|врач|анализ/i, symbol: 'cross.case.fill', color: '#4CB7A5' },
  { pattern: /ингредиент|сироп|бариста|напит/i, symbol: 'waterbottle.fill', color: '#C98AB8' },
  { pattern: /печат|фотограф|полиграф|типограф/i, symbol: 'printer.fill', color: '#5E5CE6' },
  { pattern: /курьер|достав|отправ|посылк/i, symbol: 'shippingbox.fill', color: '#E0A33E' },
  { pattern: /продукт|магазин|супермаркет/i, symbol: 'cart.fill', color: '#4CB782' },
  { pattern: /кафе|ресторан|обед|ужин|завтрак|кофе/i, symbol: 'fork.knife', color: '#E08A3E' },
  { pattern: /подписк|тариф|облак|хостинг|домен|сервер/i, symbol: 'display', color: '#6E79E6' },
  { pattern: /зон|карт|локац|адрес|баланс/i, symbol: 'mappin.and.ellipse', color: '#5FB8CF' },
  { pattern: /реклам|таргет|продвиж/i, symbol: 'megaphone.fill', color: '#E06C75' },
  { pattern: /подар|цвет/i, symbol: 'gift.fill', color: '#C98AB8' },
  { pattern: /связь|интернет|мобильн/i, symbol: 'wifi', color: '#5B8DEF' },
  { pattern: /одежд|обув/i, symbol: 'tshirt.fill', color: '#9A7BE0' },
  { pattern: /техник|ноутбук|телефон|компьютер/i, symbol: 'laptopcomputer', color: '#7C8AA0' },
];

const PALETTE = ['#6E79E6', '#4CB782', '#4CB7A5', '#E0A33E', '#E06C75', '#9A7BE0', '#5B8DEF', '#5FB8CF', '#C98AB8', '#8A8F98'];

function colorFor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function brandsFor(text: string) {
  const normalized = ` ${text.trim().toLowerCase()} `;
  return BRAND_RULES.filter(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))
    .map(([brand]) => brand)
    .filter((brand, index, brands) => brands.indexOf(brand) === index)
    .filter((brand) => brand in BRAND_IMAGES)
    .slice(0, 3);
}

function BrandImage({ brand, size }: { brand: BrandKey; size: number }) {
  return (
    <View style={[styles.imageTile, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={BRAND_IMAGES[brand]} style={{ width: size * 0.88, height: size * 0.88 }} contentFit="contain" />
    </View>
  );
}

export function MerchantLogo({ merchant, size = 40 }: { merchant: string; size?: number }) {
  const brands = brandsFor(merchant);

  if (brands.length === 1) {
    return <BrandImage brand={brands[0]} size={size} />;
  }

  if (brands.length > 1) {
    const miniSize = size * 0.7;
    return (
      <View style={[styles.stack, { width: size, height: size }]}>
        {brands.map((brand, index) => (
          <View
            key={brand}
            style={{
              position: 'absolute',
              left: index === 0 ? 0 : size - miniSize,
              top: index === 2 ? size - miniSize : index * (size - miniSize) * 0.45,
              zIndex: brands.length - index,
            }}>
            <BrandImage brand={brand} size={miniSize} />
          </View>
        ))}
      </View>
    );
  }

  const category = CATEGORY_RULES.find(({ pattern }) => pattern.test(merchant));
  if (category) {
    return (
      <View style={[styles.symbolTile, { width: size, height: size, borderRadius: size / 2, backgroundColor: category.color }]}>
        <SymbolView name={category.symbol} tintColor="#FFFFFF" size={size * 0.5} weight="semibold" />
      </View>
    );
  }

  const color = colorFor(merchant);
  return (
    <View style={[styles.symbolTile, { width: size, height: size, borderRadius: size / 2, backgroundColor: color }]}>
      <ThemedText style={{ color: '#FFFFFF', fontWeight: '700', fontSize: size * 0.42 }}>
        {merchant.trim()[0]?.toUpperCase() || '?'}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  imageTile: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(60,60,67,0.10)',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stack: {
    position: 'relative',
  },
  symbolTile: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
