// Диктовка: панель записи с живой волной, распознавание через сервер.
// Видно, что микрофон слышит голос — столбики двигаются, а тишина подсвечивается предупреждением.

import { $, api, esc, toast } from "./core.js";
import { sheet } from "./ui.js";

/** Микрофон — частая точка отказа, поэтому объясняем подробно, а не тостом на две секунды. */
function micProblem(title, steps) {
  sheet({
    title,
    left: "",
    body: `<ol style="display:grid;gap:10px;margin:6px 0 0;padding-left:20px;color:var(--label-2);font-size:15px;line-height:1.5">
        ${steps.map((step) => `<li>${step}</li>`).join("")}
      </ol>
      <div class="sheet-actions"><button class="btn primary big" data-close>Понятно</button></div>`,
  });
}

let session = null;

/**
 * Показывает панель записи. Возвращает промис с распознанным текстом ("" — отменили).
 * onStage — колбэк со стадиями: recording | transcribing.
 */
export function dictate({ hint = "Говори — например: «Ситидрайв 1 200 за каршеринг»", onStage } = {}) {
  if (session) return session.promise;

  const panel = document.createElement("div");
  panel.className = "voice-panel";
  panel.innerHTML = `
    <canvas class="voice-wave" width="640" height="72"></canvas>
    <div class="voice-body">
      <div class="voice-title"><span class="voice-dot"></span><strong id="voiceTitle">Слушаю…</strong><span class="voice-timer" id="voiceTimer">0:00</span></div>
      <p class="voice-hint" id="voiceHint">${hint}</p>
    </div>
    <div class="voice-actions">
      <button id="voiceCancel" type="button">Отмена</button>
      <button class="accent" id="voiceStop" type="button">Готово</button>
    </div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => panel.classList.add("open"));

  let resolveOuter;
  const promise = new Promise((resolve) => { resolveOuter = resolve; });
  session = { promise };

  let stream;
  let recorder;
  let audioContext;
  let frame;
  let cancelled = false;
  let startedAt = Date.now();
  let heardVoice = false;
  const chunks = [];

  const finish = (value) => {
    panel.classList.remove("open");
    setTimeout(() => panel.remove(), 180);
    session = null;
    resolveOuter(value);
  };

  const cleanup = () => {
    cancelAnimationFrame(frame);
    stream?.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => {});
  };

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      finish("");
      micProblem("Браузер не пускает к микрофону", [
        "Страница должна быть открыта по https — проверь адрес.",
        "В режиме инкогнито и в старых браузерах запись недоступна.",
      ]);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      finish("");
      const guide = {
        NotAllowedError: ["Нажми на замок слева в адресной строке.", "Найди «Микрофон» и поставь «Разрешить».", "Обнови страницу и нажми микрофон снова."],
        NotFoundError: ["Проверь, что микрофон подключён.", "Windows: Параметры → Система → Звук → Ввод — выбери устройство.", "Вернись и нажми микрофон снова."],
        NotReadableError: ["Микрофон занят другой программой (Zoom, Discord, запись экрана).", "Закрой её и попробуй снова."],
        OverconstrainedError: ["Система не отдала подходящий микрофон.", "Выбери другое устройство ввода в настройках звука."],
        SecurityError: ["Windows запретил доступ к микрофону для браузера.", "Параметры → Конфиденциальность → Микрофон → разреши приложениям."],
      }[error?.name] || [`Браузер ответил: ${error?.name || "неизвестная ошибка"}.`, "Проверь разрешение на микрофон в настройках сайта."];
      micProblem("Микрофон не включился", guide.map(esc));
      return;
    }

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.75;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const canvas = panel.querySelector(".voice-wave");
    const ctx = canvas.getContext("2d");
    const bars = 48;
    const levels = new Array(bars).fill(0);
    const hintNode = panel.querySelector("#voiceHint");
    const timerNode = panel.querySelector("#voiceTimer");

    const draw = () => {
      analyser.getByteTimeDomainData(buffer);
      let peak = 0;
      for (let i = 0; i < buffer.length; i += 1) peak = Math.max(peak, Math.abs(buffer[i] - 128) / 128);
      if (peak > 0.02) heardVoice = true;
      levels.push(peak);
      levels.shift();

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const step = width / bars;
      for (let i = 0; i < bars; i += 1) {
        const value = Math.min(1, levels[i] * 2.6);
        const barHeight = Math.max(3, value * (height - 8));
        const x = i * step + step * 0.22;
        const y = (height - barHeight) / 2;
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, "#7cc6ff");
        gradient.addColorStop(1, "#ff6a8a");
        ctx.fillStyle = gradient;
        ctx.globalAlpha = 0.35 + value * 0.65;
        ctx.beginPath();
        ctx.roundRect(x, y, step * 0.56, barHeight, 3);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      timerNode.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      if (seconds >= 3 && !heardVoice) {
        hintNode.textContent = "Не слышу голос — проверь микрофон и говори громче";
        hintNode.classList.add("warn");
      }
      frame = requestAnimationFrame(draw);
    };
    draw();

    // Chrome пишет webm/opus, Safari — mp4; берём первый поддерживаемый формат
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]
      .find((type) => MediaRecorder.isTypeSupported?.(type));
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) { finish(""); return; }
      // Даже тихую запись отправляем на распознавание — вдруг микрофон просто тихий.
      const bytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
      if (!chunks.length || bytes < 1200) {
        finish("");
        toast("Запись пустая — проверь, тот ли микрофон выбран в системе", "warn");
        return;
      }
      panel.querySelector("#voiceTitle").textContent = "Распознаю…";
      panel.querySelector(".voice-dot").classList.add("busy");
      hintNode.textContent = "Отправил запись на сервер";
      hintNode.classList.remove("warn");
      onStage?.("transcribing");
      const type = recorder.mimeType || "audio/webm";
      const form = new FormData();
      form.append("file", new Blob(chunks, { type }), type.includes("mp4") ? "voice.mp4" : "voice.webm");
      try {
        const data = await api("/ai/transcribe", { method: "POST", body: form });
        const text = (data.text || "").trim();
        if (!text) toast("Речь не распозналась", "warn");
        finish(text);
      } catch (error) {
        toast(error.message, "warn");
        finish("");
      }
    };
    recorder.start();
    onStage?.("recording");

    panel.querySelector("#voiceStop").addEventListener("click", () => { if (recorder.state === "recording") recorder.stop(); });
    panel.querySelector("#voiceCancel").addEventListener("click", () => {
      cancelled = true;
      if (recorder.state === "recording") recorder.stop(); else { cleanup(); finish(""); }
    });
    // пробел/Enter завершают, Escape отменяет
    const onKey = (event) => {
      if (event.key === "Escape") { cancelled = true; recorder.state === "recording" ? recorder.stop() : finish(""); }
      if (event.key === "Enter") { event.preventDefault(); if (recorder.state === "recording") recorder.stop(); }
    };
    document.addEventListener("keydown", onKey);
    promise.finally(() => document.removeEventListener("keydown", onKey));
  })();

  return promise;
}

/** Диктовка прямо в поле ввода: добавляет распознанный текст к текущему значению. */
export async function dictateInto(selector, hint) {
  const text = await dictate({ hint });
  if (!text) return "";
  const field = typeof selector === "string" ? $(selector) : selector;
  if (field) {
    field.value = field.value ? `${field.value.trim()} ${text}` : text;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.focus();
  }
  return text;
}
