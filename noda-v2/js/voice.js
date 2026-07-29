// Диктовка: панель записи с живой волной, распознавание через сервер.
// Видно, что микрофон слышит голос — столбики двигаются, а тишина подсвечивается предупреждением.

import { $, api, toast } from "./core.js";

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
      <button class="key" id="voiceCancel" type="button">Отмена</button>
      <button class="key light" id="voiceStop" type="button">Готово</button>
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
      toast("Браузер не даёт доступ к микрофону на этой странице", "warn");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      finish("");
      const reason = {
        NotAllowedError: "Доступ к микрофону запрещён — разреши его в адресной строке браузера",
        NotFoundError: "Микрофон не найден — проверь, что он подключён и выбран в системе",
        NotReadableError: "Микрофон занят другой программой",
        OverconstrainedError: "Не нашёл подходящий микрофон",
      }[error?.name] || `Микрофон недоступен: ${error?.name || "ошибка"}`;
      toast(reason, "warn");
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

    recorder = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus" } : {});
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
      const form = new FormData();
      form.append("file", new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), "voice.webm");
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
