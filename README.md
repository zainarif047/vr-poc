# Artilence Skills Lab 3D – Phase 1 proof of concept

Browser-based 3D skills-assessment simulator that demonstrates the Phase 1 proposal
(`../Artilence_Phase_1_Proposal.md`): interactive 3D tasks, a scripted AI interviewer,
structured action capture, SOP-based evaluation, assessor review and an employer report.

```
npm install
npm run dev      # http://localhost:5173   (add ?q=low for older machines)
npm run build    # type-check + production build
npm test         # 48 scripted SOP attempts through the evaluator
```

## What you can do

| Screen | Purpose |
|---|---|
| **Assessment** | Check-in → pick a scenario → **Start test** (interviewer speaks the task via browser TTS) → work in 3D → Submit → spoken follow-ups → evaluation → report |
| **SOP Validation Lab** | 48 scripted attempts (8 per scenario) run through the same evaluator, each with an expected outcome; replay any of them in the 3D workshop |
| **Proposal coverage** | Requirement-by-requirement status: Demonstrated / Simulated / Partial / Not in POC |
| **History** | Past attempts (local browser storage) |

## Scenarios (3 per trade)

| ID | Trade | Scenario | What it stresses |
|---|---|---|---|
| PLB-1 | Plumber | Valve + straight run + elbow + riser, 15 mm copper | isolation, drain, measurement, material choice, joint make-up, pressure test |
| PLB-2 | Plumber | 22 mm main with tee and capped branch | diameter selection, tee/cap choice, sequencing |
| PLB-3 | Plumber | Leak diagnosis and repair on a live run | locate-before-repair, root cause (loose joint vs cracked fitting), minimum intervention, retest |
| WLD-1 | Welder | Flat butt weld, 3 mm mild steel, GMAW | PPE, hot-work checks, WPS settings, prep, tack, travel speed, inspection |
| WLD-2 | Welder | Fillet weld, 6 mm mild steel | thickness-specific current (200 A), torch angle, heat input |
| WLD-3 | Welder | Inspect a finished coupon | defect location/classification, accept/reject (practical execution out of scope) |

Competency weights are the proposal's AZIZ matrix values. A scenario only scores the groups
it actually covers; the rest are reported as *not in scope* (never auto-passed).

## How the evaluation works

```
UI interaction ──guard──▶ ActionEvent log ──reducer──▶ scene state (3D + HUD)
                              │
                              ▼
                 evaluate(scenario, events, answers, recording meta)
                   1 evidence check   sequence gaps, timestamps, recording status
                   2 SOP rules        named criteria with SOP clause refs, critical flags
                   3 AI layer (sim.)  heuristic findings with confidence scores
                   4 policy           weights → practical score; knowledge scored separately
                   5 routing          critical > evidence/incomplete/low-confidence → Pending Review
                              │
                              ▼
                 Assessor review (decision + rationale, audit stamp) → employer report
```

* The evaluator only reads the event log (never a browser-submitted score).
* Unsafe actions are **allowed and recorded** so the SOP layer can flag them; the UI only blocks physically impossible actions (`src/engine/guards.ts`).
* Critical error ⇒ Not Qualified, unless the log itself is incomplete – then the flag is provisional and the attempt is held for review.
* Thresholds are **placeholders** (`src/engine/policy.ts`) pending client / trade-expert approval.

## Code map

```
src/engine/        types · policy · evaluate (index.ts) · AI layer (ai.ts) · guards
  plumber/         catalog · layout · reducer · scenarios (criteria + questions)
  welder/          reducer (bead model) · scenarios
  attempts.ts      scripted lab attempts   engine.test.ts  vitest harness
src/scenes/        React Three Fiber scenes, procedural PBR textures, lighting rig
src/store/         zustand session store (flow, events, replay, history)
src/voice/         browser TTS + canvas MediaRecorder
src/ui/            check-in, HUDs, follow-up, report, lab, coverage, history
```

Event-sourcing makes replay trivial: the 3D scene is a pure function of reducer state, so any
stored attempt can be re-played in the workshop.

## Honest limits

* Interviewer voice is scripted browser TTS; answers are multiple choice (no STT, no LiveKit, no LLM).
* "AI evaluator" is deterministic heuristics with confidence scores – it shows the routing, not model quality.
* Weld bead quality is an illustrative model, not metallurgy.
* No backend: history and decisions live in browser storage; recording stays in memory.
* English only; touch uses the same pointer code but was not device-tested.

## Deploy (Vercel, free Hobby plan)

Static Vite SPA – no server, no env vars.

1. Push this folder to GitHub (if it lives in a monorepo, set **Root Directory** to `artilence-3d-poc` in Vercel).
2. Vercel → *Add New → Project* → import the repo. Framework is auto-detected as Vite; `vercel.json` already sets
   install / build / output.
3. Deploy. Or from the CLI: `npx vercel --prod`.

Notes: HTTPS (provided by Vercel) is required for canvas recording and speech synthesis. Enable *Deployment
Protection* in project settings if the demo should not be public.
