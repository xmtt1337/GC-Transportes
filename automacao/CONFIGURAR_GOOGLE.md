# Como configurar as credenciais do Google Sheets

## 1. Criar projeto no Google Cloud

1. Acesse: https://console.cloud.google.com/
2. Clique em **"Novo Projeto"** → dê um nome (ex: "iMile Automação") → Criar

## 2. Ativar as APIs necessárias

Com o projeto selecionado:
1. Menu lateral → **APIs e Serviços** → **Biblioteca**
2. Pesquise **"Google Sheets API"** → Ativar
3. Pesquise **"Google Drive API"** → Ativar

## 3. Criar conta de serviço

1. Menu lateral → **APIs e Serviços** → **Credenciais**
2. Clique em **"+ Criar Credenciais"** → **Conta de serviço**
3. Nome: `imile-automacao` → Criar e continuar → Concluído
4. Clique na conta de serviço criada
5. Aba **"Chaves"** → **Adicionar chave** → **Criar nova chave** → JSON → Criar
6. Um arquivo `.json` será baixado → **renomeie para `credenciais_google.json`**
7. Coloque esse arquivo na pasta `automacao/`

## 4. Criar o arquivo .env

Copie o arquivo `.env.example`, renomeie para `.env` e preencha:

```
IMILE_EMAIL=seu_email_imile@exemplo.com
IMILE_PASSWORD=sua_senha_imile
GOOGLE_CREDENTIALS_FILE=credenciais_google.json
GOOGLE_SHEET_NAME=iMile - Relatório Diário
```

## 5. Rodar o script

No terminal, dentro da pasta `automacao/`:

```bash
python imile_relatorio.py
```

Na primeira execução, a planilha será criada automaticamente e
compartilhada com cobrador10rs@gmail.com.

## Observação

O script salva screenshots na pasta `downloads/` para facilitar
a depuração caso algum elemento da página mude.
