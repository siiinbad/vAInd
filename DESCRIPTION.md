# vAInd — Filipino Ulam Meal Planner

**vAInd helps individuals, couples, families and roommates plan a month of Filipino viands within a household budget.** It combines familiar dishes, location-aware price estimates, spending records and built-in AI in an Android app that runs on the user's phone.

The app uses device storage for plans and household information. No account, online database, hosting, computer connection or AI API key is required for normal Android use.

## Monthly Meal Planning

Users select a month, a monthly viand budget of at least **₱3,000**, household size and location. The app schedules lunch and dinner on weekdays, with breakfast added on weekends. Breakfast receives a lighter budget allocation.

Meals can be home-cooked, ready-cooked or a mixture of both. Home-cooked estimates cover main ingredients and exclude rice and condiments. Ready-cooked estimates use the vendor's complete ulam serving price, with rice excluded.

Food preferences use **Often**, **Sometimes** and **Never** for chicken, pork, beef, fish, shellfish, vegetables and others, including egg, tofu, monggo and canned sardines. Vegetable-only mains and monggo have separate inclusion switches. Users can also specify ingredients to avoid.

The planner favors variety, avoids consecutive dish or protein repeats and places more expensive pork and beef meals mostly on weekends. Infeasible budgets or food choices produce feedback so users can adjust their settings.

## Built-in AI

The app first creates complete monthly menu options that satisfy its costing and meal rules. An included **Qwen2.5 0.5B** model runs on the phone to select among these options. Prices, portions, exclusions and budget totals are validated before a plan is accepted.

AI runs when creating or re-planning a month. Results are saved locally. If AI cannot finish, or only one feasible menu is available, the app provides a clearly labelled rule-based plan.

## Market Prices and Budget Tracking

Public price reports from Cebu Daily News / Presyo Merkado and the Department of Agriculture provide supported market observations. Prices match the selected city first, then the same province or metro area; missing local coverage is labelled as reference estimates. Each price shows its source and date, and users can enter local overrides.

The phone checks public reports when due on opening or returning to the app, and approximately every six hours while the app remains open. These checks need internet access. Blocked, image-only or unsupported reports leave saved prices unchanged. Ready-cooked serving prices begin as estimates and should be replaced with actual vendor prices.

Users can log actual spending per meal. Unspent money rolls into the remaining meal allowance, while logged meals retain their history. Grocery lists combine remaining meal requirements, subtract pantry quantities for home cooking and separate ready-cooked purchases.

## Main Screens

- **Preferences:** household details, budget, location, food choices and backup controls.
- **Meal calendar:** monthly meals with food-category filters and planner labels.
- **Day detail:** ingredient quantities, estimated costs, allowed swaps and spending entry.
- **Budget tracker:** planned costs, actual spending and remaining allowances.
- **Grocery list:** shopping requirements, pantry adjustments and CSV export.
- **Market prices:** dated observations, source credits and local price overrides.
- **Household:** create a local household and exchange household files.

## Sharing, Storage and Privacy

Partners and roommates share changes by exporting and importing household JSON files. Users can transfer these files through Quick Share, Bluetooth or another method they choose. **Updates appear after import; sharing is manual rather than live synchronization.** Independent edits merge, while conflicting changes are retained for review.

Plans, preferences, spending, pantry entries and price snapshots remain in localStorage on each device. Built-in AI runs locally, and public price checks do not send household plans or spending. The app includes no analytics or tracking.

Users should export backups regularly. Clearing app data or uninstalling can remove local records. Exported files contain household information and should be shared only with intended recipients.

## Android Availability

The current release is **vAInd 1.2.0**, delivered as an APK for **64-bit ARM Android 8.0 or newer**, with an up-to-date Android System WebView. The included AI model makes the APK approximately **494 MB**; allow roughly **1.2 GB free space**, plus any additional installation space Android requires.

Planning works offline with saved prices. Fresh public price checks require internet access, and market coverage is not guaranteed. Installation, performance and file-picker behavior still need verification on a physical phone.
