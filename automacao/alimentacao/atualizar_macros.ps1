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
    [string]$Pasta,
    # So atualiza a pasta acima; nao procura a pasta que o Chrome usa (serve pra testar).
    [switch]$SemChrome
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

# A lista de arquivos da extensao vem do proprio GitHub (assim um arquivo novo entra sozinho).
$listaDaExtensao = Invoke-RestMethod -Headers $cab -Uri "https://api.github.com/repos/$repo/contents/$base/extensao-macros-spx?ref=master"

function Baixar-Extensao($pastaDaExtensao) {
    foreach ($i in $listaDaExtensao) {
        if ($i.type -ne 'file') { continue }
        Baixar "$base/extensao-macros-spx/$($i.name)" (Join-Path $pastaDaExtensao $i.name)
    }
}

function Versao-Da($pastaDaExtensao) {
    try { (Get-Content (Join-Path $pastaDaExtensao 'manifest.json') -Raw | ConvertFrom-Json).version } catch { '?' }
}

# De onde o Chrome/Edge REALMENTE carrega a extensao: uma extensao "sem compactacao" guarda o
# caminho no perfil do navegador. Atualizar so a pasta do kit nao adianta se o Chrome aponta pra
# outra (foi o que fez a versao continuar 3.12 depois do comando).
function Achar-PastasDaExtensao {
    $achadas = @()
    foreach ($raiz in "$env:LOCALAPPDATA\Google\Chrome\User Data", "$env:LOCALAPPDATA\Microsoft\Edge\User Data") {
        if (-not (Test-Path $raiz)) { continue }
        foreach ($perfil in Get-ChildItem $raiz -Directory -ErrorAction SilentlyContinue) {
            foreach ($arq in 'Secure Preferences', 'Preferences') {
                $f = Join-Path $perfil.FullName $arq
                if (-not (Test-Path $f)) { continue }
                $texto = Get-Content $f -Raw -ErrorAction SilentlyContinue
                if (-not $texto) { continue }
                foreach ($m in [regex]::Matches($texto, '"path"\s*:\s*"([^"]*extensao-macros-spx)"')) {
                    $achadas += ($m.Groups[1].Value -replace '\\\\', '\')
                }
            }
        }
    }
    $achadas | Select-Object -Unique
}

Write-Host "Atualizando $Pasta ..."

# O vigia: os arquivos soltos.
foreach ($f in 'vigia_alimentacao.py', 'alimentacao_at.py', 'rodar_vigia.bat', 'atualizar_macros.ps1', 'atualizar_macros.bat') {
    Baixar "$base/$f" (Join-Path $Pasta $f)
    Write-Host "  $f"
}

$extensaoDoKit = (Join-Path $Pasta 'extensao-macros-spx')
Baixar-Extensao $extensaoDoKit
Write-Host "  extensao-macros-spx  (versao $(Versao-Da $extensaoDoKit))"

Write-Host ""
Write-Host "Pasta do kit: $Pasta"
Write-Host "Extensao nessa pasta: versao $(Versao-Da $extensaoDoKit)"

if (-not $SemChrome) {
    $doChrome = @(Achar-PastasDaExtensao | Where-Object { $_ })
    if (-not $doChrome.Count) {
        Write-Host ""
        Write-Host "O Chrome ainda NAO tem a extensao carregada neste computador."
        Write-Host "  Carregue: chrome://extensions > modo desenvolvedor > Carregar sem compactacao > $extensaoDoKit"
    }
    foreach ($p in $doChrome) {
        $mesma = $p.TrimEnd('\') -ieq $extensaoDoKit.TrimEnd('\')
        if ($mesma) {
            Write-Host "O Chrome carrega a extensao DESTA pasta - ok."
        } elseif (Test-Path $p) {
            # O Chrome aponta pra OUTRA pasta: e ela que precisa ficar nova, senao a versao nao muda.
            $antes = Versao-Da $p
            Baixar-Extensao $p
            Write-Host "O Chrome carrega a extensao de OUTRA pasta: $p"
            Write-Host "  atualizei ela tambem (era versao $antes, agora $(Versao-Da $p))."
        } else {
            Write-Host "O Chrome aponta pra uma pasta que NAO existe agora: $p"
            Write-Host "  (pendrive/HD desligado?). Remova essa extensao no chrome://extensions e carregue de:"
            Write-Host "  $extensaoDoKit"
        }
    }
}

Write-Host ""
Write-Host "Falta so isto neste computador:"
Write-Host "  1. Feche o XM Vigia (icone da bandeja > Sair) e abra de novo (rodar_vigia.bat)."
Write-Host "  2. Em chrome://extensions, clique no botao de RECARREGAR da extensao XM Macros SPX."
Write-Host "     (a versao que aparece la so muda DEPOIS de recarregar)"
Write-Host "  3. Deixe so UMA extensao XM Macros SPX ativa - duas rodam o horario em dobro."
