# Atualiza este kit (vigia + extensao) com a versao mais nova do GitHub.
#
# Existe porque o kit e uma COPIA (o HD XM, um segundo computador...) e copia envelhece: a
# extensao e o vigia mudam, e a copia fica na versao em que foi feita. Foi assim que um segundo
# computador ficou sem o que o primeiro ja tinha (25/09/2026).
#
# NAO mexe no login do vigia nem no que foi ensinado ao Chrome: isso mora no computador
# (%APPDATA%\XM_Vigia e o armazenamento do Chrome), nao nesta pasta.
#
# Uso:  atualizar_macros.bat   (duplo clique)
#       ou, de qualquer lugar:  atualizar_macros.ps1 -Pasta "C:\Macros\alimentacao-shopee"
#       (a pasta pode nao existir ainda: num computador novo ele cria e baixa o kit inteiro)

param(
    # A pasta do kit (a que tem o vigia_alimentacao.py). Sem isto, e a pasta deste arquivo.
    [string]$Pasta
)

$ErrorActionPreference = 'Stop'
if (-not $Pasta -and $MyInvocation.MyCommand.Path) { $Pasta = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $Pasta) {
    throw "Diga a pasta do kit: atualizar_macros.ps1 -Pasta 'C:\Macros\alimentacao-shopee'"
}
# Pasta que ainda nao existe e o caso do PRIMEIRO uso num computador (sem pendrive): cria.
if (-not (Test-Path $Pasta)) { New-Item -ItemType Directory -Path $Pasta -Force | Out-Null }

$repo = 'xmtt1337/GC-Transportes'
$base = 'automacao/alimentacao'
$cab = @{ 'User-Agent' = 'xm-atualizador' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Baixar($caminhoNoRepo, $destino) {
    $pasta = Split-Path -Parent $destino
    if (-not (Test-Path $pasta)) { New-Item -ItemType Directory -Path $pasta | Out-Null }
    # Baixa pra um arquivo temporario e so troca no fim: uma queda de rede no meio nao deixa um
    # arquivo pela metade no lugar do bom.
    $tmp = "$destino.baixando"
    Invoke-WebRequest -UseBasicParsing -Headers $cab -OutFile $tmp `
        -Uri "https://raw.githubusercontent.com/$repo/master/$caminhoNoRepo"
    Move-Item -Force $tmp $destino
}

Write-Host "Atualizando $Pasta ..."

# O vigia: os arquivos soltos.
foreach ($f in 'vigia_alimentacao.py', 'alimentacao_at.py', 'rodar_vigia.bat', 'atualizar_macros.ps1', 'atualizar_macros.bat') {
    Baixar "$base/$f" (Join-Path $Pasta $f)
    Write-Host "  $f"
}

# A extensao: a lista de arquivos vem do proprio GitHub (assim um arquivo novo entra sozinho).
$itens = Invoke-RestMethod -Headers $cab -Uri "https://api.github.com/repos/$repo/contents/$base/extensao-macros-spx?ref=master"
foreach ($i in $itens) {
    if ($i.type -ne 'file') { continue }
    Baixar "$base/extensao-macros-spx/$($i.name)" (Join-Path $Pasta "extensao-macros-spx\$($i.name)")
    Write-Host "  extensao-macros-spx\$($i.name)"
}

$manifesto = Get-Content (Join-Path $Pasta 'extensao-macros-spx\manifest.json') -Raw | ConvertFrom-Json
Write-Host ""
Write-Host "Pronto: extensao na versao $($manifesto.version)."
Write-Host ""
Write-Host "Falta so isto neste computador:"
Write-Host "  1. Feche o XM Vigia (icone da bandeja > Sair) e abra de novo (rodar_vigia.bat)."
Write-Host "  2. Em chrome://extensions, clique em recarregar na extensao XM Macros SPX."
