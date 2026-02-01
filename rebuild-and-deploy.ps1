# Rebuild openapi-snippet and deploy to apidef-website
# This script builds the minified library and copies it to the Angular app

$ErrorActionPreference = "Stop"

Write-Host "Building openapi-snippet..." -ForegroundColor Cyan

# Build the webpack bundle
npm run build:webpack

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully" -ForegroundColor Green

# Copy to apidef-website
$sourceFile = "dist\openapisnippet.min.js"
$targetFile = "..\apidef-website\src\assets\openapisnippet.min.js"

Write-Host "Copying to apidef-website..." -ForegroundColor Cyan

Copy-Item $sourceFile $targetFile -Force

if (Test-Path $targetFile) {
    $fileSize = (Get-Item $targetFile).Length / 1KB
    Write-Host "Deployed successfully! File size: $([math]::Round($fileSize, 2)) KB" -ForegroundColor Green
} else {
    Write-Host "Copy failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Done! The library has been rebuilt and deployed." -ForegroundColor Green
Write-Host "Restart your dev server to see the changes." -ForegroundColor Yellow
