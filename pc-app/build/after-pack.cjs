const path = require('node:path');
const { rcedit } = require('rcedit');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const exe = path.join(context.appOutDir, 'Noda.exe');
  const icon = path.join(context.packager.projectDir, 'icon.ico');
  const version = context.packager.appInfo.version;
  await rcedit(exe, {
    icon,
    'file-version': version,
    'product-version': version,
    'requested-execution-level': 'requireAdministrator',
    'version-string': {
      ProductName: 'Noda',
      FileDescription: 'Noda — проекты между ноутбуком, сервером и ПК',
      CompanyName: 'Noda',
      InternalName: 'Noda',
      OriginalFilename: 'Noda.exe',
    },
  });
};
