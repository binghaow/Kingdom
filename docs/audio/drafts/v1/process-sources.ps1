param(
  [Parameter(Mandatory=$true)][string]$Ffmpeg
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot 'src')).Path
$project = (Resolve-Path (Join-Path $PSScriptRoot '../../../..')).Path
$out = $PSScriptRoot

function Encode-Filter([string]$name, [string]$filter, [double]$duration, [string[]]$inputs) {
  $filter = $filter.Replace('[out]', ',alimiter=limit=0.891,afade=t=in:d=0.005,afade=t=out:d=0.02[out]')
  $args = @('-hide_banner','-loglevel','error','-y')
  foreach ($input in $inputs) { $args += @('-i', $input) }
  $args += @('-filter_complex', $filter, '-map','[out]','-t', "$duration", '-vn','-ac','1','-ar','48000')
  foreach ($ext in @('ogg','m4a')) {
    $target = Join-Path $out "$name.$ext"
    $codec = if ($ext -eq 'ogg') { @('-c:a','libvorbis','-q:a','5') } else { @('-c:a','aac','-b:a','160k','-movflags','+faststart') }
    & $Ffmpeg @args @codec $target
    if ($LASTEXITCODE -ne 0) { throw "Encode failed: $name.$ext" }
  }
}

function Single-Clip([string]$name, [string]$source, [double]$start, [double]$duration) {
  $path = Join-Path $root $source
  if (-not (Test-Path -LiteralPath $path)) { $path = Join-Path $project $source }
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing source: $path" }
  foreach ($ext in @('ogg','m4a')) {
    $target = Join-Path $out "$name.$ext"
    $codec = if ($ext -eq 'ogg') { @('-c:a','libvorbis','-q:a','5') } else { @('-c:a','aac','-b:a','160k','-movflags','+faststart') }
    & $Ffmpeg -hide_banner -loglevel error -y -ss $start -i $path -t $duration -vn -af 'aresample=48000,alimiter=limit=0.891,afade=t=in:d=0.005,afade=t=out:d=0.02' -ac 1 -ar 48000 @codec $target
    if ($LASTEXITCODE -ne 0) { throw "Encode failed: $name.$ext" }
  }
}

$public = Join-Path $project 'public/audio'
$chop = Join-Path $public 'chop.ogg'
$hornA = Join-Path $public 'charge-horn-a.wav'
$hornB = Join-Path $public 'charge-horn-b.wav'
$treeFall = Join-Path $root 'chop-tree-fall.ogg'
$treeCreak = Join-Path $root 'tree_creak.ogg'
$pick = Join-Path $root 'mining-pick.wav'

# Existing one-take axe recording is the anchor. Each variation layers a different
# CC0 physical wood crack/hit; no pitch/time synthesis is applied.
foreach ($i in 1..5) {
  $n = $i.ToString('00')
  $wood = Join-Path $root "wood-metal/wood_hit_$n.ogg"
  $crackNumber = '{0:D2}' -f ($i % 4 + 1)
  $break = Join-Path $root "wood-metal/wood_breaking_$('{0:D2}' -f (($i - 1) % 2 + 1)).ogg"
  $filter = '[0:a]atrim=duration=0.24,asetpts=PTS-STARTPTS[axe];[1:a]atrim=duration=0.32,asetpts=PTS-STARTPTS,adelay=55|55[hit];[2:a]atrim=duration=0.42,asetpts=PTS-STARTPTS,adelay=105|105[break];[axe][hit][break]amix=inputs=3:duration=longest:weights=1 0.7 0.35:normalize=0,aresample=48000[out]'
  Encode-Filter "chop_$n" $filter 0.55 @($chop,$wood,$break)
}

# Mining strikes: four distinct transients isolated from the CC-BY field recording;
# the fifth is a rock-break Foley candidate, explicitly not a separate pick take.
$pickCuts = @(@(0.455,0.22),@(1.530,0.29),@(2.550,0.22),@(3.535,0.20))
for ($i=0; $i -lt 4; $i++) { $c=$pickCuts[$i]; Single-Clip "mine_stone_$('{0:D2}' -f ($i+1))" 'mining-pick.wav' $c[0] ([Math]::Max(0.4,$c[1])) }
Single-Clip 'mine_stone_05' 'rock_break.ogg' 0.00 0.42

# Metal layers make the four gold candidates brighter. The base pick remains real;
# they are layered editorial variants, not four gold-mining field recordings.
$metalStarts = @(0.455,1.530,2.550,3.535)
for ($i=0; $i -lt 4; $i++) {
  $n = $i + 1; $metal = Join-Path $root "wood-metal/metal_hit_0$n.ogg"; $s=$metalStarts[$i]
  $filter = "[0:a]atrim=start=${s}:duration=0.28,asetpts=PTS-STARTPTS[p];[1:a]atrim=duration=0.32,asetpts=PTS-STARTPTS,adelay=25|25[m];[2:a]atrim=duration=0.30,asetpts=PTS-STARTPTS,adelay=120|120[r];[p][m][r]amix=inputs=3:duration=longest:weights=1 0.55 0.35:normalize=0,aresample=48000[out]"
  Encode-Filter "mine_gold_$('{0:D2}' -f $n)" $filter 0.55 @($pick,(Join-Path $root "wood-metal/metal_hit_0$n.ogg"),(Join-Path $root 'rock_break.ogg'))
}
$rubbleFilter='[0:a]asetpts=PTS-STARTPTS[a];[1:a]asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1,aresample=48000[out]'
Encode-Filter 'rubble_01' $rubbleFilter 1.1 @((Join-Path $root 'boulder_drop.ogg'),(Join-Path $root 'rock_break.ogg'))
Encode-Filter 'rubble_02' $rubbleFilter 1.1 @((Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'))

# Recorded tree falls; the second clip combines recorded creak, crack and fall Foley.
Single-Clip 'tree_fall_01' 'chop-tree-fall.ogg' 0.00 2.67
$fall2 = Join-Path $root 'wood-metal/wood_falling_02.ogg'
$filter = '[0:a]atrim=duration=1.9,asetpts=PTS-STARTPTS[creak];[1:a]atrim=duration=0.65,asetpts=PTS-STARTPTS,adelay=2100|2100[fall];[creak][fall]amix=inputs=2:duration=longest:weights=0.7 1:normalize=0,aresample=48000[out]'
Encode-Filter 'tree_fall_02' $filter 2.7 @($treeCreak,$fall2)

# Three recorded bows and one fourth real take from the available longbow draw/release sequence.
Single-Clip 'bow_release_01' 'archery-source/English Longbow Shoot.wav' 0.00 0.50
Single-Clip 'bow_release_02' 'archery-source/Scythian Recurve Shoot.wav' 0.00 0.50
Single-Clip 'bow_release_03' 'archery-source/Crossbow Shoot.wav' 0.00 0.50
Single-Clip 'bow_release_04' 'archery-source/English Longbow Shoot.wav' 0.15 0.50
Single-Clip 'arrow_flyby_01' 'archery-source/Scythian Recurve Arrow Approach.wav' 0.18 0.50
Single-Clip 'arrow_flyby_02' 'archery-source/Scythian Recurve Arrow Pass.wav' 0.51 0.50
Single-Clip 'arrow_flyby_03' 'archery-source/Scythian Recurve Arrow Passby.wav' 0.61 0.50

# Four distinct wood impact sources, all CC0 recordings.
foreach ($i in 1..4) { $n=$i.ToString('00'); Single-Clip "building_hit_wood_$n" "wood-destruction/wood_impact/impactwood$n.mp3.flac" 0.00 0.70 }

# Stone wall impact candidates: actual rock/boulder recordings, with no artificial pitch shift.
$stoneMix = '[0:a]atrim=duration=0.64,asetpts=PTS-STARTPTS[rock];[1:a]atrim=duration=0.44,asetpts=PTS-STARTPTS,adelay=180|180[debris];[rock][debris]amix=inputs=2:duration=longest:weights=1 0.6:normalize=0,aresample=48000[out]'
Encode-Filter 'wall_hit_stone_01' $stoneMix 0.8 @((Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'))
Single-Clip 'wall_hit_stone_02' 'boulder_drop.ogg' 0.00 0.70
Encode-Filter 'wall_hit_stone_03' $stoneMix 0.8 @((Join-Path $root 'boulder_drop.ogg'),(Join-Path $root 'rock_break.ogg'))
Encode-Filter 'wall_hit_stone_04' $stoneMix 0.8 @((Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'))

# Collapse candidates are Foley montages of real timber/rock recordings, not recordings of full buildings.
$woodCollapse = '[0:a]atrim=duration=1.7,asetpts=PTS-STARTPTS[crack];[1:a]atrim=duration=0.48,asetpts=PTS-STARTPTS,adelay=1400|1400[fall];[2:a]atrim=duration=0.44,asetpts=PTS-STARTPTS,adelay=2700|2700[debris];[crack][fall][debris]amix=inputs=3:duration=longest:weights=0.8 1 0.6:normalize=0,aresample=48000[out]'
Encode-Filter 'collapse_wood_01' $woodCollapse 3.1 @($treeCreak,(Join-Path $root 'wood-metal/wood_falling_02.ogg'),(Join-Path $root 'wood-metal/wood_slam_01.ogg'))
Encode-Filter 'collapse_wood_02' $woodCollapse 3.1 @($treeCreak,(Join-Path $root 'wood-metal/wood_falling_04.ogg'),(Join-Path $root 'wood-metal/wood_slam_03.ogg'))
$stoneCollapse = '[0:a]atrim=duration=0.43,asetpts=PTS-STARTPTS[break];[1:a]atrim=duration=0.65,asetpts=PTS-STARTPTS,adelay=1100|1100[drop];[2:a]atrim=duration=0.43,asetpts=PTS-STARTPTS,adelay=2700|2700[tail];[break][drop][tail]amix=inputs=3:duration=longest:weights=0.8 1 0.7:normalize=0,aresample=48000[out]'
Encode-Filter 'collapse_stone_01' $stoneCollapse 3.1 @((Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'),(Join-Path $root 'rock_break.ogg'))
Encode-Filter 'collapse_stone_02' $stoneCollapse 3.1 @((Join-Path $root 'boulder_drop.ogg'),(Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'))
$tailFilter='[0:a]asetpts=PTS-STARTPTS[a];[1:a]asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1,aresample=48000[out]'
Encode-Filter 'collapse_rubble_tail_01' $tailFilter 1.1 @((Join-Path $root 'boulder_drop.ogg'),(Join-Path $root 'rock_break.ogg'))
Encode-Filter 'collapse_rubble_tail_02' $tailFilter 1.1 @((Join-Path $root 'rock_break.ogg'),(Join-Path $root 'boulder_drop.ogg'))

# Real recorded horn excerpts as age-up cue studies. These are not the requested
# 6–10 s orchestral completion scores; the missing drum/performance remains documented.
Single-Clip 'age_up_horn_study_01' 'public/audio/charge-horn-a.wav' 0.00 2.50
Single-Clip 'age_up_horn_study_02' 'public/audio/charge-horn-b.wav' 0.00 2.50

# One licensed cannonball impact against a fortification. The remaining two prompt
# variations are not claimed; this one source is not duplicated to pretend otherwise.
Single-Clip 'cannonball_hit_wall_01' 'cannon_hit_wall.ogg' 0.00 1.50
