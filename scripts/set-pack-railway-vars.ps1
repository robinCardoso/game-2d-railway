# Imprime valores base64 para colar no Railway (Variables do serviço app).
# Railway não expõe API simples sem CLI autenticada — use o painel web.
# Uso: .\scripts\set-pack-railway-vars.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$script = Join-Path $root 'scripts\print-pack-secrets-base64.mjs'

if (-not (Test-Path (Join-Path $root 'private_key.pem'))) {
    Write-Error 'private_key.pem ausente. Rode npm run pack antes.'
}

Write-Host @"

Railway → projeto → serviço app → Variables → adicione:

  ASSET_PACK_PRIVATE_KEY  = (base64 abaixo, bloco PRIVATE)
  ASSET_PACK_PUBLIC_KEY   = (base64 abaixo, bloco PUBLIC) — opcional se só a privada estiver correta

"@

node $script

Write-Host @"
Após salvar, faça redeploy (ou aguarde o próximo push em interface/main).
"@
