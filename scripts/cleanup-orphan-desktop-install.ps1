# Remove entrada órfã do Elarion Online quando a pasta/uninstaller já foi apagada.
# Também limpa registros legados "Game 2D Railway".
# Execute como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts/cleanup-orphan-desktop-install.ps1

$ErrorActionPreference = 'Stop'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
    Write-Host 'ERRO: execute este script como Administrador (PowerShell elevado).' -ForegroundColor Red
    exit 1
}

$productPatterns = @('*Elarion Online*', '*Game 2D Railway*')
$installFolders = @(
    'C:\Program Files\Elarion Online',
    'C:\Program Files\Game 2D Railway'
)

$uninstallRoots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'
)

$removed = 0
foreach ($root in $uninstallRoots) {
    if (-not (Test-Path $root)) { continue }

    Get-ChildItem $root | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
        if ($null -eq $props.DisplayName) { return }

        $matchesProduct = $false
        foreach ($pattern in $productPatterns) {
            if ($props.DisplayName -like $pattern) {
                $matchesProduct = $true
                break
            }
        }
        if (-not $matchesProduct) { return }

        $uninstaller = ($props.UninstallString -replace '"','').Split(' ')[0]
        $folderMissing = ($installFolders | Where-Object { Test-Path $_ }).Count -eq 0
        $uninstallerMissing = [string]::IsNullOrWhiteSpace($uninstaller) -or -not (Test-Path $uninstaller)

        if ($folderMissing -or $uninstallerMissing) {
            Write-Host "Removendo registro órfão: $($props.DisplayName) [$($_.PSChildName)]"
            Remove-Item -Path $_.PSPath -Recurse -Force
            $removed++
        } else {
            Write-Host "Mantido (instalação íntegra): $($props.DisplayName)"
        }
    }
}

$shortcutPaths = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Elarion Online.lnk",
    "$env:PUBLIC\Desktop\Elarion Online.lnk",
    "$env:USERPROFILE\Desktop\Elarion Online.lnk",
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Game 2D Railway.lnk",
    "$env:PUBLIC\Desktop\Game 2D Railway.lnk",
    "$env:USERPROFILE\Desktop\Game 2D Railway.lnk"
)
foreach ($shortcut in $shortcutPaths) {
    if (Test-Path $shortcut) {
        Remove-Item $shortcut -Force
        Write-Host "Atalho removido: $shortcut"
    }
}

if ($removed -eq 0) {
    Write-Host 'Nenhuma entrada órfã encontrada. A lista de apps deve atualizar após reabrir Configurações.'
} else {
    Write-Host "Concluído. Entradas removidas: $removed"
}
