"""Exercises Noda's direct screen, audio and input path in Chromium."""

import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / "pc-app" / "renderer" / "capture.html"
OUTPUT = Path(os.environ.get("NODA_RTC_SCREENSHOT", Path(os.environ.get("TEMP", ROOT)) / "noda-remote-webrtc.png"))


CAPTURE_BRIDGE = r"""
(() => {
  const callbacks = {};
  const states = [];
  const errors = [];
  const inputs = [];
  window.__nodaRtcTest = { callbacks, states, errors, inputs };
  window.nodaCapture = {
    ready() {},
    frame() {},
    error(payload) { errors.push(payload); },
    signal(payload) { window.__viewerHandleSignal?.(payload); },
    rtcState(payload) { states.push(payload); },
    input(payload) {
      inputs.push(payload);
      callbacks.inputAck?.({ type: 'screen_input_ack', seq: payload.seq, action: payload.action, ok: true });
    },
    onStart(callback) { callbacks.start = callback; },
    onStop(callback) { callbacks.stop = callback; },
    onRtcSignal(callback) { callbacks.signal = callback; },
    onInputAck(callback) { callbacks.inputAck = callback; },
  };

  navigator.mediaDevices.getDisplayMedia = async () => {
    const source = document.createElement('canvas');
    source.width = 1280;
    source.height = 720;
    const context = source.getContext('2d');
    let frame = 0;
    const paint = () => {
      frame += 1;
      context.fillStyle = '#101114';
      context.fillRect(0, 0, source.width, source.height);
      context.fillStyle = '#9aa4ff';
      context.fillRect((frame * 9) % 1100, 230, 180, 180);
      context.fillStyle = '#f4f4f5';
      context.font = '48px sans-serif';
      context.fillText('Noda direct stream', 64, 100);
      requestAnimationFrame(paint);
    };
    paint();
    const stream = source.captureStream(24);
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioContextClass();
      const oscillator = audioContext.createOscillator();
      const destination = audioContext.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      const audioTrack = destination.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);
      window.__nodaRtcTest.audioContext = audioContext;
      window.__nodaRtcTest.oscillator = oscillator;
    } catch {}
    return stream;
  };
})();
"""


def main() -> int:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required"])
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.add_init_script(CAPTURE_BRIDGE)
        page.goto(ENTRY.as_uri(), wait_until="domcontentloaded")
        page.wait_for_function("() => !!window.__nodaRtcTest?.callbacks?.start")
        result = page.evaluate(r"""async () => {
          const waitFor = (test, timeout = 12000) => new Promise((resolve, reject) => {
            const started = Date.now();
            const tick = () => {
              if (test()) resolve();
              else if (Date.now() - started > timeout) reject(new Error('WebRTC test timeout'));
              else setTimeout(tick, 30);
            };
            tick();
          });

          await window.__nodaRtcTest.callbacks.start({ sourceId: 'mock', width: 1280, height: 720, fps: 24, quality: 70 });
          const viewer = new RTCPeerConnection({ iceServers: [] });
          const stream = new MediaStream();
          const video = document.createElement('video');
          video.id = 'viewer';
          video.autoplay = true;
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          document.body.appendChild(video);
          const pendingCandidates = [];
          let ack = null;
          const channel = viewer.createDataChannel('noda-input', { ordered: false, maxRetransmits: 0 });
          channel.onmessage = (event) => { ack = JSON.parse(event.data); };
          viewer.addTransceiver('video', { direction: 'recvonly' });
          viewer.addTransceiver('audio', { direction: 'recvonly' });
          viewer.ontrack = (event) => {
            if (!stream.getTracks().some((track) => track.id === event.track.id)) stream.addTrack(event.track);
            video.play().catch(() => {});
          };
          viewer.onicecandidate = (event) => {
            if (event.candidate) window.__nodaRtcTest.callbacks.signal({ candidate: event.candidate.toJSON() });
          };
          window.__viewerHandleSignal = async (signal) => {
            if (signal.description) {
              await viewer.setRemoteDescription(signal.description);
              for (const candidate of pendingCandidates.splice(0)) await viewer.addIceCandidate(candidate);
            } else if (signal.candidate) {
              if (viewer.remoteDescription) await viewer.addIceCandidate(signal.candidate);
              else pendingCandidates.push(signal.candidate);
            }
          };
          const offer = await viewer.createOffer();
          await viewer.setLocalDescription(offer);
          await window.__nodaRtcTest.callbacks.signal({ description: viewer.localDescription.toJSON() });
          await waitFor(() => viewer.connectionState === 'connected' && channel.readyState === 'open');
          await waitFor(() => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
          channel.send(JSON.stringify({ type: 'screen_input', seq: 'test-1', action: 'move', nx: 0.4, ny: 0.6 }));
          await waitFor(() => ack?.seq === 'test-1');
          return {
            connectionState: viewer.connectionState,
            channelState: channel.readyState,
            videoTracks: stream.getVideoTracks().length,
            audioTracks: stream.getAudioTracks().length,
            width: video.videoWidth,
            height: video.videoHeight,
            ack,
            hostStates: window.__nodaRtcTest.states.map((item) => item.state),
            errors: window.__nodaRtcTest.errors,
          };
        }""")
        page.screenshot(path=str(OUTPUT), full_page=True)
        browser.close()

    assert result["connectionState"] == "connected", result
    assert result["channelState"] == "open", result
    assert result["videoTracks"] == 1, result
    assert result["audioTracks"] == 1, result
    assert result["width"] > 0 and result["height"] > 0, result
    assert abs((result["width"] / result["height"]) - (16 / 9)) < 0.02, result
    assert result["ack"]["ok"] is True, result
    assert "connected" in result["hostStates"], result
    assert not result["errors"], result
    print(json.dumps({"ok": True, "result": result, "screenshot": str(OUTPUT)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
