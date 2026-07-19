const video = document.getElementById('source');
const canvas = document.getElementById('frame');
const context = canvas.getContext('2d', { alpha: false, desynchronized: true });

let stream = null;
let timer = null;
let generation = 0;
let busy = false;
let activeConfig = null;
let streamPromise = null;
let peer = null;
let inputChannel = null;
let rtcConnected = false;
let pendingCandidates = [];

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
  bundlePolicy: 'max-bundle',
};

function reportRtcState(state, extra = {}) {
  window.nodaCapture.rtcState({ state, audio: !!stream?.getAudioTracks().length, ...extra });
}

function closePeer() {
  rtcConnected = false;
  pendingCandidates = [];
  if (inputChannel) {
    try { inputChannel.close(); } catch {}
  }
  inputChannel = null;
  if (peer) {
    try { peer.onicecandidate = null; peer.onconnectionstatechange = null; peer.ondatachannel = null; peer.close(); } catch {}
  }
  peer = null;
}

function stopMedia() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  streamPromise = null;
  video.pause();
  video.srcObject = null;
}

function stopCapture() {
  generation += 1;
  activeConfig = null;
  busy = false;
  stopMedia();
  closePeer();
}

function canvasBlob(quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('JPEG encoder returned an empty frame')), 'image/jpeg', quality);
  });
}

async function captureNext(currentGeneration) {
  if (currentGeneration !== generation || !stream || !activeConfig) return;
  // WebRTC carries the original encoded Chromium stream. JPEG is only a
  // compatibility fallback and stays asleep while the direct channel is live.
  if (rtcConnected) {
    timer = setTimeout(() => captureNext(currentGeneration), 250);
    return;
  }
  if (busy || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    timer = setTimeout(() => captureNext(currentGeneration), 16);
    return;
  }
  busy = true;
  const startedAt = performance.now();
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(activeConfig.quality / 100);
    const data = await blob.arrayBuffer();
    if (currentGeneration !== generation) return;
    window.nodaCapture.frame({
      data,
      w: canvas.width,
      h: canvas.height,
      capturedAt: Date.now(),
      captureMs: Math.round((performance.now() - startedAt) * 10) / 10,
    });
  } catch (error) {
    window.nodaCapture.error({ message: error.message, stack: error.stack || '' });
    stopCapture();
    return;
  } finally {
    busy = false;
  }
  if (currentGeneration !== generation || !activeConfig) return;
  const interval = Math.max(40, Math.round(1000 / activeConfig.fps));
  const delay = Math.max(0, interval - (performance.now() - startedAt));
  timer = setTimeout(() => captureNext(currentGeneration), delay);
}

async function acquireDesktopStream(config, width, height, fps) {
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: {
        width: { ideal: width, max: width },
        height: { ideal: height, max: height },
        frameRate: { ideal: fps, max: Math.max(fps, 30) },
      },
    });
  } catch (displayError) {
    // Older Windows/Electron builds can deny loopback audio. Preserve screen
    // access instead of failing the whole remote session.
    window.nodaCapture.rtcState({ state: 'audio-unavailable', error: displayError.message || '' });
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId,
          minWidth: width,
          maxWidth: width,
          minHeight: height,
          maxHeight: height,
          minFrameRate: Math.min(12, fps),
          maxFrameRate: Math.max(fps, 30),
        },
      },
    });
  }
}

function attachInputChannel(channel) {
  inputChannel = channel;
  channel.onopen = () => reportRtcState('input-open');
  channel.onclose = () => { if (inputChannel === channel) inputChannel = null; };
  channel.onmessage = (event) => {
    try {
      const message = JSON.parse(String(event.data || ''));
      if (message?.type === 'screen_input') window.nodaCapture.input(message);
    } catch {}
  };
}

function syncPeerTracks() {
  if (!peer || !stream) return;
  for (const track of stream.getTracks()) {
    const sender = peer.getSenders().find((item) => item.track?.kind === track.kind);
    if (sender) sender.replaceTrack(track).catch(() => {});
    else peer.addTrack(track, stream);
  }
}

function ensurePeer(iceServers = null) {
  if (peer && peer.connectionState !== 'closed') return peer;
  const config = Array.isArray(iceServers) && iceServers.length ? { ...RTC_CONFIG, iceServers } : RTC_CONFIG;
  peer = new RTCPeerConnection(config);
  peer.onicecandidate = (event) => {
    if (event.candidate) window.nodaCapture.signal({ candidate: event.candidate.toJSON?.() || event.candidate });
  };
  peer.ondatachannel = (event) => attachInputChannel(event.channel);
  peer.onconnectionstatechange = () => {
    const state = peer?.connectionState || 'closed';
    rtcConnected = state === 'connected';
    reportRtcState(state);
    if (!rtcConnected && stream && activeConfig && !timer) {
      timer = setTimeout(() => captureNext(generation), state === 'failed' ? 0 : 500);
    }
  };
  syncPeerTracks();
  return peer;
}

async function handleRtcSignal(payload = {}) {
  try {
    if (streamPromise) await streamPromise;
    const connection = ensurePeer(payload.iceServers);
    if (payload.description) {
      await connection.setRemoteDescription(payload.description);
      syncPeerTracks();
      if (payload.description.type === 'offer') {
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        window.nodaCapture.signal({ description: connection.localDescription.toJSON?.() || connection.localDescription });
      }
      const queued = pendingCandidates;
      pendingCandidates = [];
      for (const candidate of queued) await connection.addIceCandidate(candidate);
    } else if (payload.candidate) {
      if (connection.remoteDescription) await connection.addIceCandidate(payload.candidate);
      else pendingCandidates.push(payload.candidate);
    }
  } catch (error) {
    reportRtcState('failed', { error: error.message || String(error) });
  }
}

async function startCapture(config = {}) {
  generation += 1;
  busy = false;
  stopMedia();
  const currentGeneration = generation;
  const fps = Math.max(8, Math.min(60, Number(config.fps) || 30));
  const width = Math.max(640, Math.min(3840, Number(config.width) || 1920));
  const height = Math.max(360, Math.min(2160, Number(config.height) || 1080));
  activeConfig = {
    fps: Math.min(15, fps),
    directFps: fps,
    width,
    height,
    quality: Math.max(20, Math.min(85, Number(config.quality) || 72)),
  };
  try {
    streamPromise = acquireDesktopStream(config, width, height, fps);
    const nextStream = await streamPromise;
    if (currentGeneration !== generation) { nextStream.getTracks().forEach((track) => track.stop()); return; }
    stream = nextStream;
    video.srcObject = stream;
    await video.play();
    if (currentGeneration !== generation) return;
    syncPeerTracks();
    reportRtcState('media-ready');
    const sourceWidth = video.videoWidth || stream.getVideoTracks()[0]?.getSettings().width || width;
    const sourceHeight = video.videoHeight || stream.getVideoTracks()[0]?.getSettings().height || height;
    const scale = Math.min(1, width / Math.max(1, sourceWidth), height / Math.max(1, sourceHeight));
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    captureNext(currentGeneration);
  } catch (error) {
    if (currentGeneration !== generation) return;
    window.nodaCapture.error({ message: error.message, stack: error.stack || '' });
    stopCapture();
  }
}

window.nodaCapture.onStart(startCapture);
window.nodaCapture.onStop(stopCapture);
window.nodaCapture.onRtcSignal(handleRtcSignal);
window.nodaCapture.onInputAck((payload) => {
  if (inputChannel?.readyState !== 'open') return;
  try { inputChannel.send(JSON.stringify(payload)); } catch {}
});
window.nodaCapture.ready();
