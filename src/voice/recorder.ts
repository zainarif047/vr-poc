// Simulation recording by application-canvas capture (proposal §4.4).
// Whole-screen share is avoided; the WebGL canvas itself is the evidence feed.
import type { EvidenceMeta } from '../engine/types';

let rec: MediaRecorder | null = null;
let chunks: Blob[] = [];
let status: EvidenceMeta['recording'] = 'not-started';
let stopped: Promise<{ url?: string; bytes: number }> | null = null;
let forceFail = false;

export function setSimulatedFailure(v: boolean) {
  forceFail = v;
}
export const recordingStatus = () => status;

export function startRecording(canvas: HTMLCanvasElement) {
  if (rec) return;
  status = 'not-started';
  chunks = [];
  if (forceFail) {
    status = 'simulated-off';
    return;
  }
  try {
    if (typeof MediaRecorder === 'undefined' || !(canvas as any).captureStream) {
      status = 'unsupported';
      return;
    }
    const stream = (canvas as any).captureStream(15) as MediaStream;
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
    rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 1_500_000 } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onerror = () => {
      status = 'failed';
    };
    rec.start(1000);
    status = 'recorded';
  } catch {
    status = 'failed';
    rec = null;
  }
}

export function stopRecording(): Promise<{ url?: string; bytes: number; status: EvidenceMeta['recording'] }> {
  if (!rec) return Promise.resolve({ bytes: 0, status });
  const r = rec;
  rec = null;
  stopped = new Promise((resolve) => {
    r.onstop = () => {
      const blob = new Blob(chunks, { type: r.mimeType || 'video/webm' });
      if (blob.size === 0) status = 'failed';
      resolve({ url: blob.size ? URL.createObjectURL(blob) : undefined, bytes: blob.size });
    };
    try {
      r.state !== 'inactive' && r.stop();
    } catch {
      status = 'failed';
      resolve({ bytes: 0 });
    }
  });
  return stopped.then((x) => ({ ...x, status }));
}

export function resetRecorder() {
  rec = null;
  chunks = [];
  status = 'not-started';
}
