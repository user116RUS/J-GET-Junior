$ErrorActionPreference = 'Stop'
$qaRoot = Join-Path $env:RUNNER_TEMP 'jget-native-qa'
$installRoot = Join-Path $env:LOCALAPPDATA 'Programs/ScratchJr-Classroom'
$evidence = Join-Path $PWD 'artifacts/evidence'
New-Item -ItemType Directory -Force $qaRoot, $installRoot, $evidence | Out-Null
foreach ($folder in @('Documents', 'Profile', 'Local')) { New-Item -ItemType Directory -Force (Join-Path $qaRoot $folder) | Out-Null }
Start-Transcript -Path (Join-Path $evidence 'verification.log')
try {
    $installer = (Resolve-Path 'artifacts/J-GET-Junior-Setup.exe').Path
    $p = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Installer exit code $($p.ExitCode)" }
    $exe = Join-Path $installRoot 'app/J-GET-Junior.exe'
    if (!(Test-Path $exe)) { throw 'Installed executable missing' }
    $app = Join-Path $installRoot 'app/resources/app'
    $manifest = Get-Content (Join-Path $app 'package.json') -Raw | ConvertFrom-Json
    $registryPath = 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Uninstall/ScratchJr-Classroom'
    if ((Get-ItemProperty $registryPath).DisplayName -ne 'J-GET Junior') { throw 'Installed product registration missing' }
    $standardProjects = Join-Path $env:LOCALAPPDATA 'ScratchJr-Classroom/Projects'
    New-Item -ItemType Directory -Force $standardProjects | Out-Null
    $sentinel = Join-Path $standardProjects 'release-test-sentinel.txt'
    [IO.File]::WriteAllText($sentinel, 'Preserve user project library')
    $sentinelHash = (Get-FileHash $sentinel -Algorithm SHA256).Hash
    if ($manifest.productName -ne 'J-GET Junior' -or $manifest.version -ne '1.3.2-jget.1') { throw 'Incorrect installed product/version' }
    $env:NODE_PATH = Join-Path $app 'node_modules'
    foreach ($test in Get-ChildItem 'test/*.js') {
        & node --experimental-vm-modules $test.FullName
        if ($LASTEXITCODE -ne 0) { throw "Regression failed: $($test.Name)" }
    }
    # Instrument only this disposable installed copy; downloaded installer remains intact.
    $shim = Join-Path $app 'es6-shim.js'
    $original = [IO.File]::ReadAllText($shim)
    $bootstrap = [IO.File]::ReadAllText((Resolve-Path 'test/native/bootstrap.js'))
    [IO.File]::WriteAllText($shim, $bootstrap + "`n" + $original, (New-Object Text.UTF8Encoding($false)))
    Copy-Item 'test/native/renderer.js' (Join-Path $qaRoot 'renderer.js')
    $env:JGET_QA_ROOT = $qaRoot
    foreach ($phase in @('create', 'reopen')) {
        if ($phase -eq 'reopen') {
            $savedDatabase = Join-Path $qaRoot 'Local/ScratchJr-Classroom/Projects/scratchjr.sqllite'
            $savedHash = (Get-FileHash $savedDatabase -Algorithm SHA256).Hash
            $upgrade = Start-Process -FilePath $installer -ArgumentList '/S' -Wait -PassThru
            if ($upgrade.ExitCode -ne 0) { throw 'Repeat installation failed' }
            if ((Get-FileHash $savedDatabase -Algorithm SHA256).Hash -ne $savedHash) { throw 'Repeat installation modified project data' }
            if ((Get-FileHash $sentinel -Algorithm SHA256).Hash -ne $sentinelHash) { throw 'Repeat installation modified standard project data' }
            [IO.File]::WriteAllText($shim, $bootstrap + "`n" + $original, (New-Object Text.UTF8Encoding($false)))
        }
        $env:JGET_QA_PHASE = $phase
        $p = Start-Process -FilePath $exe -ArgumentList '--disable-gpu','--mute-audio' -PassThru -RedirectStandardOutput (Join-Path $evidence "$phase.stdout.log") -RedirectStandardError (Join-Path $evidence "$phase.stderr.log")
        if (!$p.WaitForExit(240000)) { $p.Kill(); throw "Native $phase timed out" }
        if ($p.ExitCode -ne 0) { throw "Native $phase exit code $($p.ExitCode)" }
        $result = Get-Content (Join-Path $qaRoot "$phase.json") -Raw | ConvertFrom-Json
        if ($phase -eq 'create') {
            if (!$result.readyForClose -or !(Test-Path (Join-Path $qaRoot 'native-close.txt'))) { throw 'Native close/save was not completed' }
        } elseif (!$result.pass) { throw 'Reopened project did not pass' }
    }
    $db = Join-Path $qaRoot 'Local/ScratchJr-Classroom/Projects/scratchjr.sqllite'
    $beforeUninstall = (Get-FileHash $db -Algorithm SHA256).Hash
    $uninstaller = Get-ChildItem $installRoot -Filter '*uninstall*.exe' | Select-Object -First 1
    if (!$uninstaller) { throw 'Uninstaller missing' }
    $p = Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Uninstaller exit code $($p.ExitCode)" }
    for ($attempt=0; $attempt -lt 30 -and (Test-Path $exe); $attempt++) { Start-Sleep -Seconds 1 }
    if (Test-Path $exe) { throw 'Uninstaller left the application executable' }
    if (Test-Path $registryPath) { throw 'Uninstaller left its registry entry' }
    if ((Get-FileHash $sentinel -Algorithm SHA256).Hash -ne $sentinelHash) { throw 'Uninstall modified the standard project library' }
    if ((Get-FileHash $db -Algorithm SHA256).Hash -ne $beforeUninstall) { throw 'Uninstall modified the project library' }
    @{passed=$true;product=$manifest.productName;version=$manifest.version;os=[Environment]::OSVersion.VersionString;architecture=$env:PROCESSOR_ARCHITECTURE;installerSha256=(Get-FileHash $installer -Algorithm SHA256).Hash;regressionPrograms=12;nativePhases=@('create','reopen');repeatInstallPreservedLibrary=$true;uninstallPreservedLibrary=$true} | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'summary.json')
} finally {
    Get-ChildItem $qaRoot -File -ErrorAction SilentlyContinue | Where-Object { $_.Extension -in @('.json','.txt') } | Copy-Item -Destination $evidence
    Stop-Transcript
}
