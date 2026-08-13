# Levanta o que a maquina tem, pra saber se aguenta uma VM rodando o colador.
# Rode pelo checar_maquina.bat (dois cliques). Nao precisa de admin.

$saida = @()
$os  = Get-CimInstance Win32_OperatingSystem
$cs  = Get-CimInstance Win32_ComputerSystem
$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1

$saida += '=== MAQUINA ==='
$saida += 'Nome     : ' + $env:COMPUTERNAME
$saida += 'Windows  : ' + $os.Caption + ' (build ' + $os.BuildNumber + ')'
$saida += 'CPU      : ' + $cpu.Name
$saida += 'Nucleos  : ' + $cpu.NumberOfCores + ' fisicos / ' + $cpu.NumberOfLogicalProcessors + ' logicos'

$saida += ''
$saida += '=== MEMORIA ==='
$saida += 'RAM total: {0:N1} GB' -f ($cs.TotalPhysicalMemory / 1GB)
$saida += 'RAM livre: {0:N1} GB' -f ($os.FreePhysicalMemory / 1MB)

$saida += ''
$saida += '=== DISCO ==='
foreach ($d in Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3') {
  $saida += 'Disco {0} {1:N1} GB livres de {2:N1} GB' -f $d.DeviceID, ($d.FreeSpace / 1GB), ($d.Size / 1GB)
}

# InstallState: 1 = habilitado, 2 = disponivel mas desligado
function Estado-Recurso($nome) {
  $r = Get-CimInstance Win32_OptionalFeature -Filter "Name='$nome'" -ErrorAction SilentlyContinue
  if (-not $r) { return 'nao existe nesta edicao do Windows' }
  switch ([int]$r.InstallState) {
    1 { 'HABILITADO' }
    2 { 'disponivel, precisa ligar' }
    default { 'estado ' + $r.InstallState }
  }
}

$saida += ''
$saida += '=== VIRTUALIZACAO ==='
$saida += 'Hypervisor rodando  : ' + $cs.HypervisorPresent
$saida += 'Hyper-V             : ' + (Estado-Recurso 'Microsoft-Hyper-V-All')
$saida += 'Windows Sandbox     : ' + (Estado-Recurso 'Containers-DisposableClientVM')
$saida += 'VirtualBox          : ' + (Test-Path 'C:\Program Files\Oracle\VirtualBox\VBoxManage.exe')
$saida += 'VMware Workstation  : ' + (Test-Path 'C:\Program Files (x86)\VMware\VMware Workstation\vmware.exe')

$saida += ''
$saida += '=== MAIORES CONSUMIDORES DE RAM ==='
foreach ($p in Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 6) {
  $saida += '  {0,-24} {1:N0} MB' -f $p.ProcessName, ($p.WorkingSet / 1MB)
}

$saida | Write-Host

$arq = Join-Path ([Environment]::GetFolderPath('Desktop')) 'relatorio-maquina.txt'
$saida | Out-File -FilePath $arq -Encoding utf8
Write-Host ''
Write-Host "Relatorio salvo em: $arq"
Write-Host 'Manda esse arquivo (ou um print desta tela).'
