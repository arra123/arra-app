const video = document.getElementById('source');
const canvas = document.getElementById('frame');
const context = canvas.getContext('2d', { alpha: false, desynchronized: true });

let stream = null;
let timer = null;
let generation = 0;
let busy = false;
let activeConfig = null;

function stopCapture() {
  generation += 1;
  activeConfig = null;
  busy = false;
  if (timer) clearTimeout(timer);
  timer = null;
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
  video.srcObject = null;
}

function canvasBlob(quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('JPEG encoder returned an empty frame')), 'image/jpeg', quality);
  });
}

async function captureNext(currentGeneration) {
  if (currentGeneration !== generation || !stream || !activeConfig) return;
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

async function startCapture(config = {}) {
  stopCapture();
  const currentGeneration = generation;
  const fps = Math.max(4, Math.min(20, Number(config.fps) || 12));
  const width = Math.max(640, Math.min(3840, Number(config.width) || 1920));
  const height = Math.max(360, Math.min(2160, Number(config.height) || 1080));
  activeConfig = {
    fps,
    width,
    height,
    quality: Math.max(20, Math.min(85, Number(config.quality) || 72)),
  };
  try {
    const nextStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: config.sourceId,
          minWidth: width,
          maxWidth: width,
          minHeight: height,
          maxHeight: height,
          minFrameRate: Math.min(8, fps),
          maxFrameRate: fps,
        },
      },
    });
    if (currentGeneration !== generation) { nextStream.getTracks().forEach((track) => track.stop()); return; }
    stream = nextStream;
    video.srcObject = stream;
    await video.play();
    if (currentGeneration !== generation) return;
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
window.nodaCapture.ready();
