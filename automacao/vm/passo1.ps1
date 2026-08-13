# PASSO 1 - Liga o Hyper-V. Precisa de administrador (o .bat cuida disso).
# -Simular mostra o que faria sem mexer em nada.
param([switch]$Simular)

. "$PSScriptRoot\comum.ps1"

Titulo "PASSO 1 de 3  -  LIGAR O HYPER-V"

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem
Write-Host "Maquina : $env:COMPUTERNAME"
Write-Host "Windows : $($os.Caption)"
Write-Host ""

# --- edicao do Windows -------------------------------------------------
# Hyper-V nao existe no Home. Sem isso o resto do passo nao faz sentido.
if ($os.Caption -match 'Home') {
    Erro "Esta maquina tem Windows HOME, que nao tem Hyper-V."
    Write-Host ""
    Manual @(
        "O caminho aqui e o VirtualBox, que faz a mesma coisa e e gratuito:",
        "",
        "  1. Baixe em  https://www.virtualbox.org/wiki/Downloads",
        "  2. Instale (pode dar dois cliques e ir avancando)",
        "  3. Me avise que eu te passo os passos da VM no VirtualBox",
        "",
        "Nao rode os passos 2 e 3 desta pasta - eles sao do Hyper-V."
    )
    Fim; return
}
Ok "Edicao do Windows tem Hyper-V"

# --- virtualizacao no firmware ----------------------------------------
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
$vtLigada = $cs.HypervisorPresent -or ($cpu.VirtualizationFirmwareEnabled -eq $true)
if (-not $vtLigada) {
    Erro "A virtualizacao esta DESLIGADA no firmware (BIOS/UEFI)."
    Write-Host ""
    Manual @(
        "Precisa ligar na BIOS antes de continuar:",
        "",
        "  1. Reinicie e entre na BIOS (F2, F10 ou DEL na hora de ligar,",
        "     varia por fabricante - a tela inicial costuma dizer qual)",
        "  2. Procure por 'Intel VT-x', 'Virtualization Technology',",
        "     'SVM Mode' ou 'AMD-V' e deixe Enabled",
        "  3. Salve e saia (normalmente F10)",
        "  4. Rode este 1-LIGAR-HYPERV.bat de novo"
    )
    Fim; return
}
Ok "Virtualizacao habilitada no firmware"

# --- estado do Hyper-V -------------------------------------------------
$hv = Get-CimInstance Win32_OptionalFeature -Filter "Name='Microsoft-Hyper-V-All'" -ErrorAction SilentlyContinue
if ($hv -and [int]$hv.InstallState -eq 1) {
    Ok "Hyper-V JA ESTA LIGADO nesta maquina"
    Write-Host ""
    Proximo "Pode ir direto para o 2-CRIAR-VM.bat"
    Fim; return
}

Write-Host ""
Write-Host "Vou ligar o Hyper-V agora." -ForegroundColor White
if ($Simular) {
    Aviso "MODO SIMULACAO - nada sera alterado"
    Write-Host "  Rodaria: Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart"
    Fim; return
}

try {
    $r = Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V-All -All -NoRestart -ErrorAction Stop
    Ok "Hyper-V ligado"
} catch {
    Erro "Nao consegui ligar o Hyper-V: $($_.Exception.Message)"
    Write-Host ""
    Manual @(
        "Da pra fazer pela interface do Windows:",
        "",
        "  1. Tecla Windows, digite 'recursos do Windows'",
        "  2. Abra 'Ativar ou desativar recursos do Windows'",
        "  3. Marque 'Hyper-V' (com tudo que esta dentro dele)",
        "  4. OK e reinicie"
    )
    Fim; return
}

Write-Host ""
Manual @(
    "AGORA PRECISA REINICIAR A MAQUINA.",
    "",
    "Depois que voltar, rode o 2-CRIAR-VM.bat desta mesma pasta."
)

Write-Host ""
$resp = Read-Host "Reiniciar agora? (S/N)"
if ($resp -match '^[SsYy]') {
    Write-Host "Reiniciando em 10 segundos... (Ctrl+C cancela)" -ForegroundColor Yellow
    Start-Sleep -Seconds 10
    Restart-Computer -Force
} else {
    Aviso "Tudo bem - reinicie quando puder e rode o passo 2."
}
Fim
