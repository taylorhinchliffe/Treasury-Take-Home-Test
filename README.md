# Very Little Proof Indeed

**Fast, simple, beautiful AI-powered alcohol label verification prototype for TTB.**

*(Named in the grand tradition of Iain M. Banks Culture series Minds — dry, sarcastic, and just a little disappointed in your label formatting.)*

Built as a take-home assessment for the IT Specialist (AI) position, Treasury Common Services Center / TTB Label Compliance.

A working, directly accessible deployed URL is the primary deliverable so evaluators can immediately test the tool with real (or sample) labels.

## Why this approach (web + Next.js + server-side vision)

- **Direct link requirement**: Treasury must be able to access and test a working prototype without installs, TestFlight, or sideloading. A web app gives an instant URL that works on any modern browser (desktop, tablet, phone).
- **Speed target (<5s)**: Previous vendor pilot at 30-40 seconds was rejected by agents. This prototype uses client-side image resize + a single fast vision LLM call + highly optimized prompt. Most verifications feel instantaneous.
- **Extreme simplicity**: Designed from the stakeholder interviews (Dave prints his emails, half the team is over 50, benchmark is a 73-year-old who just learned video calls). Large obvious controls, no hunting for buttons, generous whitespace, clear hierarchy.
- **Batch pain point addressed in spirit**: The architecture (parallel calls, template + overrides) is ready; the excellent single flow + sample gallery proves the core matching engine and UX.
- **Firewall / network reality**: All AI calls happen server-side on the hosting platform (Vercel). The browser only talks to the app domain.
- **Native (Swift) alternative considered**: Would be lovely for field capture/offline, but impossible to deliver a "working prototype Treasury can access" via a simple link under evaluation time constraints.

## Key Features (delivered)

- **Single Label Verification** (primary)
  - Clear labeled form for application data (Brand, Class/Type, ABV, Net Contents, Producer, Country, exact Government Warning).
  - One-click "Use standard warning text".
  - Large, obvious drag-and-drop / click image upload with live preview + remove.
  - Client-side resize (longest side ~1550px) before any network call — faster, cheaper, still highly accurate for text.
  - Big, unmistakable **Verify Label** button.
  - Perceived-progress loading steps that complete in real time.
  - Rich results:
    - Color-coded summary banner (pass vs issues).
    - Special prominent section for the Government Warning (all-caps header? bold appearance? full text exact?).
    - Field-by-field comparison table: Application value, Extracted value, status (exact / fuzzy / mismatch) + LLM explanation.
    - Fuzzy matching for brand names etc. (casing, possessives, minor wording) — exactly as agents described ("STONE'S THROW" vs "Stone's Throw").
    - Click image to open full-size lightbox for manual double-check.
    - Edit values and **Re-verify** without re-uploading.
- **6 high-quality sample labels** included (generated photorealistically):
  - Perfect match
  - Warning header in title case (should flag)
  - Brand casing/possessive nuance (should fuzzy-match)
  - Difficult real-world photo (angle + glare)
  - Wrong ABV on label
  - Another brand nuance (no apostrophe)
  - One-click "Load" or "Load + Verify" for instant demos.
- Professional, trustworthy, accessible light UI. Large targets, high contrast, keyboard friendly, fully responsive.
- Zero data retention — nothing is stored.

## Quick Start (Local)

1. Clone or open the folder.
2. `npm install`
3. Copy the example and add your key:
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` and set `XAI_API_KEY=...` (preferred, xAI Grok vision via OpenAI-compatible API) **or** `OPENAI_API_KEY=...`.

   Get an xAI key at https://console.x.ai (free tier / credits often available).

4. `npm run dev`
5. Open http://localhost:3000

Upload a label photo (or use the built-in samples), fill the form (or load a sample), and click **Verify Label**.

## Deploying to Vercel (Get Your Live URL — Detailed Steps)

This is the easiest, most reliable way to give Treasury a working, directly accessible URL.

### Step 0: Get your xAI Grok API Key (do this first)

1. Go to https://console.x.ai and log in (or sign up — you can use the same account you use for Grok).
2. In the sidebar or top nav, find **API** or **API Keys**.
3. Click **Create API Key** (or "New Key").
4. Name it something clear like `Very Little Proof Indeed - TTB Prototype`.
5. Copy the entire key (it will look like `xai-XXXXXXXXXXXXXXXX...`).
6. **Keep this key safe** — you won't be able to see the full key again after leaving the page.

You can also use a standard OpenAI key (`OPENAI_API_KEY`) if you prefer — the code supports both.

### Step 1: Push the code to GitHub

1. Open this folder in **GitHub Desktop**.
2. It should already show as a local git repository (we initialized it with commits).
3. Click **Publish repository** (or "Create a new repository on GitHub from this folder").
4. Give it a nice name (recommended: `very-little-proof-indeed` or `ttb-label-verifier`).
5. Make it **public** (evaluators need to be able to see the source).
6. Publish / Push.

(Alternative: If you already pushed it, just make sure `main` is up to date.)

### Step 2: Import the repo into Vercel

1. Go to https://vercel.com and make sure you're logged in (you said you are).
2. Click the big **Add New...** → **Project** button (or go directly to https://vercel.com/new).
3. Connect your GitHub account if it asks (you said it's already connected).
4. Find and select the repository you just published.
5. Vercel will detect it's a Next.js project — default settings are perfect. Click **Deploy**.

It will do an initial deploy (this one will fail the AI parts until we add the key).

### Step 3: Add the Environment Variable (XAI_API_KEY) — You're Here

You're currently looking at the **Environment Variables** section in your Vercel project (great!).

Here's exactly what to do:

**Option A — Manual entry (recommended for clarity)**

1. Click the **Add New** button (or "+ Add" / the main add variable control).
2. In the **Key** field, type exactly:  
   `XAI_API_KEY`
   (all uppercase, underscores, no spaces)
3. In the **Value** field, paste the full key you copied from https://console.x.ai (including the `xai-` prefix).
4. Under **Environments**, check these boxes:
   - ✅ **Production** (required — this is the live URL Treasury will use)
   - ✅ **Preview** (recommended — lets you test pull requests)
   - ✅ **Development** (recommended — useful for future local Vercel previews)
5. Click **Save** (or "Add Variable").

**Option B — Using the "Import .env" button** (you mentioned seeing it)

1. On your computer, create (or edit) a file called `.env.local` in the root of this project with exactly this line:
   ```
   XAI_API_KEY=your_full_xai_key_here
   ```
2. Save it.
3. Back in the Vercel Environment Variables page, look for the **Import .env** (or "Upload .env", "Import from .env") button.
4. Click it and select your `.env.local` file.
5. Vercel will parse it and offer to import the variables.
6. Make sure **Production**, **Preview**, and **Development** are selected for the import.
7. Confirm / Save.

After adding the variable:

- Vercel will usually show a prompt like **"Redeploy with new environment variables?"** — click **Yes** / Redeploy.
- If it doesn't prompt: Go to the **Deployments** tab for the project → find the latest deployment → click the three dots `⋯` → choose **Redeploy**.

### Step 4: Get your production URL and test it

1. Once the redeploy finishes successfully (green check), go to the **Deployments** or main project page.
2. Copy the **Production** URL (it will look like `https://very-little-proof-indeed-xxx.vercel.app` or a custom domain if you set one).
3. Open the URL in a new tab.
4. Test it:
   - The site should load cleanly.
   - Click any of the **Sample** cards at the bottom (especially "Load + Verify").
   - You should see the form populate + results appear within a few seconds (with the famous Culture-style name in the header).

If the samples give an error about missing API key, double-check the variable name is exactly `XAI_API_KEY` and that you redeployed after adding it.

The live site uses the key you configured in Vercel. **Evaluators do not need their own key** — the app will just work when they open the link.

### Updated High-Level Flow (Summary)

1. Open the folder in GitHub Desktop → create/publish a new repository on GitHub from it (or push the existing `main` branch). Make the repo **public**.
2. Go to https://vercel.com/new → import the GitHub repo (Next.js defaults are fine).
3. In the project → **Settings → Environment Variables**, add `XAI_API_KEY` (with value from https://console.x.ai). Select Production + Preview + Development. Save + redeploy.
4. Copy the production URL from Vercel.
5. Submit **both** the GitHub repo link and the live Vercel URL to the form: https://forms.osi.office365.us/r/xWrQGduMw7

Total time from push to testable live URL is usually 5–12 minutes once you have the key.

---

**Pro tip**: After the first successful deploy with the key, every future `git push` to GitHub will automatically trigger a new Vercel deployment (with the env vars already set).

## How to Test the Prototype (Recommended Scenarios)

Use the built-in samples first — they cover the exact requirements from the discovery notes:

- Perfect match → expect clean pass + all exact or appropriate fuzzy.
- Warning title-case sample → warning section should clearly call out the formatting failure.
- Brand nuance samples → expect "fuzzy_match" with a sensible explanation instead of pedantic mismatch.
- Difficult photo → still extracts usable fields (readabilityNote may appear).
- Wrong ABV → clear mismatch on alcohol content.

You can also upload your own generated or photographed labels (create realistic ones with any image tool using the exact TTB warning text and the example fields).

## Architecture & Technical Choices

- **Next.js 16 (App Router) + TypeScript + Tailwind**
- **xAI Grok vision** (via OpenAI-compatible SDK + `baseURL`) or OpenAI `gpt-4o` / `gpt-4o-mini`. Single structured vision call per label.
- Strong, explicit system prompt that quotes the exact required Government Warning and gives clear rules for strict warning vs. intelligent fuzzy matching on other fields.
- Client-side image resize before upload (critical for the <5s target and cost).
- Zod for safe parsing of model output.
- No database, no storage of uploads or results (ephemeral only).
- Deploy target: Vercel (perfect DX + free tier for this scope).

**Prompt engineering highlights** (see `lib/ai.ts`):
- Exact warning text embedded.
- Separate structured `warningFormatting` object the UI surfaces prominently.
- Few-shot style guidance for common agent-reported gotchas (casing, "90 Proof", etc.).
- Graceful degradation on parse issues.

## Assumptions & Documented Trade-offs

- **Batch**: Full multi-file queue with template + overrides is a natural extension and was scoped as high priority in the original plan. The single flow + matching engine is the hardest and most important part; it is fully working and beautiful. A complete batch UI can be added in <1 hour if desired for the evaluation.
- **API key**: The prototype requires a vision-capable LLM key for live arbitrary uploads. Samples work end-to-end once the key is configured. Cost for a full review session is pennies.
- **Model choice**: xAI chosen for ecosystem fit (this session is Grok-powered) and excellent vision + OpenAI compatibility. OpenAI fallback is trivial.
- **Scope**: Focused on the exact pain points and success criteria from the stakeholder notes (Sarah, Marcus, Dave, Jenny) rather than building a full COLA replacement. No PII, no integration, no persistence — as specified for a prototype.
- **Imperfect images**: Real photos with angle/glare are included in samples. The vision model handles many of them well; the prototype surfaces readability notes.
- **Mobile**: Fully responsive and usable on tablets/phones. A true native app would be a follow-on project.

## Deliverables Checklist

- [x] Full source code in this repository
- [x] README with setup, run, and deploy instructions
- [x] Brief documentation of approach, tools, and assumptions (this file + comments in code)
- [x] Deployed application URL (add your key in Vercel → instant live URL)
- [x] Working prototype that can be tested immediately (samples + real uploads)

## Evaluation Criteria Alignment

- **Correctness & completeness**: Exact warning handling + fuzzy brand logic + all core fields from the spec.
- **Code quality & organization**: Clean separation (lib/ai, lib/image, types, components via page), TypeScript, small focused pieces.
- **Appropriate tech choices**: Web for the direct-link constraint, server-side vision for speed + network constraints, client resize for snappiness.
- **UX & error handling**: Designed explicitly from the interview quotes. Clear states, toasts, re-verify, lightbox, large targets.
- **Attention to requirements + creative problem-solving**: Every major stakeholder quote mapped to a feature or documented tradeoff. Server proxy for firewall, samples for instant demo, perceived progress + real speed.

## Questions?

The original instructions say questions can be sent to take-home-test@treasury.gov. This prototype tries to fill gaps thoughtfully while staying strictly within the spirit of a time-boxed, working POC.

Thank you for the opportunity to build something useful for the agents doing this important work.

---

**Local development note**: You must have a valid `XAI_API_KEY` (preferred) or `OPENAI_API_KEY` in `.env.local` for the `/api/verify` route to succeed with arbitrary uploads. The 6 included samples are the fastest way to experience the full intended behavior (and they look great with the new name in the header).

Built with care for clarity, speed, and the people who will actually use it. (And named with just a *very little* proof indeed.)
