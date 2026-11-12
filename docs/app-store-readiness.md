# App Store readiness tracker

This is a working release checklist for Frontier Kingdom's eventual iPhone/iPad TestFlight and App Store path. It does not establish legal clearance or Apple approval. Recheck current Apple requirements and the applicable asset/license terms before submission.

## Current known state

- The game is currently a browser-based HTML/JavaScript game.
- A browser link is not an iOS app build and does not demonstrate App Store readiness.
- Native packaging/build, TestFlight validation, and App Review have not been recorded as complete here.
- Asset and dependency provenance must be verified before release; do not assume that existing files are cleared for redistribution.

## Release gates

| Gate | Status | Evidence / next action |
| --- | --- | --- |
| Product name, icon, screenshots, and store copy distinct from third-party game brands | Not audited | Review branding and store listing before submission |
| Asset inventory and redistribution rights | Not audited | Record creator/source, license/terms, attribution, and redistribution permission for every shipped asset |
| Code and third-party dependency licenses | Not audited | Generate and review a dependency/license inventory |
| Privacy and data-flow inventory | Not audited | Inspect game, server, analytics, crash tools, identity, chat, and multiplayer data before writing disclosures |
| UGC/chat safety and moderation controls, if shipped | Not audited | Review current Apple requirements and verify report/block/moderation/support paths |
| Monetization and external-service review, if introduced | Not applicable yet | Reassess before adding ads, purchases, subscriptions, or external account flows |
| iOS app build and signing | Not started | Choose and document the iOS packaging approach; build with a supported Xcode environment |
| Physical iPhone/iPad testing | Not recorded | Test supported devices, portrait/landscape, audio, interruptions, reconnect, memory, battery, and thermal behavior |
| Accessibility, safe areas, and touch review | In progress for browser UI | Recheck inside the actual iOS app shell and on target devices |
| TestFlight validation | Not started | Distribute a signed build to testers after device and privacy checks |
| App Store metadata and review notes | Not started | Prepare accurate disclosures, screenshots, support/privacy links, and reviewer access instructions |
| Apple App Review | Not submitted | Submission and approval are external release gates |

## Asset and dependency register template

Add one row per shipped asset, code package, font, audio track, or other third-party component. Keep receipts, license copies, and provider terms with the project records.

| Path / package | Type | Creator / source | License or terms | Attribution required | App redistribution allowed | Evidence / notes |
| --- | --- | --- | --- | --- | --- | --- |
| public/assets/carrier-v45.png | Four-view carrier sprite | OpenAI image edit based on existing public/assets/carrier-v34.png; project author supplied the design direction | Generated/edited asset; verify provider terms for redistribution before store release | No known attribution requirement; recheck terms | Unverified for App Store redistribution | Empty-deck carrier hull; source asset retained. Visual alpha/terrain production render not verified in this task |
| `public/assets/walls-v1.png`, `public/assets/walls-v1.json` | Image (wall/gate sprite sheet) + layout index | Derived offline by `scripts/art/build_walls.py` (rectify, cut, tile, shade, composite; no generative model) from in-repo `public/assets/industry-v2.png` cells 10 (stone wall, incl. its banner with the emblem painted out), 11 (stone gatehouse arch/doors/lanterns) and 13 (palisade-gate closed doors) | Same as `industry-v2.png` (project ImageGen output per ART.md; generation-tool terms still to be registered — see docs/design art audit §5) | Same as source | Same as source (not yet confirmed) | `docs/art-review-walls.md`; rerun the script to reproduce byte-for-byte input→output |

## Per-feature review note

For changes that affect data collection, networking/chat, monetization, third-party content, audio, mobile controls, app lifecycle, memory, or device resources, record:

1. The affected behavior and data/assets involved.
2. The applicable license, privacy, safety, or platform requirement to recheck.
3. The code/test evidence collected.
4. The remaining manual, physical-device, legal, or Apple review step.

Do not mark a gate complete based only on a desktop/browser check or an undocumented assumption about a license.
