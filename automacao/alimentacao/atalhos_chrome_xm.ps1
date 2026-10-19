# Cria na Area de Trabalho um atalho "XM Chrome - <perfil>" pra cada perfil do Chrome que tem a
# extensao XM Macros SPX, abrindo o Chrome SEM esconder a janela que esta atras de outra.
#
# Por que: com dois Chromes (um por polo) no mesmo computador, um fica atras do outro. O Windows
# avisa o Chrome que aquela janela nao aparece, ele para de desenhar a pagina, e o menu "Exportar"
# do SPX (que abre ao passar o mouse) nao reage ao clique - o Pedidos Pesquisados falhava so no
# Chrome de tras (19/10/2026). As opcoes abaixo desligam esse corte.
#
# As opcoes so valem se o Chrome abrir pelo atalho com TODAS as janelas do Chrome fechadas antes
# (o Chrome e um processo so pra todos os perfis).

$ErrorActionPreference = 'Stop'
$base = Join-Path $env:LOCALAPPDATA 'Google\Chrome\User Data'
$chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
            "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw 'Nao achei o chrome.exe.' }

$estado = Get-Content (Join-Path $base 'Local State') -Raw -Encoding UTF8 | ConvertFrom-Json
$opcoes = '--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling'
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$criados = 0

foreach ($p in $estado.profile.info_cache.PSObject.Properties) {
    $temXm = $false
    foreach ($arq in @('Secure Preferences', 'Preferences')) {
        $f = Join-Path $base (Join-Path $p.Name $arq)
        if ((Test-Path $f) -and (Select-String -Path $f -Pattern 'extensao-macros-spx|XM Macros SPX' -Quiet)) { $temXm = $true }
    }
    if (-not $temXm) { continue }

    $nome = ($p.Value.name -replace '[\\/:*?"<>|]', '-')
    $lnk = $shell.CreateShortcut((Join-Path $desktop "XM Chrome - $nome.lnk"))
    $lnk.TargetPath = $chrome
    $lnk.Arguments = "--profile-directory=`"$($p.Name)`" $opcoes"
    $lnk.WorkingDirectory = Split-Path $chrome
    $lnk.IconLocation = "$chrome,0"
    $lnk.Save()
    Write-Host "Atalho criado: XM Chrome - $nome  (perfil $($p.Name))"
    $criados++
}

if (-not $criados) { Write-Host 'Nenhum perfil com a XM Macros SPX encontrado.' }
else { Write-Host "`nFeche TODAS as janelas do Chrome e abra cada perfil pelo atalho 'XM Chrome - ...' da Area de Trabalho." }
