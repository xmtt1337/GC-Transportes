# PASSO 2 - Cria a VM no Hyper-V e comeca a instalacao do Windows.
# -Simular mostra o que faria sem criar nada.
param(
    [switch]$Simular,
    [string]$Nome = "Colador-AT",
    [string]$Iso  = ""
)

. "$PSScriptRoot\comum.ps1"

Titulo "PASSO 2 de 3  -  CRIAR A MAQUINA VIRTUAL"

# --- Hyper-V ligado? ---------------------------------------------------
if (-not (Get-Command Get-VM -ErrorAction SilentlyContinue)) {
    Erro "O Hyper-V nao esta ligado nesta maquina."
    Manual @(
        "Rode primeiro o 1-LIGAR-HYPERV.bat desta pasta e REINICIE.",
        "Depois volte aqui."
    )
    Fim; return
}
Ok "Hyper-V ligado"

# --- memoria -----------------------------------------------------------
$cs = Get-CimInstance Win32_ComputerSystem
$ramGB = [math]::Round($cs.TotalPhysicalMemory / 1GB, 1)
# Metade da RAM pra VM, no minimo 3 GB (abaixo disso o Windows 11 sofre).
$vmRamGB = if ($ramGB -ge 12) { 6 } elseif ($ramGB -ge 8) { 4 } else { 3 }
Write-Host "  RAM da maquina: $ramGB GB  ->  a VM vai usar $vmRamGB GB"
if ($ramGB -lt 6) {
    Aviso "Com menos de 6 GB a VM e o Windows daqui vao brigar por memoria."
    Info "Da pra continuar, mas espere lentidao nos dois lados."
}

# --- disco -------------------------------------------------------------
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
$livreGB = [math]::Round($c.FreeSpace / 1GB, 1)
Write-Host "  Espaco livre em C: $livreGB GB"
if ($livreGB -lt 40) {
    Erro "Precisa de pelo menos 40 GB livres em C: e voce tem $livreGB GB."
    Manual @(
        "Libere espaco antes de continuar:",
        "",
        "  1. Tecla Windows, digite 'Limpeza de Disco', rode em C:",
        "  2. Configuracoes > Sistema > Armazenamento > Arquivos temporarios",
        "  3. Desinstale o que nao usa em Aplicativos instalados",
        "",
        "Depois rode este 2-CRIAR-VM.bat de novo."
    )
    Fim; return
}
Ok "Espaco em disco suficiente"

# --- ja existe uma VM com esse nome? -----------------------------------
if (Get-VM -Name $Nome -ErrorAction SilentlyContinue) {
    Aviso "Ja existe uma VM chamada '$Nome' nesta maquina."
    Info "Se quer recomecar do zero, apague ela no Gerenciador do Hyper-V"
    Info "(botao direito > Excluir) e apague tambem C:\VMs\$Nome.vhdx"
    Info "Se ela ja e a sua VM do colador, pule para o passo 3."
    Fim; return
}

# --- a ISO -------------------------------------------------------------
if (-not $Iso) {
    # Procura sozinho nos lugares obvios antes de perguntar.
    $candidatos = @()
    foreach ($pasta in @("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop", $PSScriptRoot,
                         (Split-Path $PSScriptRoot -Qualifier))) {
        if (Test-Path $pasta) {
            $candidatos += Get-ChildItem $pasta -Filter *.iso -ErrorAction SilentlyContinue |
                           Where-Object { $_.Length -gt 3GB }
        }
    }
    if ($candidatos) {
        $Iso = $candidatos[0].FullName
        Ok "ISO encontrada: $Iso"
    }
}

if (-not $Iso -or -not (Test-Path $Iso)) {
    Erro "Nao achei a ISO do Windows."
    Write-Host ""
    Info "Atencao: aquele pendrive WIN11 que voce tem NAO serve aqui."
    Info "Ele e um instalador bootavel, e a VM precisa de um arquivo .iso."
    Manual @(
        "Baixe a ISO do Windows 11 (uns 6 GB):",
        "",
        "  1. Vou abrir a pagina da Microsoft no seu navegador",
        "  2. Va em 'Baixar imagem de disco (ISO) do Windows 11 para dispositivos x64'",
        "  3. Escolha o idioma Portugues (Brasil) e baixe",
        "  4. Deixe o arquivo na pasta Downloads",
        "  5. Rode este 2-CRIAR-VM.bat de novo - ele acha a ISO sozinho"
    )
    if (-not $Simular) {
        Start-Process "https://www.microsoft.com/pt-br/software-download/windows11"
    }
    Fim; return
}
Ok "ISO: $Iso"

# --- switch de rede ----------------------------------------------------
$switch = Get-VMSwitch -Name "Default Switch" -ErrorAction SilentlyContinue
if (-not $switch) {
    $switch = Get-VMSwitch | Select-Object -First 1
}
if (-not $switch) {
    Erro "Nao existe rede virtual configurada no Hyper-V."
    Manual @(
        "Crie uma rede pra VM ter internet:",
        "",
        "  1. Abra o 'Gerenciador do Hyper-V'",
        "  2. Menu Acao > Gerenciador de Comutadores Virtuais",
        "  3. Novo comutador > Externo > Criar",
        "  4. Escolha sua placa de rede e OK",
        "  5. Rode este 2-CRIAR-VM.bat de novo"
    )
    Fim; return
}
Ok "Rede virtual: $($switch.Name)"

# --- criar -------------------------------------------------------------
Write-Host ""
Write-Host "  Vou criar a VM assim:" -ForegroundColor White
Write-Host "    Nome    : $Nome"
Write-Host "    Memoria : $vmRamGB GB"
Write-Host "    CPU     : 2 nucleos"
Write-Host "    Disco   : 60 GB (dinamico - so ocupa o que usar)"
Write-Host "    Rede    : $($switch.Name)"
Write-Host ""

if ($Simular) {
    Aviso "MODO SIMULACAO - nenhuma VM sera criada"
    Fim; return
}

$resp = Read-Host "Pode criar? (S/N)"
if ($resp -notmatch '^[SsYy]') { Aviso "Cancelado."; Fim; return }

try {
    New-Item -ItemType Directory -Force "C:\VMs" | Out-Null
    New-VM -Name $Nome -Generation 2 -MemoryStartupBytes ($vmRamGB * 1GB) `
           -NewVHDPath "C:\VMs\$Nome.vhdx" -NewVHDSizeBytes 60GB `
           -SwitchName $switch.Name -ErrorAction Stop | Out-Null
    Ok "VM criada"

    Set-VMProcessor $Nome -Count 2
    Set-VMMemory $Nome -DynamicMemoryEnabled $false
    Ok "2 nucleos, memoria fixa"

    # Windows 11 exige TPM. Sem estas duas linhas a instalacao recusa.
    Set-VMKeyProtector -VMName $Nome -NewLocalKeyProtector
    Enable-VMTPM -VMName $Nome
    Ok "TPM virtual habilitado (o Windows 11 exige)"

    Add-VMDvdDrive -VMName $Nome -Path $Iso
    Set-VMFirmware -VMName $Nome -FirstBootDevice (Get-VMDvdDrive -VMName $Nome)
    Ok "ISO conectada e boot ajustado pra ela"

    # Sem isso a VM tenta hibernar junto com o host e o macro para.
    Set-VM -Name $Nome -AutomaticStopAction Shutdown -AutomaticStartAction Nothing
    Ok "Configurada pra desligar direito quando o host desligar"

    Start-VM $Nome
    Ok "VM ligada"
    Start-Sleep -Seconds 2
    Start-Process "vmconnect.exe" -ArgumentList "localhost", $Nome
} catch {
    Erro "Falhou: $($_.Exception.Message)"
    Info "Se a mensagem fala em permissao, feche e rode o .bat de novo"
    Info "(ele pede administrador sozinho)."
    Fim; return
}

Write-Host ""
Manual @(
    "A janela da VM abriu. Agora instale o Windows dentro dela:",
    "",
    "  1. Se aparecer 'Press any key to boot from CD', APERTE UMA TECLA rapido",
    "",
    "  2. Na tela da chave do produto, clique em:",
    "       'Nao tenho a chave do produto'",
    "     e escolha Windows 11 PRO",
    "",
    "  3. Aceite os termos > Instalacao Personalizada > selecione o disco > Avancar",
    "",
    "  4. Quando pedir CONTA MICROSOFT e voce quiser conta local:",
    "       - aperte Shift + F10 (abre uma janela preta)",
    "       - digite:  start ms-cxh:localonly",
    "       - crie o usuario e a senha",
    "",
    "  5. A instalacao demora uns 20-30 minutos e reinicia sozinha algumas vezes",
    "",
    "QUANDO O WINDOWS DA VM ESTIVER NA AREA DE TRABALHO:",
    "  copie a pasta deste pendrive para DENTRO da VM e rode la o",
    "  3-DENTRO-DA-VM.bat"
)
Fim
