param(
    [string]$TargetFile = (Join-Path $PSScriptRoot '../apidef-website/src/assets/openapisnippet.min.js')
)

$ErrorActionPreference = 'Stop'
$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TargetFile)
$sourcePath = Join-Path $PSScriptRoot 'dist/openapisnippet.min.js'

Push-Location $PSScriptRoot
try {
    $revision = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the snippet revision.' }
    $changes = git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the snippet working tree.' }
    $lock = Get-Content -LiteralPath 'package-lock.json' -Raw | ConvertFrom-Json
    $sampler = $lock.packages.'node_modules/openapi-sampler'

    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Installing locked dependencies failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The bundle build or browser smoke test failed.' }

    $digest = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $stagedPath = "$targetPath.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        Copy-Item -LiteralPath $sourcePath -Destination $stagedPath
        $copyDigest = (Get-FileHash -LiteralPath $stagedPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($copyDigest -ne $digest) { throw 'The bundle copy differs from the tested file.' }
        if ([System.IO.File]::Exists($targetPath)) {
            [System.IO.File]::Replace($stagedPath, $targetPath, $null)
        } else {
            [System.IO.File]::Move($stagedPath, $targetPath)
        }
    } finally {
        if (Test-Path -LiteralPath $stagedPath) { Remove-Item -LiteralPath $stagedPath }
    }

    [ordered]@{
        snippetRevision = $revision
        sourceModified = [bool] $changes
        samplerVersion = $sampler.version
        samplerSource = $sampler.resolved
        sha256 = $digest
    } | ConvertTo-Json
} finally {
    Pop-Location
}
