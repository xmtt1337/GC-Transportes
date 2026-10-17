# XM Conferência

App Android do entregador: login, rotas do dia e conferência da carga com o leitor
**nativo do Google ML Kit** (câmera nativa atrás da tela, sem o recorte de quadro do navegador).

Usa os mesmos endpoints da conferência do site (`meusite/js/entregador-conferencia.js`),
então o que é bipado aqui aparece no sistema igual. Não precisa de mudança no backend:
as chamadas saem pelo HTTP nativo do Capacitor (sem CORS).

## Estrutura

- `www/` — o app (HTML/CSS/JS puro, sem build)
  - `js/logica.js` — regras puras (texto do bipe, %, escolha do código, anti-repetição), testadas
  - `js/app.js` — telas, API, leitor, som
- `android/` — projeto nativo gerado pelo Capacitor (assinatura e versão vêm do ambiente)
- `testes/` — `npm test` (node:test)

## Gerar e instalar

Cada push em `master` que mexe em `xm-conferencia/` roda o workflow
`.github/workflows/xm-conferencia-apk.yml`, que compila e publica o APK em:

https://github.com/xmtt1337/GC-Transportes/releases/latest/download/xm-conferencia.apk

No celular: abrir o link, baixar, permitir "instalar apps desconhecidos" pro navegador e instalar.
Versão nova instala por cima.

A chave de assinatura fica **fora do repositório** (`C:\Users\RECEBIMENTO_GC\XM-chave-app\`) e vai
pro GitHub como os secrets `XM_KEYSTORE_BASE64` e `XM_KEYSTORE_PASSWORD`. Sem os secrets o
workflow só compila um APK de teste e não publica.

## Mexer no app

Depois de alterar `www/`: `npm test` e `npx cap sync android` (o workflow também faz o sync).
