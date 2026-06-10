# Configura ASSET_PACK_PRIVATE_KEY e ASSET_PACK_PUBLIC_KEY no GitHub Actions.
# Requer: gh auth login (ou GH_TOKEN com escopo repo)
# Uso: .\scripts\set-pack-github-secrets.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$private = Join-Path $root 'private_key.pem'
$public = Join-Path $root 'public_key.pem'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Error 'GitHub CLI (gh) não encontrado. Instale: winget install GitHub.cli'
}

gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error 'Execute primeiro: gh auth login'
}

foreach ($pair in @(
    @{ Name = 'ASSET_PACK_PRIVATE_KEY'; File = $private },
    @{ Name = 'ASSET_PACK_PUBLIC_KEY'; File = $public }
)) {
    if (-not (Test-Path $pair.File)) {
        Write-Error "Arquivo não encontrado: $($pair.File). Rode npm run pack antes."
    }
    Get-Content $pair.File -Raw | gh secret set $pair.Name
    Write-Host "Secret $($pair.Name) atualizado."
}

Write-Host 'Concluído. Dispare o workflow CI ou faça push na branch Empacotar.'
