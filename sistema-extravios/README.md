# Controle de Extravios — GC Transportes

Sistema web completo rodando sobre Google Sheets (banco de dados) + Google Apps Script
(backend) + HTML/CSS/JS (interface). O usuário nunca precisa editar a aba de registros:
tudo acontece pela interface.

---

## 1. Arquivos criados

### Backend (`.gs`)

| Arquivo | Responsabilidade |
|---|---|
| `Config.gs` | Constantes (abas, colunas, status, cores, cache) e leitura das listas de CONFIG/ENTREGADORES |
| `Utils.gs` | Funções puras: texto, moeda brasileira, datas, horas, usuário, logs |
| `Validation.gs` | Regras de validação de campos e de alteração de status |
| `Database.gs` | Leitura em lote com cache, escrita, trava de concorrência, duplicidade, histórico |
| `Setup.gs` | `setupSistema()`, menu na planilha e toda a formatação |
| `Code.gs` | `doGet()` do Web App e a API chamada por `google.script.run` |

### Interface (`.html`)

| Arquivo | Conteúdo |
|---|---|
| `Index.html` | Estrutura da página: sidebar, topbar, modal, toasts |
| `Styles.html` | Todo o CSS (tokens, componentes, responsivo) |
| `Dashboard.html` | Marcação da tela de indicadores |
| `ExtravioForm.html` | Marcação do formulário |
| `Extravios.html` | Marcação da listagem |
| `Historico.html` | Marcação do histórico |
| `Scripts.html` | Núcleo: roteador, `google.script.run` em Promise, toasts, modal, formatação |
| `ScriptsDashboard.html` | Lógica do dashboard |
| `ScriptsForm.html` | Lógica do formulário |
| `ScriptsExtravios.html` | Lógica da listagem e dos detalhes |
| `ScriptsHistorico.html` | Lógica do histórico |
| `appsscript.json` | Manifesto (fuso, escopos, configuração do Web App) |

---

## 2. Como criar a planilha

1. Acesse <https://sheets.new> e crie uma planilha em branco.
2. Dê um nome a ela, por exemplo **Extravios — GC Transportes**.
3. No menu, vá em **Extensões → Apps Script**. Isso cria um projeto de script
   já vinculado à planilha (importante: o sistema depende desse vínculo).
4. No editor do Apps Script:
   - apague o arquivo `Código.gs` que vem pronto;
   - crie um arquivo para cada `.gs` desta pasta (**+ → Script**) usando exatamente
     os mesmos nomes (`Config`, `Utils`, `Validation`, `Database`, `Setup`, `Code`)
     e cole o conteúdo;
   - crie um arquivo para cada `.html` (**+ → HTML**), também com os mesmos nomes,
     e cole o conteúdo.
5. Para editar o `appsscript.json`: **⚙ Configurações do projeto → marcar
   "Mostrar arquivo de manifesto appsscript.json no editor"**. Depois abra o arquivo
   e substitua pelo conteúdo desta pasta.
6. Salve tudo (Ctrl+S).

> Se preferir usar o `clasp`: `clasp create --type sheets`, copie os arquivos para a
> pasta do projeto e rode `clasp push`.

---

## 3. Como executar `setupSistema()`

1. No editor do Apps Script, selecione o arquivo `Setup.gs`.
2. Na barra superior, escolha a função **`setupSistema`** e clique em **Executar**.
3. Autorize o acesso na primeira execução (ver seção 5).
4. Volte para a planilha: as abas **EXTRAVIOS**, **HISTORICO**, **ENTREGADORES** e
   **CONFIG** estarão criadas e formatadas.

A função é segura para rodar de novo: ela **nunca apaga dados**, apenas recria o que
falta e reaplica formatação, validações e filtros.

O que ela faz:

- cria as 4 abas se não existirem;
- escreve os cabeçalhos e congela a linha 1;
- formata: ID inteiro, DATA e DATA DESCONTO `dd/MM/yyyy`, HORA como texto,
  VALOR como `R$ #,##0.00`, DATA REGISTRO com data e hora;
- ajusta a largura de todas as colunas;
- cria os dropdowns na planilha (status, transportadora, responsável);
- pinta a coluna STATUS com a cor de cada status;
- cria filtros em todas as abas;
- preenche a aba CONFIG com os valores iniciais;
- protege EXTRAVIOS e HISTORICO com aviso (o script continua escrevendo normalmente,
  mas quem editar à mão recebe um alerta);
- define fuso horário `America/São_Paulo` e local `pt_BR`.

Depois disso a planilha ganha um menu **Extravios** com:
**Abrir sistema** · **Configurar / reaplicar formatação** · **Atualizar listas (limpar cache)**.

> O menu aparece ao reabrir a planilha (ou rode `onOpen` manualmente uma vez).

---

## 4. Como publicar como Web App

1. No editor do Apps Script: **Implantar → Nova implantação**.
2. Em **Tipo**, escolha **App da Web**.
3. Preencha:
   - **Descrição:** `Controle de Extravios v1`
   - **Executar como:** **Usuário que acessa o app da Web**
   - **Quem pode acessar:** **Qualquer pessoa com Conta do Google**
     (ou **Qualquer pessoa da organização**, se você usa Google Workspace)
4. Clique em **Implantar** e copie a **URL do app da Web**.
5. Compartilhe a planilha (botão **Compartilhar**) como **Editor** com quem for usar o
   sistema. Com "Executar como: usuário que acessa", só quem tem acesso à planilha
   consegue usar o sistema — quem não tiver vê uma mensagem amigável.

**Por que "Executar como: usuário que acessa"?** É o que faz a coluna
`USUÁRIO QUE REGISTROU` gravar o e-mail real de cada pessoa.
Se escolher "Executar como: eu", ninguém precisa de acesso à planilha, mas todos os
registros ficam gravados com o seu e-mail.

A cada alteração de código: **Implantar → Gerenciar implantações → ✏️ (editar) →
Versão: Nova versão → Implantar**. A URL não muda.

O sistema também funciona sem publicar nada: menu **Extravios → Abrir sistema**,
que abre a mesma interface numa janela dentro da planilha.

---

## 5. Permissões solicitadas

Na primeira execução o Google mostra a tela de autorização. Como o script não é
verificado pelo Google, clique em **Avançado → Acessar (nome do projeto)**.

| Permissão | Para quê |
|---|---|
| Ver, editar, criar e excluir suas planilhas do Google | Ler e gravar os registros nas abas |
| Exibir e executar conteúdo da Web de terceiros em Planilhas | Mostrar a interface (menu e janela dentro da planilha) |
| Ver seu endereço de e-mail principal | Preencher `USUÁRIO QUE REGISTROU` e a barra superior |

Nenhum dado sai da sua conta Google: não há chamadas de rede externas.

---

## 6. Como adicionar entregadores

Na aba **ENTREGADORES**:

| A — NOME | B — ATIVO | C — OBSERVAÇÃO |
|---|---|---|
| João Silva | | rota Centro |
| Maria Souza | SIM | |
| Pedro Antigo | NÃO | desligado em 07/2026 |

- Digite **um nome por linha na coluna A**. O dropdown de RESPONSÁVEL lê essa coluna
  automaticamente — não existe lista fixa no código.
- **ATIVO** em branco ou `SIM` = aparece no dropdown. `NÃO` = some do dropdown, mas os
  registros antigos continuam válidos (nada é perdido).
- Nomes repetidos são ignorados; a ordem alfabética é automática na interface.

As mudanças aparecem em até 1 minuto. Para ver na hora, clique em
**↻ Atualizar listas** na tela de registro (ou use o menu da planilha).

---

## 7. Como alterar transportadoras / status pela aba CONFIG

A aba **CONFIG** controla o sistema sem precisar mexer no código:

| A — STATUS | B — TRANSPORTADORAS | C — CAUSAS FREQUENTES | E — PARÂMETRO | F — VALOR |
|---|---|---|---|---|
| Pendente | Loggi | Endereço não localizado | ITENS_POR_PAGINA | 25 |
| Resolvido | Shopee | Extraviado no CD | EXIGIR_DATA_DESCONTO | SIM |
| Para desconto | JET | Avaria no transporte | VALOR_MAXIMO | 100000 |
| Multa | Anjun | … | | |
| Lost | Imile | | | |
| Contestado | | | | |
| Danificado | | | | |

- **Coluna A (STATUS):** adicione ou remova linhas para mudar os status permitidos.
- **Coluna B (TRANSPORTADORAS):** idem para o dropdown de transportadora.
- **Coluna C (CAUSAS FREQUENTES):** viram botões de atalho no formulário.
- **Parâmetros (E/F):**
  - `ITENS_POR_PAGINA` — tamanho padrão da página na listagem;
  - `EXIGIR_DATA_DESCONTO` — `SIM` obriga a data quando o status for "Para desconto";
  - `VALOR_MAXIMO` — teto aceito no campo VALOR (proteção contra digitação errada).

⚠️ **Cuidados:**
- Não apague o status **Pendente** (é o padrão) nem **Multa** (é a exceção da regra de
  duplicidade) — a menos que queira mudar essa regra no código.
- Renomear um status **não** renomeia os registros já gravados.
- Status novos ganham cor cinza na interface. Para dar cor própria, acrescente-o em
  `CORES_STATUS`, em `Config.gs`, e rode `setupSistema()` de novo.

---

## Regras de negócio implementadas

**Duplicidade (a regra mais importante)**
- O mesmo CÓDIGO não pode ser cadastrado duas vezes.
- **Exceção:** se o status for **Multa**, o código pode repetir.
- A verificação é feita **no servidor**, lendo a planilha na hora (nunca do cache) e
  **dentro de um `LockService`**, então dois usuários simultâneos não conseguem gravar
  o mesmo código.
- Comparação insensível a maiúsculas/minúsculas e espaços: `abc 123` = `ABC123`.
- Ao bloquear, a tela mostra ID, status, transportadora, data e responsável do
  registro existente, com atalhos para abrir o registro ou registrar como Multa.

**Campos obrigatórios:** transportadora, data, hora, código, valor, responsável,
endereço e causa. STATUS é opcional e assume **Pendente**.
DATA DESCONTO é obrigatória apenas quando o status for **Para desconto**
(configurável por `EXIGIR_DATA_DESCONTO`).

**Valor:** aceita `R$ 25,50`, `1.234,56`, `1.500` (mil e quinhentos) e `12.50`.
É sempre gravado como **número** (`25.5`) e a coluna é formatada como moeda.

**Datas:** DATA e HORA são campos separados. A data é gravada como data real
(ancorada ao meio-dia para não sofrer com fuso horário) e a hora como texto `HH:MM`.
DATA REGISTRO e USUÁRIO QUE REGISTROU são preenchidos automaticamente.

**Histórico:** toda criação gera uma linha em HISTORICO (`CRIAÇÃO`) e toda mudança de
status gera outra (`ALTERAÇÃO DE STATUS`), com status anterior, novo status,
observação, data/hora e usuário. A alteração de status já está implementada: abra
qualquer registro na tela **Extravios**.

---

## Desempenho

- Leitura **em lote** (um `getValues()` por aba), processamento em memória e escrita em lote.
- Cache de 5 minutos no `CacheService`, fatiado em blocos de 40 KB, invalidado
  automaticamente quando o número de linhas muda e explicitamente a cada gravação.
- Listagem, filtros, ordenação, paginação e dashboard rodam sobre os dados em memória.
- A checagem de duplicidade lê **só a coluna do código**, mesmo com dezenas de
  milhares de linhas.
- Nenhuma fórmula na planilha: toda a lógica está no Apps Script.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Aba X não encontrada. Execute setupSistema()" | O `setupSistema()` ainda não foi executado |
| Dropdown de responsável vazio | Aba ENTREGADORES sem nomes na coluna A |
| Mudei CONFIG e nada mudou | Cache de 1 minuto — clique em **↻ Atualizar listas** |
| Usuário aparece como "não identificado" | Web App publicado como "Executar como: eu" |
| "O sistema está processando outro registro" | Dois salvamentos ao mesmo tempo; tente de novo em segundos |
| Erro ao abrir o Web App | O usuário não tem acesso à planilha |

Erros técnicos nunca aparecem para o usuário: ficam registrados em
**Apps Script → Execuções**.
