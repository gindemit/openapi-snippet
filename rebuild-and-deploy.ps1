param(
    [string]$TargetFile = (Join-Path $PSScriptRoot '../apidef-website/src/assets/openapisnippet.min.js')
)

$ErrorActionPreference = 'Stop'
$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($TargetFile)
$sourcePath = Join-Path $PSScriptRoot 'dist/openapisnippet.min.js'

function Get-Sha256([string]$Path) {
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
        } finally {
            $stream.Dispose()
        }
    } finally {
        $algorithm.Dispose()
    }
}

Push-Location $PSScriptRoot
try {
    $revision = git rev-parse HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not determine the snippet revision.' }
    $changes = git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Could not check the snippet working tree.' }
    $samplerJson = node -e 'process.stdout.write(JSON.stringify(require(process.argv[1]).packages[process.argv[2]]))' './package-lock.json' 'node_modules/openapi-sampler'
    if ($LASTEXITCODE -ne 0) { throw 'Could not read the locked sampler dependency.' }
    $sampler = $samplerJson | ConvertFrom-Json

    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Installing locked dependencies failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'The bundle build or browser smoke test failed.' }

    $digest = Get-Sha256 $sourcePath
    $stagedPath = "$targetPath.$([guid]::NewGuid().ToString('N')).tmp"
    try {
        Copy-Item -LiteralPath $sourcePath -Destination $stagedPath
        $copyDigest = Get-Sha256 $stagedPath
        if ($copyDigest -ne $digest) { throw 'The bundle copy differs from the tested file.' }
        if ([System.IO.File]::Exists($targetPath)) {
            [System.IO.File]::Replace($stagedPath, $targetPath, [NullString]::Value)
        } else {
            [System.IO.File]::Move($stagedPath, $targetPath)
        }
    } finally {
        if (Test-Path -LiteralPath $stagedPath) { Remove-Item -LiteralPath $stagedPath }
    }
    if ((Get-Sha256 $targetPath) -ne $digest) { throw 'The destination differs from the tested bundle.' }

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
