# PASSO 3 - Roda DENTRO da VM. Deixa ela pronta pro colador trabalhar sozinha.
# O ponto principal: se a tela da VM bloquear, o macro para de digitar.
param([switch]$Simular)

. "$PSScriptRoot\comum.ps1"

Titulo "PASSO 3 de 3  -  PREPARAR A VM (rode DENTRO da VM)"

# --- confere que e mesmo a VM ------------------------------------------
$cs = Get-CimInstance Win32_ComputerSystem
$eVM = $cs.Model -match 'Virtual|VMware|VirtualBox' -or $cs.Manufacturer -match 'Microsoft Corporation'
if (-not $eVM) {
    Aviso "Isto NAO parece ser a maquina virtual."
    Info "Modelo detectado: $($cs.Manufacturer) / $($cs.Model)"
    Write-Host ""
    Manual @(
        "Este passo e pra rodar DENTRO da VM, nao no computador de fora.",
        "",
        "  1. Abra a janela da VM (Gerenciador do Hyper-V > conectar)",
        "  2. Copie esta pasta pra dentro dela",
        "  3. Rode o 3-DENTRO-DA-VM.bat la dentro"
    )
    Write-Host ""
    $resp = Read-Host "Continuar mesmo assim? (S/N)"
    if ($resp -notmatch '^[SsYy]') { Fim; return }
}

if ($Simular) { Aviso "MODO SIMULACAO - nada sera alterado" }

# --- energia: a VM nao pode dormir -------------------------------------
if (-not $Simular) {
    powercfg /change standby-timeout-ac 0   | Out-Null
    powercfg /change monitor-timeout-ac 0   | Out-Null
    powercfg /change hibernate-timeout-ac 0 | Out-Null
    powercfg /change disk-timeout-ac 0      | Out-Null
}
Ok "Suspensao e hibernacao desligadas"

# --- tela de bloqueio: o inimigo numero 1 ------------------------------
# Com a sessao bloqueada nao existe area de trabalho ativa, e o colador
# digita no vazio. Estas chaves tiram o protetor de tela com senha.
if (-not $Simular) {
    $desk = 'HKCU:\Control Panel\Desktop'
    Set-ItemProperty $desk -Name ScreenSaveActive  -Value '0' -ErrorAction SilentlyContinue
    Set-ItemProperty $desk -Name ScreenSaverIsSecure -Value '0' -ErrorAction SilentlyContinue
    Set-ItemProperty $desk -Name ScreenSaveTimeOut -Value '0' -ErrorAction SilentlyContinue
}
Ok "Protetor de tela com senha desligado"

# --- copiar o colador --------------------------------------------------
$exe = AcharColador
$destino = "$env:USERPROFILE\Desktop\ColadorNeon.exe"
if ($exe) {
    if (-not $Simular) { Copy-Item $exe $destino -Force -ErrorAction SilentlyContinue }
    Ok "ColadorNeon.exe copiado pra Area de Trabalho"
} else {
    Aviso "Nao achei o ColadorNeon.exe junto destes scripts"
    Info "Copie ele na mao pra Area de Trabalho da VM"
}

Write-Host ""
Manual @(
    "FALTA FAZER NA MAO, aqui dentro da VM:",
    "",
    "  1. DESLIGAR O BLOQUEIO AUTOMATICO",
    "     Configuracoes > Contas > Opcoes de entrada",
    "     - 'Exigir entrada' / 'Se voce estiver ausente...' = NUNCA",
    "     (se a tela bloquear, o colador para de digitar)",
    "",
    "  2. INSTALAR O NAVEGADOR",
    "     Baixe o Chrome em google.com/chrome e instale",
    "",
    "  3. ENTRAR NO SPX e deixar a tela de atribuicao aberta",
    "",
    "  4. ABRIR O ColadorNeon.exe (esta na Area de Trabalho)",
    "     - Modo:  AT Cluster",
    "     - Cole a connection string do Neon",
    "     - Escolha o XPT",
    "",
    "  5. Clique no campo do SPX e aperte INSERT pra comecar",
    "",
    "DEPOIS, LA FORA: minimize a janela da VM e use o computador",
    "normalmente. A VM tem a tela dela e continua colando."
)
Fim
