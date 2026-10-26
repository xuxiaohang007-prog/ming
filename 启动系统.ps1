[CmdletBinding()]
param(
    [switch]$InstallDependencies,
    [switch]$Development,
    [switch]$SkipBuild,
    [switch]$CheckOnly,
    [ValidateRange(1024, 65535)][int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-Npm {
    param([string[]]$Arguments)
    & npm.cmd @Arguments
    if ($LASTEXITCODE -ne 0) { throw "npm command failed: $($Arguments -join ' ')" }
}

Push-Location -LiteralPath $PSScriptRoot
try {
    Get-Command node -ErrorAction Stop | Out-Null
    Get-Command npm.cmd -ErrorAction Stop | Out-Null
    $nodeVersion = (& node -p 'process.versions.node').Trim()
    if ($LASTEXITCODE -ne 0 -or [version]$nodeVersion -lt [version]'20.9.0') {
        throw "Node.js 20.9.0 or newer is required. Detected: $nodeVersion"
    }
    if ($Development -and $SkipBuild) { throw 'SkipBuild is only supported for production mode.' }
    if (-not (Test-Path -LiteralPath './package-lock.json')) { throw 'Project lock file is missing.' }
    if ($CheckOnly) {
        Write-Host "Project: $PSScriptRoot"
        Write-Host "URL: http://127.0.0.1:$Port/"
        Write-Host "Node.js: $nodeVersion"
        Write-Host 'Default reading mode: local rules. No API key or model installation needed.'
        Write-Host "Dependencies present: $(Test-Path -LiteralPath './node_modules')"
        return
    }
    $occupied = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
    if ($occupied.Count -gt 0) { throw "Port $Port is already in use. Stop its server or choose -Port; no process was terminated." }
    if ($InstallDependencies) { Invoke-Npm -Arguments @('ci') }
    elseif (-not (Test-Path -LiteralPath './node_modules')) { throw 'Run again with -InstallDependencies to install the locked npm packages.' }

    if ($Development) {
        Invoke-Npm -Arguments @('run', 'dev', '--', '--hostname', '127.0.0.1', '--port', "$Port")
    } else {
        if (-not $SkipBuild) { Invoke-Npm -Arguments @('run', 'build') }
        elseif (-not (Test-Path -LiteralPath './.next/BUILD_ID')) { throw 'No production build found. Run without -SkipBuild.' }
        Invoke-Npm -Arguments @('run', 'start', '--', '--hostname', '127.0.0.1', '--port', "$Port")
    }
} finally { Pop-Location }
