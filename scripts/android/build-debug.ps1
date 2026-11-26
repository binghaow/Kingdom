param([string]$JdkHome=$env:JAVA_HOME,[string]$SdkHome=$env:ANDROID_HOME)
$ErrorActionPreference='Stop'
if(!$JdkHome -or !$SdkHome){throw 'Set JAVA_HOME and ANDROID_HOME to installed JDK 21 and Android SDK (platform 36, build-tools 36.0.0). Use ASCII paths on Windows.'}
$repoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $repoRoot
try {
  & npm.cmd run android:prepare
  if($LASTEXITCODE -ne 0){throw 'Android asset preparation failed'}
  & node scripts/android/check.cjs
  if($LASTEXITCODE -ne 0){throw 'Offline entry checks failed'}
  # Unique ASCII stage avoids Java/Gradle launcher failures on the OneDrive Chinese path.
  # No previous stage or authored project is deleted.
  $stageRoot=Join-Path $env:TEMP ('frontier-apk-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $stageRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $repoRoot 'android') -Destination $stageRoot -Recurse
  $capTarget=Join-Path $stageRoot 'node_modules/@capacitor'
  New-Item -ItemType Directory -Force $capTarget | Out-Null
  foreach($capPackage in @('android','filesystem','share')){Copy-Item -LiteralPath (Join-Path $repoRoot ('node_modules/@capacitor/'+$capPackage)) -Destination $capTarget -Recurse}
  $env:JAVA_HOME=$JdkHome; $env:ANDROID_HOME=$SdkHome
  $env:ANDROID_USER_HOME=Join-Path $env:TEMP 'frontier-android-user'
  $env:GRADLE_USER_HOME=Join-Path $env:TEMP 'frontier-gradle'
  & (Join-Path $stageRoot 'android/gradlew.bat') -p (Join-Path $stageRoot 'android') assembleDebug --no-daemon --console=plain
  if($LASTEXITCODE -ne 0){throw 'Gradle failed; no APK copied'}
  $artifactRoot=Join-Path $repoRoot '.local/artifacts';New-Item -ItemType Directory -Force $artifactRoot | Out-Null
  $apk=Join-Path $artifactRoot 'frontier-kingdom-0.1.0-debug.apk'
  Copy-Item -LiteralPath (Join-Path $stageRoot 'android/app/build/outputs/apk/debug/app-debug.apk') -Destination $apk -Force
  Get-FileHash -Algorithm SHA256 -LiteralPath $apk
  Write-Output "Development APK only: $apk. Not approved for public distribution; release signing and real-device gates remain. Stage: $stageRoot"
} finally {Pop-Location}
