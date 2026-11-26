# Android offline trial

Native project: `android/`. Package ID: `com.frontierkingdom.playtest`; Android 7 / API 24 minimum, compile/target API 36. This is a development trial, not an App Store or Google Play release.

## Build

Install Node 22+, JDK 21 and Android SDK platform 36 / build-tools 36.0.0. Then:

```powershell
npm.cmd ci
npm.cmd run android:prepare
node scripts/android/check.cjs
node scripts/android/check-privacy.cjs
# JAVA_HOME and ANDROID_HOME must point to installed tools in ASCII directories.
./scripts/android/build-debug.ps1
```

Windows Chinese path workaround: the build script stages a copy under the system temporary directory, preserving source. Gradle cache and Android debug keystore also use temporary directories. Keep the test signing key safe if you need compatible updates; do not promise that a temporary debug key is a permanent public release identity. Public distribution requires a backed-up release key and the repository release gates. Never commit keystores/passwords.

Output: `.local/artifacts/frontier-kingdom-0.1.0-debug.apk`. A successful compile is not an installation, offline-gameplay, or performance pass. The script prints its unique temporary stage directory for diagnosis; old stage directories are not automatically deleted.

## Entry and feedback

`scripts/android/prepare.cjs` builds the normal game, copies `dist/client` to a dedicated generated directory, removes only the multiplayer UI entry and PWA registration from the copied HTML, and adds the trial feedback module and native file-share bridge. No simulation, art, saved-game format or existing web-game entry is modified. Generated metadata records HEAD and dirty state; a dirty build must not be described as an exact released commit.

`public/playtest.js` runs only when trial build metadata is present. Local observations are opt-in, capped at 300 records / 7 days. It observes read-only state every 15 seconds and optional main-thread long-task summaries; no automatic upload exists. Frame rate, full input latency, native crash/ANR, hardware temperatures and central retention analytics are not implemented. UI and native file sharing require real validation.

`public/download.html` is an honest preparation page with disabled download, not a release promise. Enable downloads only after a verified APK and tested hosting locations exist. [Collection and iteration plan](../docs/android-playtest-plan.md).

## Required device checks

- Install and cold-launch in airplane mode; art/audio must work without a prior online run.
- Start a match, pause/background/resume, save, kill process, cold-launch and restore.
- Portrait/landscape, small phone/tablet, Chinese/English, keyboard and system back, controls and feedback modal.
- Consent off/on, clear history, share a report with a real Android receiving application; inspect received file.
- Upgrade with the same signer and preserve saves; uninstall is not an upgrade.
- Representative busy battle: measure input response and frame-time distribution on device with and without consent, recording quality/power-saver settings.
- Download/update on actual US and mainland-China networks. No conclusion about either region follows from a local Windows browser.
