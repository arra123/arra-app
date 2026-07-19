const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');

class FakeUpdater extends EventEmitter {
  constructor() {
    super();
    this.installCalls = [];
  }

  async checkForUpdates() {
    this.emit('checking-for-update');
    this.emit('update-available', { version: '9.9.9' });
    this.emit('download-progress', { percent: 42, transferred: 420, total: 1000, bytesPerSecond: 1200 });
    queueMicrotask(() => this.emit('update-downloaded', { version: '9.9.9' }));
    return { updateInfo: { version: '9.9.9' } };
  }

  quitAndInstall(...args) {
    this.installCalls.push(args);
  }
}

async function main() {
  const fakeUpdater = new FakeUpdater();
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === 'electron') return { app: { isPackaged: true, getVersion: () => '1.0.0' } };
    if (request === 'electron-updater') return { autoUpdater: fakeUpdater };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const events = [];
    const { initUpdater, checkNow } = require('../updater');
    initUpdater(() => null, (_channel, payload) => events.push(payload));
    const result = await checkNow();
    assert.equal(result.ok, true);
    assert.equal(result.version, '9.9.9');
    await new Promise((resolve) => setTimeout(resolve, 1050));
    assert.deepEqual(fakeUpdater.installCalls, [[false, true]]);
    assert.ok(events.some((event) => event.state === 'checking'));
    assert.ok(events.some((event) => event.state === 'progress' && event.percent === 42));
    assert.ok(events.some((event) => event.state === 'installing' && event.version === '9.9.9'));
    process.stdout.write(JSON.stringify({ ok: true, events: events.map((event) => event.state) }) + '\n');
  } finally {
    Module._load = originalLoad;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
