# Что потребуется для Live Activities Arra

Обновления приложения пока выпускаются через TestFlight. Live Activities (карточка с временем работы агента на экране блокировки и в Dynamic Island) отложены. Подготовленный код сохранен в `docs/future-live-activities`, в текущую сборку он не включен.

## Что уже есть

Есть доступ к сборкам и App Store Connect API. Этого хватает для текущего выпуска Arra в TestFlight. Ключ App Store Connect не является ключом Apple Push Notifications service (APNs).

## Что нужно получить

Можно попросить владельца аккаунта или администратора выполнить эти действия самостоятельно. Тебе не обязательно получать роль администратора или сообщать пароль Apple ID.

1. Открыть https://developer.apple.com/account/ и выбрать ту команду, которой принадлежит приложение Arra (`com.arratima.aura`).
2. Перейти в Certificates, Identifiers & Profiles → Keys → «+».
3. Создать ключ с включенным Apple Push Notifications service (APNs), подходящий для production приложения Arra. Если портал предлагает окружение и ограничения, включить production и доступ к bundle ID `com.arratima.aura`.
4. Скачать файл `AuthKey_XXXXXXXXXX.p8`. Он скачивается один раз. Записать Key ID ключа и Team ID команды (Membership details).
5. Передать разработчику Arra файл .p8, Key ID и Team ID приватным способом. Не выкладывать файл в общий журнал или Git.
6. Для виджета и Live Activity extension настроить App Groups и подпись расширения: группа `group.com.arratima.aura`, идентификатор расширения `com.arratima.aura.ExpoWidgetsTarget`, профили App Store для приложения и расширения с этой группой. Это сделает разработчик после получения доступа к Certificates, Identifiers & Profiles или владелец аккаунта.

Если раздел Keys недоступен, это ожидаемо для роли Developer: Apple указывает Account Holder или Admin для создания APNs ключа. Попроси человека, выдавшего доступ, создать ключ по списку выше. Если в Developer Portal вместо команды показывается «Join the Apple Developer Program», отправь владельцу аккаунта скриншот этой страницы и попроси проверить доступ именно к Developer Portal, а не только App Store Connect.

## Готовый текст владельцу аккаунта

```
Для Arra (bundle ID com.arratima.aura) нужен ключ APNs для фонового обновления Live Activities. Пожалуйста, создайте в Apple Developer → Certificates, Identifiers & Profiles → Keys ключ с Apple Push Notifications service и доступом к production Arra. Передайте приватно скачанный .p8, Key ID и Team ID. Также нужен доступ к Certificates, Identifiers & Profiles для App Groups и подписи WidgetKit extension, либо ваша помощь с созданием группы group.com.arratima.aura и профилей приложения/расширения com.arratima.aura.ExpoWidgetsTarget. Пароль Apple ID не нужен.
```

Официальные инструкции Apple:
- https://developer.apple.com/help/account/keys/create-a-private-key
- https://developer.apple.com/help/account/capabilities/communicate-with-apns-using-authentication-tokens
- https://developer.apple.com/help/account/access/roles

## Быстрый голосовой вход без виджета

Команда iPhone: «Открыть URL» → `arra://ask?voice=1`. После открытия Arra запускает диктовку. Для кнопки действия выбрать эту команду в Настройки → Кнопка действия → Команда. Системная кнопка действия запускается удержанием; для одного нажатия можно добавить саму команду на домашний экран. Закончить диктовку и отправить сообщение нужно кнопкой в Arra.
