# Android trial draft validation — 2026-11-26

Status: development draft; not published, not approved for public download. GitHub main fetched at d1dfb30. Sites version 73; live expansion.js, network-ui.js, painted-architecture.js normalized text matches main. Existing audio draft work preserved in the original checkout.

## Completed checks

- Native web preparation / Capacitor sync: PASS, all normal client assets bundled, existing game HTML unchanged. Normal client build size measured locally: 445 files / 85.0 MiB before native packaging.
- `node scripts/android/check.cjs`: PASS local entry dependencies, no hosted game URL/network UI/PWA registration, simulation/control/panda scripts unchanged, backup disabled and network-permission removal declared.
- `node scripts/android/check-privacy.cjs`: PASS mocked runtime consent default-off, bounded buffer, error-detail omission, worker snapshot session stability, explicit export, clear/revoke. This is not an Android device or browser result.
- `node --check public/playtest.js`, existing browser syntax check: PASS.
- Normal core/client build, `node check-artifact.cjs`: PASS, Worker/D1 and generated core bundle remain valid.
- Existing core bundle/replay/worker checks: PASS deterministic recorded checksums; initial browser portion needed Playwright installation and explicit host browser path. Consistency page finally PASS on headless Chromium desktop and phone portrait viewport (not physical phone), three recordings match. Initial sandbox denied loopback; rerun outside sandbox passed.
- Existing gameplay/collision/building matte/gait-cache/AI phase 1/phase 2 and doctrine checks completed successfully. The broader check-all continuation was deliberately interrupted during additional AI scenarios because this is an unreleased draft with outstanding UI/device gates; it is NOT a completed check-all pass. No full release-check/performance report for this new feature is claimed.

## UI and device limits

Applied repository `skills/frontier-ui-audit/SKILL.md` and its standing checks. Supported IAB preview failed to attach; Chrome browser automation was unavailable; native Chrome window could not be activated. Therefore no visual sign-off, screenshot, multi-selection/HUD regression, Chinese/English viewport coverage or feedback UI interaction pass is claimed. Local browser server availability is not UI validation.

Android cold-start airplane mode, native sharing, upgrade/save persistence, background/audio/back-button behavior and busy-scene performance have not been tested on device. iOS untouched. Main-thread long-task summaries are not FPS, native crash/ANR or complete input latency. Consent-off has no observation timer; consent-on is read-only sampling every 15 seconds, bounded storage, no per-frame wrappers. Actual performance overhead still requires device comparison.

## Release blockers

UI audit and Android device checks; permanent release signing/backup; asset redistribution and dependency license review; real mainland-China/US download and feedback reception; actual APK checksum/download URLs; repository release gates. The download page explicitly states preparation and disables download. No analytics/feedback backend or automatic upload exists, so no central dashboard or retention measurement is claimed.
