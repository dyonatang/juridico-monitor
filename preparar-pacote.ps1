# Empacota o projeto para repassar a terceiros: copia o codigo-fonte para uma pasta
# limpa (sem segredos, sem node_modules, sem a abordagem antiga de robo automatico)
# e gera um .zip pronto para enviar.
#
# Uso:  powershell -ExecutionPolicy Bypass -File preparar-pacote.ps1

$ErrorActionPreference = "Stop"
$origem = $PSScriptRoot
$destino = Join-Path (Split-Path $origem -Parent) "juridico-monitor-pacote"
$zip = Join-Path (Split-Path $origem -Parent) "juridico-monitor-pacote.zip"

if (Test-Path $destino) { Remove-Item $destino -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Path $destino | Out-Null

Write-Host "Copiando projeto (isso pode levar um minuto)..."

robocopy $origem $destino /E /XD node_modules .next .git agente-jusbr /XF ".env.local" "firebase-key.json" "*-firebase-adminsdk-*.json" "*.log" /NFL /NDL /NJH /NJS | Out-Null

if ($LASTEXITCODE -ge 8) {
  Write-Error "robocopy falhou (codigo $LASTEXITCODE)"
  exit 1
}

$suspeitos = Get-ChildItem $destino -Recurse -File -Include ".env.local", "firebase-key.json" -ErrorAction SilentlyContinue
$suspeitos += Get-ChildItem $destino -Recurse -File -Filter "*firebase-adminsdk*" -ErrorAction SilentlyContinue
if ($suspeitos) {
  Write-Error "Encontrei arquivo(s) de segredo no pacote - abortando"
  exit 1
}

Write-Host "Compactando..."
Compress-Archive -Path "$destino\*" -DestinationPath $zip -Force

Write-Host ""
Write-Host "Pronto: $zip"
Write-Host ""
Write-Host "O que foi excluido do pacote (de proposito):"
Write-Host "  - node_modules, .next, .git (reconstroem sozinhos com npm install / npm run build)"
Write-Host "  - .env.local, firebase-key.json (segredos e credenciais desta instalacao)"
Write-Host "  - agente-jusbr (abordagem antiga de robo automatico, abandonada)"
Write-Host ""
Write-Host "Envie o .zip junto com README.md e MANUAL-USUARIO.md (ja estao dentro dele)."
Write-Host "Seu amigo segue o README.md a partir da secao Instalacao, item 1 (Projeto Firebase), com o Firebase/Google Cloud dele."
