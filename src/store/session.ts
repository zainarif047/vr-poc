import { create } from 'zustand';
import { ENGINES, evaluate, replay, scenarioById } from '../engine';
import { guardPlumber, guardWelder, type Intent } from '../engine/guards';
import type { ActionEvent, Answer, Attempt, EvidenceMeta, ReviewerDecision, Scenario } from '../engine/types';
import { cancelSpeech, speak } from '../voice/tts';
import { resetRecorder, setSimulatedFailure, stopRecording } from '../voice/recorder';

export type Screen = 'checkin' | 'sim' | 'followup' | 'evaluating' | 'report' | 'lab' | 'coverage' | 'history';
export type Phase = 'idle' | 'briefing' | 'active' | 'followup' | 'done' | 'replaying';
export type ToastKind = 'info' | 'warn' | 'bad' | 'ok';

const HIST_KEY = 'artilence-poc-history-v1';
const loadHistory = (): Attempt[] => {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
  } catch {
    return [];
  }
};
const saveHistory = (h: Attempt[]) => {
  try {
    localStorage.setItem(
      HIST_KEY,
      JSON.stringify(h.slice(0, 30).map((a) => ({ ...a, evidence: { ...a.evidence, recordingUrl: undefined } }))),
    );
  } catch {
    /* storage unavailable */
  }
};

interface Store {
  screen: Screen;
  scenarioId: string;
  candidateId: string;
  candidateName: string;
  opVerified: boolean;
  noticeAccepted: boolean;
  voiceOn: boolean;
  simulateRecFail: boolean;
  quality: 'high' | 'low';

  phase: Phase;
  sessionToken: number;
  events: ActionEvent[];
  state: any;
  startMs: number;
  answers: Answer[];
  transcript: EvidenceMeta['transcript'];
  speaking: boolean;
  subtitle: string;
  qIndex: number;
  evalStep: number;
  attempt: Attempt | null;
  history: Attempt[];
  toast: { id: number; text: string; kind: ToastKind } | null;

  // transient interaction state
  armed: string | null;
  drag: { part: string; x: number; y: number } | null;
  hoverSlot: string | null;
  defectType: string;
  liveSpeed: number;
  lastMeasure: { id: string; mm: number } | null;
  replayInfo: { index: number; total: number; label: string; running: boolean } | null;
  replayReturn: Screen;

  setScreen: (s: Screen) => void;
  setScenario: (id: string) => void;
  patch: (p: Partial<Store>) => void;
  toastMsg: (text: string, kind?: ToastKind) => void;
  startSession: () => void;
  skipBriefing: () => void;
  act: (type: string, obj?: string, data?: Intent['data']) => boolean;
  submit: () => void;
  answerQuestion: (optionId: string) => void;
  openAttempt: (a: Attempt) => void;
  review: (d: Omit<ReviewerDecision, 'at'>) => void;
  startReplay: (scenarioId: string, events: ActionEvent[], label: string) => void;
  stopReplay: () => void;
  resetToCheckin: () => void;
}

let toastId = 0;
let replayTimer: ReturnType<typeof setTimeout> | null = null;

export const useSession = create<Store>((set, get) => {
  const say = async (text: string, token: number) => {
    if (get().sessionToken !== token) return;
    set((s) => ({
      speaking: true,
      subtitle: text,
      transcript: [...s.transcript, { t: s.phase === 'active' ? Math.round(performance.now() - s.startMs) : 0, who: 'interviewer', text }],
    }));
    await speak(text, { audio: get().voiceOn });
    if (get().sessionToken === token) set({ speaking: false });
  };

  const beginFollowup = async (token: number) => {
    set({ qIndex: 0 });
    const scn = scenarioById(get().scenarioId);
    await say('Thank you. I have a few follow-up questions about your decisions.', token);
    if (get().sessionToken !== token) return;
    await say(scn.questions[0].spoken, token);
  };

  const finalize = async (token: number) => {
    set({ screen: 'evaluating', evalStep: 0 });
    const stop = await stopRecording();
    const s = get();
    const meta: EvidenceMeta = {
      recording: stop.status,
      recordingUrl: stop.url,
      recordingBytes: stop.bytes,
      transcript: s.transcript,
    };
    const scn = scenarioById(s.scenarioId);
    const evaluation = evaluate(scn, s.events, s.answers, meta);
    for (let i = 1; i <= 5; i++) {
      await new Promise((r) => setTimeout(r, 650));
      if (get().sessionToken !== token) return;
      set({ evalStep: i });
    }
    const attempt: Attempt = {
      id: `ATT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      candidateId: s.candidateId,
      candidateName: s.candidateName,
      scenarioId: s.scenarioId,
      startedAt: new Date().toISOString(),
      events: s.events,
      answers: s.answers,
      evidence: meta,
      evaluation,
      source: 'live',
    };
    const history = [attempt, ...get().history];
    saveHistory(history);
    set({ attempt, history, screen: 'report', phase: 'done' });
  };

  return {
    screen: 'checkin',
    scenarioId: 'plb-1',
    candidateId: 'CND-' + String(Math.floor(1000 + Math.random() * 9000)),
    candidateName: '',
    opVerified: false,
    noticeAccepted: false,
    voiceOn: true,
    simulateRecFail: false,
    quality: typeof location !== 'undefined' && location.search.includes('q=low') ? 'low' : 'high',

    phase: 'idle',
    sessionToken: 0,
    events: [],
    state: null,
    startMs: 0,
    answers: [],
    transcript: [],
    speaking: false,
    subtitle: '',
    qIndex: 0,
    evalStep: 0,
    attempt: null,
    history: loadHistory(),
    toast: null,

    armed: null,
    drag: null,
    hoverSlot: null,
    defectType: 'porosity',
    liveSpeed: 0,
    lastMeasure: null,
    replayInfo: null,
    replayReturn: 'checkin',

    setScreen: (screen) => set({ screen }),
    setScenario: (scenarioId) => set({ scenarioId }),
    patch: (p) => set(p as any),
    toastMsg: (text, kind = 'info') => {
      const id = ++toastId;
      set({ toast: { id, text, kind } });
      setTimeout(() => get().toast?.id === id && set({ toast: null }), 3800);
    },

    startSession: () => {
      cancelSpeech();
      if (replayTimer) clearTimeout(replayTimer);
      resetRecorder();
      setSimulatedFailure(get().simulateRecFail);
      const token = get().sessionToken + 1;
      const scn = scenarioById(get().scenarioId);
      set({
        sessionToken: token,
        phase: 'briefing',
        screen: 'sim',
        events: [],
        state: ENGINES[scn.trade].initial(scn),
        answers: [],
        transcript: [],
        qIndex: 0,
        attempt: null,
        armed: null,
        drag: null,
        hoverSlot: null,
        lastMeasure: null,
        replayInfo: null,
        subtitle: '',
        toast: null,
      });
      (async () => {
        for (const line of scn.briefing) {
          if (get().sessionToken !== token || get().phase !== 'briefing') return;
          await say(line, token);
        }
        if (get().sessionToken === token && get().phase === 'briefing') {
          set({ phase: 'active', startMs: performance.now() });
          get().toastMsg('Task assigned. Timer started – work in the 3D bay.', 'ok');
        }
      })();
    },

    skipBriefing: () => {
      cancelSpeech();
      if (get().phase === 'briefing') {
        set({ phase: 'active', startMs: performance.now(), speaking: false });
        get().toastMsg('Briefing skipped. Timer started.', 'info');
      }
    },

    act: (type, obj, data) => {
      const s = get();
      if (s.phase !== 'active') return false;
      const scn = scenarioById(s.scenarioId);
      const guard = scn.trade === 'plumber' ? guardPlumber : guardWelder;
      const g = guard(scn, s.state, { type, obj, data });
      if (g.toast) get().toastMsg(g.toast.text, g.toast.kind);
      if (!g.intent) return false;
      const ev: ActionEvent = {
        seq: s.events.length + 1,
        t: Math.round(performance.now() - s.startMs),
        type: g.intent.type,
        obj: g.intent.obj,
        data: g.intent.data,
      };
      const next = ENGINES[scn.trade].reduce(scn, s.state, ev);
      set({ events: [...s.events, ev], state: next });
      // result toasts derived from the state transition
      if (ev.type === 'pressure_test') {
        const r = next.lastTest as string;
        if (r === 'pass') get().toastMsg('Pressure test: PASS – no leaks at working pressure.', 'ok');
        else if (r === 'leak') get().toastMsg(`Pressure test: LEAK at ${next.leaks.length} joint(s). Water visible.`, 'bad');
        else if (r === 'incomplete') get().toastMsg('Pressure test could not run – route is incomplete.', 'warn');
      }
      return true;
    },

    submit: () => {
      const s = get();
      if (s.phase !== 'active') return;
      get().act('submit');
      cancelSpeech();
      const token = s.sessionToken;
      set({ phase: 'followup', screen: 'followup' });
      beginFollowup(token);
    },

    answerQuestion: (optionId) => {
      const s = get();
      const scn = scenarioById(s.scenarioId);
      const q = scn.questions[s.qIndex];
      if (!q) return;
      const opt = q.options.find((o) => o.id === optionId);
      const answer: Answer = { qid: q.id, optionId, t: Math.round(performance.now() - s.startMs) };
      const text = optionId === 'unsure' ? 'I am not sure.' : (opt?.text ?? '');
      const answers = [...s.answers, answer];
      const next = s.qIndex + 1;
      set({
        answers,
        qIndex: next,
        transcript: [...s.transcript, { t: answer.t, who: 'candidate', text }],
      });
      const token = s.sessionToken;
      (async () => {
        if (next < scn.questions.length) {
          await say(scn.questions[next].spoken, token);
        } else {
          await say('Thank you. Your attempt has been recorded and will now be evaluated against the approved SOP.', token);
          if (get().sessionToken === token) finalize(token);
        }
      })();
    },

    openAttempt: (attempt) => {
      cancelSpeech();
      set({ attempt, scenarioId: attempt.scenarioId, screen: 'report', phase: 'done' });
    },

    review: (d) => {
      const s = get();
      if (!s.attempt) return;
      const decision: ReviewerDecision = { ...d, at: new Date().toISOString() };
      const attempt = { ...s.attempt, review: decision };
      const history = s.history.map((h) => (h.id === attempt.id ? attempt : h));
      saveHistory(history);
      set({ attempt, history });
    },

    startReplay: (scenarioId, events, label) => {
      cancelSpeech();
      if (replayTimer) clearTimeout(replayTimer);
      const scn: Scenario = scenarioById(scenarioId);
      const token = get().sessionToken + 1;
      set({
        sessionToken: token,
        scenarioId,
        replayReturn: ['lab', 'report', 'history'].includes(get().screen) ? get().screen : get().attempt ? 'report' : 'lab',
        screen: 'sim',
        phase: 'replaying',
        events: [],
        state: ENGINES[scn.trade].initial(scn),
        replayInfo: { index: 0, total: events.length, label, running: true },
        subtitle: '',
        speaking: false,
        armed: null,
        drag: null,
        toast: null,
        lastMeasure: null,
        startMs: performance.now(),
      });
      let i = 0;
      const step = () => {
        const s = get();
        if (s.sessionToken !== token || s.phase !== 'replaying') return;
        if (i >= events.length) {
          set({ replayInfo: { index: events.length, total: events.length, label, running: false } });
          return;
        }
        const ev = events[i++];
        const next = ENGINES[scn.trade].reduce(scn, s.state, ev);
        set({ events: [...s.events, ev], state: next, replayInfo: { index: i, total: events.length, label, running: true } });
        replayTimer = setTimeout(step, ev.type === 'bead' ? 90 : ev.type === 'ppe' || ev.type === 'tool' ? 250 : 520);
      };
      replayTimer = setTimeout(step, 600);
    },

    stopReplay: () => {
      if (replayTimer) clearTimeout(replayTimer);
      set({ phase: 'done', replayInfo: null, screen: get().replayReturn, sessionToken: get().sessionToken + 1 });
    },

    resetToCheckin: () => {
      cancelSpeech();
      if (replayTimer) clearTimeout(replayTimer);
      set({
        sessionToken: get().sessionToken + 1,
        screen: 'checkin',
        phase: 'idle',
        events: [],
        state: null,
        attempt: null,
        replayInfo: null,
        speaking: false,
        subtitle: '',
        candidateId: 'CND-' + String(Math.floor(1000 + Math.random() * 9000)),
      });
    },
  };
});

export { replay };
