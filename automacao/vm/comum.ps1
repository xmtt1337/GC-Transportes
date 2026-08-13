# Funcoes de tela usadas pelos tres passos. O que e ACAO MANUAL sai destacado
# em amarelo, pra nao se perder no meio do log.

function Titulo($texto) {
    Write-Host ""
    Write-Host ("=" * 66) -ForegroundColor Cyan
    Write-Host ("  " + $texto) -ForegroundColor Cyan
    Write-Host ("=" * 66) -ForegroundColor Cyan
    Write-Host ""
}

function Ok($texto)     { Write-Host "  [OK]    $texto" -ForegroundColor Green }
function Aviso($texto)  { Write-Host "  [!]     $texto" -ForegroundColor Yellow }
function Erro($texto)   { Write-Host "  [ERRO]  $texto" -ForegroundColor Red }
function Info($texto)   { Write-Host "          $texto" -ForegroundColor Gray }

function Manual($linhas) {
    Write-Host ""
    Write-Host ("-" * 66) -ForegroundColor Yellow
    Write-Host "  VOCE PRECISA FAZER ISSO NA MAO:" -ForegroundColor Yellow
    Write-Host ("-" * 66) -ForegroundColor Yellow
    foreach ($l in $linhas) { Write-Host "  $l" -ForegroundColor White }
    Write-Host ("-" * 66) -ForegroundColor Yellow
}

function Proximo($texto) {
    Write-Host ""
    Write-Host "  >> $texto" -ForegroundColor Cyan
}

function Fim {
    Write-Host ""
    Write-Host ("=" * 66) -ForegroundColor DarkGray
}

# Acha o ColadorNeon.exe no pendrive ou perto destes scripts.
function AcharColador {
    $lugares = @(
        (Join-Path $PSScriptRoot 'ColadorNeon.exe'),
        (Join-Path (Split-Path $PSScriptRoot -Parent) 'ColadorNeon.exe'),
        (Join-Path (Split-Path $PSScriptRoot -Qualifier) '\Auto\ColadorNeon.exe'),
        (Join-Path (Split-Path $PSScriptRoot -Qualifier) '\ColadorNeon.exe')
    )
    foreach ($p in $lugares) { if (Test-Path $p) { return $p } }
    return $null
}
