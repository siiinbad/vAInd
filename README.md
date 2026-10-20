# vAInd

A Filipino ulam planner that runs on the user's Android phone. **No Supabase, online database, account, hosting, computer or API key is needed.** Plans, preferences, budgets, spending, pantry and price snapshots use the device's localStorage. The included AI runs on the phone. Optional public market-price checks use the phone's internet connection.

## Install the phone app

The current signed release is **`dist/vAInd-1.2.0.apk`**. Copy it to the phone, open it and tap Install. It targets **64-bit ARM Android 8.0+**, including the Redmi Note 14 family, and needs an up-to-date Android System WebView. Allow your chosen file manager to install the APK if Android asks. No computer connection, certificate installation or server address is part of normal app use.

Export a backup from Preferences before updating. **Install over the existing vAInd app; do not uninstall first.** Version 1.2.0 uses the original signing key and package ID, so Android can preserve existing local data. Uninstalling or clearing app data removes local copies.

The APK is about **494 MB** because it includes Qwen2.5-0.5B-Instruct Q4_K_M and a CPU-only llama.cpp runtime. First AI use copies and verifies the model in app-private storage. Allow about **1.2 GB free**, plus any additional space the Android installer needs. No model download is needed. Native inference starts only with at least 1.1 GiB available RAM. Physical Redmi performance and Android file-picker behavior still need testing on a real phone; the APK build, signatures, bundled assets and business logic are checked locally.

## Daily use

1. Set the month, budget (minimum **₱3,000**), number of people, city/province and food preferences.
2. Choose Often, Sometimes or Never per category. Vegetable-only mains and monggo have independent inclusion switches, so each household can choose. Avoided ingredients apply to recipes and ready-cooked dishes.
3. Create a monthly plan. Weekdays have lunch/dinner; weekends add a lighter breakfast. Main ingredients are costed for home cooking; ready-cooked ulam uses whole vendor servings. Rice is excluded.
4. Open a day to swap an allowed dish or log spending. Unspent money rolls into the remaining weighted meals. Logged meals retain their history.
5. Use the budget tracker and grocery list, enter pantry quantities, and save JSON backups or grocery CSVs through Android's file picker.

Prices are estimates for planning, not guaranteed vendor quotations. In Market prices, check observation dates and enter your own local prices. Ready-cooked prices start as unverified estimates and need your vendor's override.

## Partners and roommates without a database

Household sharing is **manual file exchange**, not live sync. Each phone owns an independent local copy.

1. On one phone, open Household, enter a display name and household name, then create a household.
2. Tap **Save household file**, save the JSON file on the device and send it using Quick Share, Bluetooth or another method you choose.
3. The other person opens **Household → Import a household file**, enters their display name and selects the received file. Their previous personal plan is kept separately.
4. After making changes, they save a new household file and send it back. Import it to receive updates.

Independent pantry changes and spending on different meals merge. When both copies change the same item, or the merged data violates plan rules, the app keeps the current copy and shows a conflict. Coordinate edits and exchange a new file, or explicitly choose **Back up & use imported copy**. That action saves your current copy before replacing it. Old/repeated files, files from the same device, other households and invalid plans are rejected. Up to 12 device identities are supported; very large histories can reach the device's storage quota first.

**Export backup & leave household** saves a backup, retains a local household recovery copy and restores your previous personal plan when valid. Leaving does not delete another person's copy. Files contain household names, food choices and spending; share only with your household. The app does not upload these files or choose a recipient. If you choose a cloud drive or messaging app when saving/sending, that destination follows your own choice and its provider's policies.

Existing plans from the previous computer-connected APK stay on the device. That connection is no longer used. Create a local household from the retained plan and exchange files to continue sharing. Old server data is left untouched; it is not copied automatically to other phones.

## Prices on the phone

The APK reads approved public **HTTPS** CDN / DA price-report pages directly through its native reader. Source configuration is `public/data/price-sources.json`; the same parsers are reused by the development refresh script. Sources retain attribution, market location, unit and actual observation date. No budget, spend log, name, location setting or plan is sent with a price check. As with any web request, the public source sees ordinary connection information such as the requesting IP address.

Checks run when the app opens or returns to the foreground if due, and approximately every six hours while it remains open. **Refresh now** requests an earlier check, with a one-minute cooldown. Android may suspend or stop the app in the background; this is not a background monitoring service.

The parser accepts supported textual market facts and structured CSV reports with explicit provenance. It follows a bounded number of report links, limits response size and time, validates redirects and rejects private hosts, HTTP and non-text responses. Many DA/CDN reports are PDFs, images or blocked pages. Those cannot be imported automatically by this parser. A successful check does not make an old observation current. If no supported rows are found, the UI reports unavailable coverage and retains the last saved prices. No missing price is invented, and ready-cooked vendor prices are not derived from raw ingredient reports.

Prices match the selected city first, then the same province/metro area. Other areas remain labelled reference estimates. Overrides stay isolated by location. New observations apply to a new/re-planned month; logged history keeps its price snapshot. Credit is shown per price; article text is not copied into the UI or stored as app content.

For development or verified CSV imports:

```bash
npm run prices:refresh
npm run prices:refresh -- --import scripts/cebu-report.example.csv --offline
```

The script writes the development public price file atomically. Users of the APK never need to run it.

## Built-in AI

The phone planner first constructs up to four complete, feasible monthly menus using the recipe catalog, exact prices/portions, budget, calendar, preferences and exclusions. The included **Qwen2.5 0.5B** model receives compact context and selects among these menus. It does not invent prices, recipes or quantities. The app validates the selected complete plan before accepting it and identifies it as **Built-in AI + budget checks**.

If only one menu is feasible, memory/storage is insufficient, inference times out or validation fails, a clearly labelled rule-based plan is used. AI runs only for generation/re-planning; ordinary calendar navigation, expense logging and price refresh do not invoke it. Monthly results are saved locally.

The engine uses bounded input, a 120-second inference deadline, up to four CPU threads, and releases inference memory afterward. The pinned model's SHA-256 is checked at build time and when preparing the private model copy. Dependencies and credits: `android/ai-dependencies.json`, `android/licenses/`. Model: Qwen, Apache 2.0. Engine: llama.cpp, MIT. There is no cloud inference endpoint.

## Storage, privacy and recovery

- `vaind:v1`: settings, monthly plans, spend logs, pantry, public price cache and location-specific overrides.
- `vaind:file-household:v1`: local household identity, original merge baseline, last received member versions and the latest valid household copy.
- `vaind:device:v1`: a random local device identity for file exchange, never sent by the app over a network.
- `vaind:personal:v1` and `vaind:disconnected:v1`: personal and household recovery copies.
- `vaind:phone-prices:v1`: public-source refresh status and timestamps.
- `vaind:recovery:v1`: damaged raw local data when recovery storage is available.

There is no server-side plan storage in the phone flow. OS/cloud app backup is disabled. The model is stored separately in app-private files. The app asks for internet access, but no broad storage, GPS, contacts or Bluetooth permission; saving/importing files uses Android's system picker. No analytics or telemetry is included. External source links open in the user's browser.

Back up through Preferences regularly, especially before updating or clearing data. Restore validates snapshots and plans before replacing the current copy. A missing/corrupt main state can be recovered from the last validated local household copy; a legacy household cache is read only as a migration recovery source. Unreadable raw data is retained when storage permits. Failed writes show an error; export immediately if storage is full. Local files are user-controlled and not encrypted by vAInd; Android's device protection and any chosen file destination apply. No remote account exists for recovery or deletion.

## Development and verification

Node 24+ is required. The browser development preview is optional:

```bash
npm start
npm test
```

Open `http://localhost:5173` for browser development. The browser can use an optional local Ollama service; the delivered Android app always uses its included native AI. Browser price checks use the development price endpoint; Android price checks do not. No npm dependencies or online database are required.

The old development server's LAN/TLS and household endpoints remain for compatibility/testing of earlier releases. The current UI never calls the old household API. These utilities are not needed by APK users and are not bundled in the APK. Historical instructions are retained separately in `docs/legacy-local-server.md`.

**108 automated checks** cover costing, input validation, calendar meals, Often/Never/Avoid, budget rollover, swaps, pantry, ready-cooked portions, saved history, AI validation/fallback, recovery, file exchange/merging/conflicts/replay protection, failed storage writes, public price parsing/refresh/cooldown/restart behavior and native HTTPS destination/type restrictions. Legacy server/TLS tests remain included; these need local loopback permission when run in a sandbox. No physical Android installation is claimed by these checks.

Build with a desktop JDK 17+, Node 24+, Make and official Android SDK packages `platforms;android-36`, `build-tools;36.0.0`, `ndk;28.2.13676358`, `cmake;3.22.1`. The pinned model/source and SDK packages already exist in this ignored development workspace.

```bash
npm run android:build
```

The script compiles the CPU ARM64 engine and Java wrapper, packages only public app/model/license resources, signs with the existing private key, verifies the signature and checks 16 KiB alignment. Outputs: `dist/vAInd-1.2.0.apk` and `.sha256`. `.env`, TLS keys, server household data and signing files are never packaged. Keep `android/.signing/` backed up privately so future updates retain the same identity. Increase manifest versionCode/versionName, package version and build output names for future releases.

Core modules: `planner.js` (business logic), `on-device-ai.js` (native AI selection/fallback), `file-household.js` (local file exchange), `household.js` (validation/merging), `phone-prices.js` and `price-reports.js` (direct phone checks), `regional-prices.js` and `price-cache.js` (location-aware observations), `startup.js` and `storage.js` (local recovery), `i18n.js` (UI text/currency/dates). Native network policy lives in `android/src/ph/vaind/app/ReportPolicy.java`.
