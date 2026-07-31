const fs = require('node:fs');
const path = require('node:path');
const { rcedit } = require('rcedit');

/**
 * Кладёт app-update.yml рядом с приложением.
 *
 * Обычно electron-builder создаёт его сам на этапе сборки установщика, но мы
 * собираем в два шага (--dir, затем --prepackaged, чтобы вшить иконку). При
 * такой схеме файл не появляется, и electron-updater на старте падает с ENOENT,
 * заваливая пользователя тостами «Не удалось проверить».
 */
function writeUpdateConfig(context) {
  const publish = [].concat(context.packager.config.publish || [])[0];
  if (!publish || publish.provider !== 'github') return;
  const lines = [
    'provider: github',
    `owner: ${publish.owner}`,
    `repo: ${publish.repo}`,
    `updaterCacheDirName: ${context.packager.appInfo.name}-updater`,
    '',
  ];
  fs.writeFileSync(path.join(context.appOutDir, 'resources', 'app-update.yml'), lines.join('\n'), 'utf8');
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  writeUpdateConfig(context);
  const exe = path.join(context.appOutDir, 'Noda.exe');
  const icon = path.join(context.packager.projectDir, 'icon.ico');
  const version = context.packager.appInfo.version;
  await rcedit(exe, {
    icon,
    'file-version': version,
    'product-version': version,
    'version-string': {
      ProductName: 'Noda',
      FileDescription: 'Noda — проекты между ноутбуком, сервером и ПК',
      CompanyName: 'Noda',
      InternalName: 'Noda',
      OriginalFilename: 'Noda.exe',
    },
  });
};
