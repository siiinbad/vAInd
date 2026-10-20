# Legacy development-server guide (v1.1.1 and earlier)

These instructions describe the older computer-hosted household flow. The current Android APK uses device storage and manual household file exchange. It does not use these household APIs, computer addresses or local certificates. Use the main README for current installation and privacy information. This file is retained only for maintaining the old development tools.

# vAInd

A local Filipino ulam planner with household location and food choices. Includes monthly planning, budget rollover, meal swaps, automatic ingredient-price checks, pantry-aware grocery lists, CSV downloads, and local backup/restore. No cloud hosting, accounts, analytics, database service, or npm dependencies. The browser app needs no build step; the Android APK has a separate build. Personal mode uses browser storage; optional shared households also use a private file on your local server.

## Android APK with built-in AI

The current phone app is **`dist/vAInd-1.1.1.apk`**, signed with the same private local key as 1.0.0. It includes a **Qwen2.5-0.5B-Instruct Q4_K_M** language model and a CPU-only llama.cpp engine. No computer, Ollama, API key, account or internet connection is required for AI planning. The browser app still uses the optional local Ollama gateway described below.

This build targets **64-bit ARM Android 8.0+**, including the Redmi Note 14 family, with an up-to-date Android System WebView. Actual speed depends on the phone's RAM, processor, thermals and other running apps; Redmi hardware timing has not been measured. Native inference starts only with at least 1.1 GiB of available RAM and falls back clearly if memory is low. The model file is **491,400,032 bytes** (about 491 MB decimal / 469 MiB), making the APK much larger than the original shell. First use copies and verifies the included model into app-private storage; allow roughly **1.2 GB free space** for installation/preparation, with additional installer space possibly needed by Android. There is no separate first-run model download.

1. Copy `dist/vAInd-1.1.1.apk` to the Android phone, open it and tap **Install**. If asked, allow that file manager to install this APK. Install over the previous vAInd APK to preserve its local data; do not uninstall first. Export a backup before updating.
2. Open vAInd and save your location, budget and food choices. Keep the app open while **Planning with built-in AI…** appears. The first plan also prepares the model. Later saved months open directly without AI inference.
3. The badge **Built-in AI + budget checks** means the bundled model selected a validated monthly menu. **Rule-based planner** means no AI choice was accepted; the message explains unavailable AI, low memory, storage limits or only one distinct menu being feasible.
4. To move a browser plan, export a JSON backup from its Preferences and restore it in the APK. The browser and APK have separate storage. Uninstalling or clearing app data removes the phone's local copy; export backups first.

### What the phone AI actually does

This is an explicitly labelled **hybrid planner**. The cost solver first constructs up to four distinct, complete monthly menus that obey portions, exact saved prices, budget, calendar, Never/Avoid settings, vegetable/monggo options and protein-repeat rules. The small language model sees the household context, price references, category counts, variety/repetition, weekday premiums, examples and costs of these options. It makes a constrained A/B/C/D decision using its actual model logits. It does **not** generate or rewrite recipes, prices, ingredient quantities or an unrestricted full-month JSON document. The selected complete plan is validated again before saving. This bounded task keeps phone inference practical and prevents the model from weakening budget or food rules. If there is only one distinct feasible option, the app identifies that result as rule-based instead of claiming an AI decision.

Native inference runs on one background worker, with at most four CPU threads, a 2,048-token context and a 120-second native deadline. Preparation has a separate bridge timeout. Cancelling/closing stops the task; the engine releases model/context memory after each decision. Cached monthly plans are not generated again unless the user explicitly re-plans or changes preferences. CPU-only operation avoids GPU-specific dependencies. The model is a general small language model, not a Filipino nutrition or allergy specialist; the catalog and application validators provide the food/cost constraints.

The model and runtime are pinned in `android/ai-dependencies.json`. The model's SHA-256 is verified during APK build and while preparing its private copy. No cloud inference endpoint or secret is embedded. Only plan data/settings remain in localStorage; the read-only model copy and optional household address use private Android storage. OS/cloud app backup is disabled. JSON backups and grocery exports use Android's file picker; no broad storage or GPS permission is requested.

### Sharing and current prices

Built-in AI works without a household host. Shared plans and automatic price refresh **still use the existing local computer server**. Run `npm run share` there, then choose its private Wi-Fi URL in **Household → Choose household computer** and use the invite flow. Keep both devices on the same trusted Wi-Fi. HTTP is unencrypted; HTTPS requires a certificate already trusted by the phone. The destination policy allows only literal private/loopback IPv4 addresses, with no credentials, paths, public hosts, DNS resolution or redirects. Leave the shared household before changing hosts.

Offline planning uses the dated bundled/saved price snapshot or user overrides. The embedded AI cannot discover today's market prices offline. A connected refresh still depends on source reports/adapters and never invents newer observations. External price-source links open in a separate browser without the native bridge.

### Rebuild the APK

Use a desktop JDK 17+, Node 24+, a C/C++ build environment with Make, and these official SDK packages: `platforms;android-36`, `build-tools;36.0.0`, `ndk;28.2.13676358`, and `cmake;3.22.1`. Install them through Android Studio / sdkmanager and review the SDK license. Set `ANDROID_SDK_ROOT` or `ANDROID_HOME`. `ANDROID_NDK_HOME` and `CMAKE` can override the NDK folder / CMake executable. These packages already exist under this development workspace's ignored `.android-sdk` folder.

Fetch the exact URLs from `android/ai-dependencies.json`, verify their SHA-256 checksums, extract the pinned llama.cpp archive into `android/vendor/llama.cpp`, and place the GGUF at `android/models/model.gguf`. Source archives/models are ignored by Git. Do not replace these with an unverified model or arbitrary native binary. The build performs no automatic dependency/model download. Then run:

```bash
npm run android:build
```

The build compiles the ARM64 JNI engine, resizes the user's original logo, bundles the public app/model/license files, compiles Java/D8, aligns the APK for 16 KiB pages and signs/verifies it. Outputs are `dist/vAInd-1.1.1.apk` and its `.sha256` checksum. Public resources are copied explicitly; `.env`, server household data and signing keys are never packaged. The original logo remains unchanged. No Gradle or cloud build service is used.

Keep **`android/.signing/`** backed up privately. Its original key/password are reused for Android updates. Missing/incomplete signing files fail safely rather than silently replacing an existing key. For future releases increase `versionCode`/`versionName` in `android/AndroidManifest.xml` and update the APK output name in the build script.

A desktop native smoke-test target uses the same model-selection C++ code: `node scripts/build-native-ai.mjs --host`, then `android/native-build/host/vaind-ai-check MODEL_PATH PROMPT_FILE OPTION_COUNT`. This verifies real inference on the development computer, not physical phone speed or Android installation. Automated tests cover the bounded menu selection, native transport, validation, fallback, saved history and host restrictions; APK signatures, assets and native ELF alignment are also inspected.

Model credit: [Qwen's official model repository](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF), Apache 2.0. Engine: [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT. License copies are included under `assets/licenses/` in the APK and `android/licenses/` in the source. Official Android build guidance: [llama.cpp Android](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md), [Android command-line tools](https://developer.android.com/tools).

## Run locally

Use **Node.js 24 or later**:

```bash
npm start
```

Open **http://localhost:5173**. Stop with Ctrl+C. By default the server binds only to `127.0.0.1`. Use the shared mode below for phones and partners on your Wi-Fi. `PORT` can be changed in `.env`; keep the same origin to keep access to that browser's localStorage. You do not need `npm install`.

The first visit opens setup: choose your Philippine city/municipality and province/metro area, budget, household size and food choices. Defaults are Cebu City, the current Manila month, ₱8,000, four people, all categories Sometimes, vegetable mains and monggo included, and a mix of home-cooked and ready-cooked meals. Saving setup tries local AI once and saves the result or fallback in this browser. Returning to a saved month never calls AI. **Re-plan month** or saving preferences explicitly generates a new plan. Navigating to an unsaved month leaves it empty until you create one.

## Partners, roommates and phones

Start the computer that will hold the shared household:

```bash
npm run share
```

This opts into listening on your home network (`0.0.0.0`). The console and **Household → Connect a phone** show the actual private Wi-Fi URL, such as `http://192.168.1.10:5173`. Keep this computer running, put the phones on the same trusted Wi-Fi, and open that URL in their browsers. Use the same URL each time; browser storage belongs to the full origin. The ordinary `npm start` command remains limited to the host computer. No deployment, external messaging service, router port forwarding or public tunnel is used. The app does not work across separate networks without additional infrastructure.

1. On the first device, prepare a plan and open **Household → Create shared household**. Enter a display name and household name.
2. On another phone/device, open the displayed Wi-Fi address, choose **Household → Join a household**, and enter a display name and the invite code.
3. Everyone sees and can edit the same meal plans, preferences, location-specific overrides, pantry and spend logs. A household supports up to 12 member connections. Membership does not automatically change meal portions: set **People at the table** to the actual number of eaters.

Invites expire after seven days. **Replace invite code** invalidates the previous invite without disconnecting current members. Anyone with a valid code can join and edit, so share it with your household only. Each connection receives a private membership token; it stays in that browser and is never embedded in URLs, exported plan backups, or shared plan data. Tokens are stored as hashes on the server; write requests require membership, matching origins and a current revision. Join/create attempts are rate limited.

Changes sync after edits and every ten seconds while the app is visible and no form/dialog is being edited. Independent edits, such as logs for different meals, merge automatically. If two members change the same item, syncing pauses and retains the device copy. **Export backup**, then **Use shared version** to resolve the conflict. Combined edits that no longer validate also require review. Pending edits survive a reload and retry when the server returns. The interface distinguishes synced, pending, offline and conflict states. Background mobile browsers may pause timers, so keep the app open or use **Sync now**.

Before creating/joining, your personal plan is saved separately on that device. **Leave & use personal plan** revokes this connection and restores that saved plan. Other household members keep the shared data. Sync pending edits before leaving; leaving never silently discards them. A revoked connection can export its local copy before returning to personal mode and joining again.

### Install vAInd on phones using your logo

Your original artwork is kept at `public/logo/AI.png`. The sidebar, favicon, Android/PWA launcher icons and Apple home-screen icon use this logo. The generated 48px, 180px, 192px and 512px PNGs are size exports of the supplied artwork; the original file remains unchanged.

Before changing the app’s URL, **export your personal plan from the existing HTTP app**. HTTP and HTTPS are separate browser storage origins. On HTTPS, restore that backup or join the existing shared household again; shared data on the host server remains available. Do not clear the old origin’s browser data until you have checked the new copy.

Stop the running vAInd server with Ctrl+C, then run:

```bash
npm run mobile
```

This needs **OpenSSL** on the host (already available in the development environment). It prepares a private local CA and a server certificate under `.vaind/tls`, then starts the HTTPS household app. The server certificate covers localhost, loopback and the computer’s current private IPv4 addresses. The terminal prints the CA’s SHA-256 fingerprint, the secure app URLs, and a **START HERE** HTTP phone setup URL, normally on port 5174.

1. Put the phone on the same trusted Wi-Fi and open the printed **START HERE** setup URL. The setup server serves only the installation page, public certificate, logo and required static scripts; it exposes no household APIs, membership tokens or private keys.
2. Compare its certificate fingerprint with the host terminal. Download and **personally approve** the public certificate in the phone’s settings. Trusting a CA permits its key holder to sign certificates accepted by that device, so keep the CA’s private key private and only trust your own household’s host. Nothing is automatically installed in OS or browser trust stores.
3. **Android:** use the device’s certificate settings to install the downloaded certificate as a CA, then open the secure app in Chrome and choose **Install app** / **Add to Home screen**. Manufacturer menus vary and managed devices may block user CAs. **iPhone/iPad:** install the downloaded profile, enable trust for **vAInd Local Household CA** under certificate trust settings, then open the secure app in Safari and use **Share → Add to Home Screen** (enable **Open as Web App** if offered).
4. Open **Household** in the secure app to join your partner/roommates. Compatible Chromium browsers also show an **Install vAInd** button when installation is offered.

The app’s **Household → Set up installation on this phone** link opens the same guide. The guide also explains backup/export before switching origins, explicit trust approval, browser installation, and how to remove the local CA when you stop using this server. Verify certificates properly; do not bypass browser certificate warnings.

Official guidance: [PWA installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [Apple certificate trust](https://support.apple.com/en-gb/102390), [iPhone web apps](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), and [Android certificate settings](https://support.google.com/pixelphone/answer/2844832?hl=en).

Phone screens use bottom navigation, readable meal lists and larger touch controls. A manifest and service worker support a standalone home-screen app and offline app loading after the first trusted secure visit. Household API responses and credentials never enter the service-worker cache. Cached prices retain their dates and offline planning falls back to rules. The host computer must be running for shared updates and fresh prices. This remains a local web app; no hosting, public tunnel or app-store publishing is performed.

Certificates are reused across restarts. When the LAN address changes, restart `npm run mobile` to renew the server certificate using the existing CA. Reserve the host’s address in your router if you want installed app URLs to stay stable. The CA lasts one year and the server certificate lasts 90 days; server certificates renew near expiry. An expired/incomplete CA fails clearly and is never silently replaced. If a CA needs replacement, retain your private backup, choose a new `MOBILE_TLS_DIR`, and approve the new fingerprint on each device.

The setup-only HTTP port defaults to `PORT + 1`; set `INSTALL_PORT` to choose another. Its public certificate download is intentionally available before certificate trust is configured. Keep household data on the HTTPS app. No firewall, router, system trust store or browser security settings are changed by the setup script.

You can still supply separately managed trusted certificates through `.env` and use `npm run share`:

```dotenv
TLS_CERT=/absolute/path/to/certificate.pem
TLS_KEY=/absolute/path/to/private-key.pem
```

`npm run mobile` uses its own generated certificate directory. A separately configured `TLS_CA_CERT` can expose the public CA in the guide only if it directly signs the configured server certificate; a bundled private key is never included in the download. Install prompts and manufacturer certificate settings still require action on the actual phone. Physical Android/iOS installation has not been verified in this development environment; automated tests verify the TLS chain, IP SANs, certificate reuse/renewal, public-only setup surface and launcher icon dimensions.

### Shared storage and recovery

Version 1.1.1 fixes four recovery/planning problems. Missing, unreadable or invalid device state is recovered from the last validated household cache before sync starts, so a system reset is never uploaded as intentional month deletion. The latest damaged raw local copy is retained under `vaind:recovery:v1` when storage permits; writes refuse to replace unreadable data if its recovery copy cannot be stored. Recovering a cache may lose unreadable edits newer than that cache, so the notice asks you to sync or restore a backup. Invalid in-memory shared data also blocks uploads.

If the old computer cannot be reached or its Wi-Fi address changed, choose **Household → Export & disconnect this device**. The export must complete (Android) or be requested (browser) before local disconnection. A separate credential-free recovery copy of the current household, including pending edits, remains under `vaind:disconnected:v1`; **Download household recovery copy** stays available afterward. The app restores the previous personal plan when valid. It does not clear local data if storing the recovery copy fails. You can then choose the computer's new address and rejoin. This offline path cannot revoke the old server membership, which still occupies a connection slot; the ordinary online Leave action continues to revoke membership.

Current public price books merge by product and observation location. Newer cached reports survive reopening the APK offline or contacting a host with older data. Equal-date corrections from a newly received report win; source dates are preserved, new products are added, and saved monthly price snapshots/area overrides are retained. Never and Avoid changes apply to unlogged meals while logged meals retain exact validated costs and quantities as history. Removing such a meal's spend log schedules an allowed replacement before saving.

Personal plans/cache use `vaind:v1` in localStorage. Shared connection/base revision use `vaind:household:v1`; the previous personal plan uses `vaind:personal:v1`. Changing browsers or clearing storage removes that device’s membership, but does not erase the server copy. Rejoin with an invite from a remaining member.

Shared mode is an intentional extension of the original localStorage-only requirement: **the local host also stores shared plans, member names, hashed membership tokens and invite codes in `.vaind/households.json`**, with restricted file permissions and atomic writes. The previous file is retained as `.vaind/households.backup.json`. Keep the whole private `.vaind` directory backed up; it is excluded from Git and never served as an asset. `HOUSEHOLD_DATA_DIR` can select another private directory. Run one vAInd server process against a data directory; revision checks serialize changes within that process.

For disk recovery, stop the server, retain the damaged file separately, restore a known-good copy of the private data directory (or its previous `households.backup.json` as `households.json`), then restart. Browser plan exports restore content rather than membership credentials. Clearing one browser does not delete the household file. This local design has no cloud recovery service.

## Assumptions implemented

- A small local Node server calls local Ollama; free local inference, with no key required. Optional inference-service authentication stays in the server environment.
- Rice is always excluded. Home-cooked meals cost main ingredients only and exclude condiments. Ready-cooked meals cost the complete vendor ulam serving price, including preparation and condiments; no raw ingredient cost is added.
- Preferences have Often / Sometimes / Never, defaulting to Sometimes. Often has three times the base preference weight; affordability and protein variety can constrain the final frequency.
- **Include vegetable-only mains** and **Include monggo dishes** are independent household checkboxes in Preferences. Both are enabled for new users. Disable the first to exclude utan Bisaya, pinakbet/pakbet, ginisang repolyo and ginisang sayote; disable the second to exclude both monggo recipes. These choices apply to rule-based plans, AI choices, validation and swaps. Vegetables can still accompany meat/fish dishes. Never and Avoid take priority; setting vegetables to Never also excludes vegetable ingredients in other dishes. Older saved profiles keep their previous exclusions, so the original personal profile still excludes both until explicitly changed.
- Existing saved menus migrate automatically on load or backup restore. Unlogged meals are regenerated using the saved budget and prices; logged meals/spend remain immutable history, even if a logged dish is now excluded. If the narrower menu no longer fits, the old snapshot is retained for recovery but its menu is hidden until you adjust the budget/preferences.
- Avoid is a comma-separated ingredient/name exclusion, separate from preferences. It matches whole words/phrases, with simple plural normalization, across dish, protein, category, ingredient IDs and ingredient display names. For example, `egg` excludes eggs but not eggplant; review the displayed dishes before shopping. This is not an allergy safety certification; check condiments, labels and cross-contact yourself.
- Home-cooked breakfast portions and budget weights are 0.6 of lunch/dinner. Ready-cooked breakfast servings use `ceil(household × 0.6)` whole vendor servings, shared across the household. Normal catalog portions stay fixed; an infeasible budget gets an error with the cheapest feasible total rather than hidden portion reduction.
- Pork and beef are favored on weekends using their actual price-list costs; there is no artificial two-times price multiplier.

## Free local AI

Install [Ollama](https://ollama.com/) and pull a local model, then keep Ollama running:

```bash
ollama pull llama3.2
ollama serve
```

If the desktop application is already serving, the second command is unnecessary. A model download needs internet, disk and sufficient RAM; subsequent inference stays local. No inference service is bundled or downloaded automatically.

Optional `.env` configuration (copy `.env.example`):

```dotenv
PORT=5173
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

`AI_API_KEY`, if your local inference service requires one, is read only by the Node server. It is never placed in browser assets, API responses or localStorage. Only loopback Ollama URLs are accepted, and redirects are rejected. The app sends budget, household, full calendar, preference/exclusion settings, price snapshot, catalog/quantities, constraints and logged meals through the local server to Ollama's [chat endpoint](https://docs.ollama.com/api/chat).

AI receives a structured JSON contract and can choose only from catalog dishes allowed by the household settings. Both server and browser recalculate all ingredient costs, verify the calendar, fixed household quantities, exact unit prices, exclusions, adjacent proteins/dishes, immutable logged meals, and budget. Invalid, unavailable or timed-out AI responses use the rule-based planner. The interface identifies the planner and explains fallback. **Live model inference was not verified in this environment**; tests exercise the HTTP gateway against a local mock service, valid output, and tampered prices.

## Prices and refresh

The local server **checks public sources on startup and every six hours** while `npm start` is running. Open browser tabs sync the server snapshot every five minutes, check again when visible, and poll more quickly while a source check is in progress. **Market prices → Refresh now** requests a check immediately (checks within one minute are coalesced). The screen shows last/next check times, per-source results, and stale/estimated coverage. Price checks never call the meal-planning AI.

Configure the server interval in `.env` and restart:

```dotenv
PRICE_REFRESH_MINUTES=360
AUTO_PRICE_REFRESH=true
```

The interval accepts 5–1440 minutes; the default is 360. No checks run when the local server is stopped. `AUTO_PRICE_REFRESH=false` disables scheduled checks; manual checks remain available. Multiple tabs share one server refresh, failures are contained, and only validated observations can replace the price file.


**Coverage is partial, not a nationwide live feed.** The single price file contains six dated Cebu observations, fifteen Metro Manila observations from the [DA NCR daily index dated October 19, 2026](https://www.da.gov.ph/wp-content/uploads/2026/10/Daily-Price-Index-October-19-2026.pdf), and a reference product list with twenty-two unverified starter estimates (fourteen ingredient prices and eight ready-cooked serving prices). Each observation retains its actual date, area and source; variants such as local kasim, medium bangus and Wonder Ball cabbage are identified in the source label. Stale means more than seven days old.

Household location is entered manually; GPS and street addresses are not collected. Selection prefers the newest report for the exact city, then the newest available report in the same province/metro area, labelled with its actual area. Without either, the app uses a clearly labelled reference/starter estimate at its original value, with no invented geographic multiplier. NCR, National Capital Region and Metro Manila are equivalent labels. Market prices also lets you preview another area without changing the household. **Overrides are stored separately for each city and province**; ready-cooked vendor prices use the same location scope.

The verified starting observations come from [CDN Digital's Presyo Merkado report for Mandaue](https://cebudailynews.inquirer.net/509909/presyo-merkado-current-prices-of-food-in-metro-cebu-markets) (July 26, 2024 observation) and [GMA Regional TV's Carbon Market report](https://www.gmanetwork.com/regionaltv/news/114055/rice-prices-drop-in-cebu-market-prices-of-meat-fish-stable/story/) (May 12, 2026). Only factual numeric observations are stored; article text and images are not redistributed.

```bash
npm run prices:refresh
```

This script and the scheduler fetch the Presyo Merkado archive, follow up to three matching article links to find newer reports, retain the known article as a fallback, and check [DA's report index](https://www.da.gov.ph/price-monitoring/) / [Region VII](https://rfo7.da.gov.ph/). Supported explicit CDN text observations and structured DA CSV rows are parsed automatically. A structured row must identify a market, province/metro area, observation date, known product and matching unit. Include the city/municipality for city-specific reports; leave it empty only for province/metro-wide reports. Legacy named Cebu/Mandaue/Lapu-Lapu and NCR markets can be inferred. Prices for the same product in different areas are stored separately; NCR observations never overwrite Cebu observations. **Arbitrary PDF/image extraction is not automated.** The national index includes NCR reports; those must never be silently relabeled Cebu. Direct CDN access returned HTTP 403 during verification. Blocked pages, changed formats, image-only reports, or unavailable sources leave existing observations unchanged. Exit code 2 means no updates and at least one unavailable source.

For other DA regional reports or image-based Presyo Merkado reports, transcribe and verify numeric facts into CSV, then gather them into the same single JSON price file:

```bash
npm run prices:refresh -- --import /path/to/verified-cebu-report.csv --offline
```

Required CSV columns are in `scripts/cebu-report.example.csv`:

```csv
id,price,unit,date,source,sourceUrl,market,province,city
```

Use an existing ingredient ID, matching unit (`kg`, `piece`, `can`, `serving`), a positive peso amount, the report's actual observation date (`YYYY-MM-DD`), a descriptive source name, its HTTPS report URL, and the actual market, province/metro area and city/municipality. Imports accept CDN, DA and GMA source domains, reject invalid/future dates or contradictory area metadata, preserve newer observations per product and area, and replace estimates when local reports are available. Writes are atomic and validation runs before replacement. Adjust `scripts/price-sources.json` to maintain supported source URLs. Never label retrieval time as observation time.

The browser syncs changes from the script automatically. **Refresh now** also fetches and syncs sources. Browser overrides are retained, resettable and isolated by location; automatic updates never replace them. New months or re-plans without logs use the latest prices. **Once a month has logged spend, its entire price snapshot remains fixed** so historical dishes and costs stay reproducible. A month with logged spending also keeps its original household location; use another month to plan for a new area. Price overrides affect future/unlogged months until that snapshot is deliberately replaced through a new plan without logs.

## Budget behavior

The minimum monthly viand budget is **₱3,000**. This is an input minimum; full-portion feasibility still depends on household size, preferences and prices. Older saved budgets remain readable as history, but new or re-planned menus must meet the minimum.

Weekdays have lunch and dinner; weekends add breakfast. Costs are summed and rounded to centavos. For home-cooked dishes, every ingredient quantity is catalog quantity × household size × meal weight, rounded to two decimals. Ready-cooked purchases use whole servings as described below. Eggs/cans can be fractional consumption quantities; groceries aggregate these and explicitly tell you to round purchases up to whole packages. Shopping pack sizes and rounding can cost more than the consumption estimate.

The planner first computes the minimum feasible continuation for every previous protein. It reserves that continuation while selecting dishes using preference frequency, affordability, weekend premiums, recipe variety and pantry hints. This avoids spending the budget early and leaving an impossible last week.

Actual spend replaces the estimate for a logged meal. Zero is valid. The tracker uses:

```text
Remaining cash = monthly budget − sum(actual logged spending)
Lunch/dinner share = remaining cash ÷ sum(weights of unlogged meals)
Breakfast share = lunch/dinner share × 0.6
Rollover = sum(planned cost − actual spend for logged meals)
```

Actual overspending is recorded honestly, even above budget. The app warns when remaining estimates no longer fit. Re-plan uses actual spend and preserves logged meals; if no affordable continuation exists it reports a conflict. Swaps verify both neighbors and the revised budget; logged meals must be unlogged before swapping. No swaps silently call AI.

Grocery lists cover unlogged meals for the whole month or days 1–7, 8–14, etc. Pantry quantities are subtracted once per displayed list and rank swaps by ingredient coverage. Pantry does not lower conservative monthly meal costs or automatically decrement when meals are logged; update pantry quantities as you use ingredients.

## Ready-cooked ulam

In **Preferences**, choose **Mix home cooking and ready-cooked ulam** (the default), **Home-cooked only**, or **Ready-cooked only**. Eight ready-cooked choices include chicken/pork adobo, bistek, paksiw, fried tilapia, scrambled eggs, tortang talong and adobong tokwa. They use the same protein identities and ingredient exclusions as their home-cooked equivalents, so buying a dish cannot bypass Never/Avoid or create consecutive protein repeats. The household’s vegetable-main and monggo options still apply.

A lunch/dinner uses one vendor serving per person. Breakfast uses `ceil(household × 0.6)` servings shared across the household, with at least one serving. Costs are **whole servings × listed serving price**. The complete vendor price already includes preparation and condiments; rice is excluded. Serving size and ingredients vary by vendor, so check them when buying.

Ready-cooked starter prices are **unverified estimates**, not current carinderia quotations. Enter your vendor's actual prices in **Market prices** before planning. Raw Cebu market-price reports cannot be used to infer a ready-cooked serving price, and automatic raw-price refreshes do not invent vendor prices. Serving-price overrides work like ingredient-price overrides and keep their own dates.

The calendar, meal details and swap choices label ready-cooked dishes. The shopping screen has separate **Main ingredients** and **Ready-cooked purchases** sections; ready-cooked purchases never generate a second raw-ingredient list and are not deducted from pantry stock. CSV exports identify the purchase type. New serving-price products are added to older snapshots without changing historical ingredient prices or logged spend. Re-plan to incorporate them in a cached monthly menu; swaps can also select them where the budget fits.

## Storage, privacy and recovery

Browser storage uses one versioned key, `vaind:v1`, for settings, preferences, monthly plans, actual-spend logs, price snapshots, overrides and pantry. Personal-only mode writes no plan data to server files. Shared households additionally use the private server file described above. Public market observations remain in the JSON price file. Clearing browser data, changing browser profiles, or changing local origin can make a plan unavailable.

Use **Preferences → Export backup** regularly. Restore validates every plan, price snapshot and settings object before replacing local data. Invalid backup files leave current data intact. Storage failures show a message and retain changes in memory for the session; export immediately in that case. The Preferences screen contains the app's plain-language local data/privacy notice. There are no analytics cookies or telemetry integrations.

## Verification

```bash
npm test
```

95 tests cover calendars/leap days, portions, budget feasibility, end-of-month variety, Often/Never/Avoid, weekend premiums, immutable logs, zero spend and rollover, constrained swaps, pantry aggregation, ready-cooked serving costs and rounding, preparation modes, ready/home swaps, underlying ingredient exclusions, snapshot upgrades, AI success/fallback/tampering, trusted regional imports, location matching/fallback, isolated overrides, independent vegetable/monggo options, legacy preference preservation, latest-report discovery, structured feed ingestion, recurring checks/deduplication, browser sync failures, menu migration with preserved spending, failed-source retention, safe static file serving and origin restrictions. Android tests cover native request transport, reload isolation, cancellation, save cancellation and private-host restrictions. Additional tests cover shared membership/token hashing, invites/expiry, persisted households, concurrent revisions, automatic merging, offline/reloaded edits, in-flight edits, conflict preservation, leaving/restoring personal plans, HTTP authorization, mobile app assets, local TLS issuance/reuse/renewal, trusted HTTPS connections, bootstrap access boundaries and phone setup metadata. HTTP tests need loopback permission if run in a sandbox.

Manual browser checks cover two separate member sessions through loopback/LAN, shared spending, desktop and mobile layouts, generation/fallback, day ingredients, spending, swaps, tracker updates, price search/override/reset, pantry quantities, input conflicts, and keyboard controls. The app uses system fonts, no remote assets, semantic forms, fieldset radio groups, visible focus, a native modal dialog, a skip link and reduced-motion support. There is no production uptime claim: `/api/health` supplies a local health check.

## Code map

- `android/` — offline Android shell, bundled native AI, file pickers, host transport and launcher resources.
- `public/core/on-device-ai.js` — feasible candidate generation, compact phone-model context, validated selection/fallback.
- `scripts/build-native-ai.mjs` — pinned CPU engine builds for Android ARM64 and desktop smoke tests.
- `scripts/build-apk.mjs` — local SDK build, private signing, signature and alignment verification.
- `public/core/android.js` — APK-only API transport and file-save adapter; browser behavior is retained.
- `server.mjs` — loopback/LAN/TLS server, shared API routes and guarded inference gateway.
- `server/local-tls.mjs`, `scripts/mobile.mjs` — private local certificate preparation and HTTPS phone launcher.
- `server/install-service.mjs`, `public/install.*` — public-only phone setup guide and certificate distribution.
- `public/core/install.js` — device guidance selection and setup-response validation.
- `server/households.mjs` — private household file store, membership, invites and revision checks.
- `public/core/household.js` — shared state validation and three-way merging.
- `public/core/household-sync.js` — per-device membership, offline edits and synchronization.
- `public/core/state-validation.js` — common backup/shared state validation.
- `public/household-view.js` — household connection and phone setup screen.
- `public/manifest.webmanifest`, `public/sw.js` — mobile app metadata and public-file offline cache.
- `public/app.js` — screens and browser interaction/state orchestration.
- `public/core/catalog.js` — recipes and per-person ingredient quantities.
- `public/core/planner.js` — pure costing, validation, scheduling, swaps and groceries.
- `public/core/ai.js` — JSON contract, browser validation and fallback.
- `public/core/storage.js` — localStorage error handling.
- `public/core/menu-migration.js` — household option migration with preserved spend/history.
- `public/core/locations.js` — location validation and normalized matching.
- `public/core/regional-prices.js` — regional observations, selection, estimates and isolated overrides.
- `public/core/ready-prices.js` — add new ready-cooked products without changing saved ingredient prices.
- `public/core/price-sync.js` — browser polling, manual checks and snapshot validation.
- `server/price-service.mjs` — scheduled source refresh, deduplication and status.
- `public/core/i18n.js` — centralized UI messages and Philippine currency/date formatters.
- `public/data/prices.json` — one dated, source-attributed price file.
- `scripts/refresh-prices.mjs` — conservative source collection and verified CSV imports.

Milestones 1, 2 and 4 are implemented. Milestone 3 includes scheduled fetching, latest CDN report discovery, the supported CDN text adapter, DA CSV auto-import and verified CSV imports; fully automatic extraction of changing DA PDFs/CDN image reports remains a source-adapter limitation.
