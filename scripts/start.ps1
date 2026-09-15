$ErrorActionPreference = "Stop"

$morningNode = Get-Command node -ErrorAction SilentlyContinue
if ($morningNode) {
    $morningNodePath = $morningNode.Source
} else {
    $morningNodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path -LiteralPath $morningNodePath)) {
    throw "Node.js 20+ was not found. Install Node.js or update scripts/start.ps1."
}

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
    Write-Host "OPENAI_API_KEY is not set. The interface will run with AI voice offline." -ForegroundColor Yellow
}

Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
& $morningNodePath "src/server/index.mjs"
