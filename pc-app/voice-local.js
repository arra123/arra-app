const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const { spawn } = require('child_process');

const MODEL_NAME = 'ggml-small-q5_1.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_NAME}?download=true`;
const MODEL_BYTES = 190085487;
const MODEL_SHA256 = 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb';
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

function createLocalWhisper({ app, send, writeLog = () => {} }) {
  let preparePromise = null;
  let activeTranscription = null;

  const engineDir = () => app.isPackaged
    ? path.join(process.resourcesPath, 'whisper', 'Release')
    : path.join(__dirname, 'vendor', 'whisper', 'Release');
  const executable = () => path.join(engineDir(), 'whisper-cli.exe');
  const modelDir = () => path.join(app.getPath('userData'), 'models', 'whisper');
  const modelPath = () => path.join(modelDir(), MODEL_NAME);

  function modelReady() {
    try { return fs.statSync(modelPath()).size === MODEL_BYTES; }
    catch { return false; }
  }

  function emit(payload) {
    try { send('voice-model-progress', payload); } catch {}
  }

  function status() {
    let modelBytes = 0;
    try { modelBytes = fs.statSync(modelPath()).size; } catch {}
    return {
      ok: true,
      ready: fs.existsSync(executable()) && modelBytes === MODEL_BYTES,
      engineReady: fs.existsSync(executable()),
      modelReady: modelBytes === MODEL_BYTES,
      modelBytes,
      expectedBytes: MODEL_BYTES,
      model: 'Whisper small-q5_1',
    };
  }

  function request(url, redirects = 0) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, {
        headers: { 'User-Agent': `Noda/${app.getVersion()} local-whisper` },
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirects >= 8) return reject(new Error('Слишком много перенаправлений при загрузке модели'));
          return resolve(request(new URL(res.headers.location, url).toString(), redirects + 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Не удалось загрузить модель: HTTP ${res.statusCode}`));
        }
        resolve(res);
      });
      req.setTimeout(45000, () => req.destroy(new Error('Тайм-аут загрузки модели')));
      req.on('error', reject);
    });
  }

  async function downloadModel() {
    if (!fs.existsSync(executable())) throw new Error('Локальный движок Whisper не найден в сборке Noda');
    fs.mkdirSync(modelDir(), { recursive: true });
    if (modelReady()) return status();

    const target = modelPath();
    const temporary = `${target}.download`;
    try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
    emit({ phase: 'downloading', percent: 0, downloaded: 0, total: MODEL_BYTES });
    const response = await request(MODEL_URL);
    const hash = crypto.createHash('sha256');
    let downloaded = 0;
    let lastPercent = -1;

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(temporary, { flags: 'wx' });
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        hash.update(chunk);
        const percent = Math.min(100, Math.floor((downloaded / MODEL_BYTES) * 100));
        if (percent !== lastPercent) {
          lastPercent = percent;
          emit({ phase: 'downloading', percent, downloaded, total: MODEL_BYTES });
        }
      });
      response.on('error', reject);
      output.on('error', reject);
      output.on('finish', resolve);
      response.pipe(output);
    });

    const digest = hash.digest('hex');
    if (downloaded !== MODEL_BYTES || digest !== MODEL_SHA256) {
      try { fs.unlinkSync(temporary); } catch {}
      throw new Error('Модель Whisper скачалась не полностью или не прошла проверку');
    }
    try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch {}
    fs.renameSync(temporary, target);
    emit({ phase: 'ready', percent: 100, downloaded, total: MODEL_BYTES });
    writeLog('info', 'voice.local-model-ready', { model: MODEL_NAME, bytes: downloaded, sha256: digest });
    return status();
  }

  function prepare() {
    if (!preparePromise) {
      preparePromise = downloadModel()
        .catch((error) => {
          emit({ phase: 'error', message: error.message });
          writeLog('error', 'voice.local-model', error);
          throw error;
        })
        .finally(() => { preparePromise = null; });
    }
    return preparePromise;
  }

  async function transcribe(base64) {
    if (!modelReady()) return { ok: false, needsModel: true, error: 'Сначала загрузится локальная модель Whisper' };
    if (!fs.existsSync(executable())) return { ok: false, error: 'Локальный движок Whisper не найден' };
    if (activeTranscription) return { ok: false, busy: true, error: 'Предыдущий фрагмент ещё распознаётся' };

    const audio = Buffer.from(String(base64 || ''), 'base64');
    if (!audio.length || audio.length > MAX_AUDIO_BYTES) return { ok: false, error: 'Некорректный аудиофрагмент' };
    const wav = path.join(os.tmpdir(), `noda-whisper-${process.pid}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.wav`);
    fs.writeFileSync(wav, audio);

    const threads = Math.max(2, Math.min(8, (os.cpus() || []).length - 1 || 2));
    const args = ['-m', modelPath(), '-f', wav, '-l', 'ru', '-nt', '-np', '-t', String(threads), '--no-gpu'];
    const started = Date.now();
    activeTranscription = new Promise((resolve) => {
      const child = spawn(executable(), args, {
        cwd: engineDir(),
        windowsHide: true,
        env: { ...process.env, PATH: `${engineDir()};${process.env.PATH || ''}` },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const timer = setTimeout(() => {
        try { child.kill(); } catch {}
        finish({ ok: false, error: 'Whisper слишком долго распознаёт фрагмент' });
      }, 90000);
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('error', (error) => finish({ ok: false, error: error.message }));
      child.on('close', (code) => {
        clearTimeout(timer);
        const text = stdout
          .replace(/\x1b\[[0-9;]*m/g, '')
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*\[[\d:.\s-]+\]\s*/, '').trim())
          .filter((line) => line && !/^whisper_/i.test(line))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (code === 0) finish({ ok: true, text });
        else finish({ ok: false, error: (stderr || stdout || `Whisper завершился с кодом ${code}`).trim().slice(-700) });
      });
    });

    try {
      const result = await activeTranscription;
      writeLog(result.ok ? 'info' : 'error', 'voice.local-transcribe', {
        ok: result.ok,
        durationMs: Date.now() - started,
        chars: result.text?.length || 0,
        error: result.error,
      });
      return result;
    } finally {
      activeTranscription = null;
      try { fs.unlinkSync(wav); } catch {}
    }
  }

  return { status, prepare, transcribe };
}

module.exports = { createLocalWhisper, MODEL_NAME, MODEL_BYTES, MODEL_SHA256 };
