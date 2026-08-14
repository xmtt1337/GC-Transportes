# Módulo Fiscal — CT-e

Emissão de Conhecimento de Transporte Eletrônico (modelo 57) integrada à SEFAZ,
dentro do próprio sistema.

> **Estado atual: Fase 2 concluída.** Geração de XML, validação XSD, assinatura
> digital e cofre do certificado estão prontos e testados. **A comunicação com a
> SEFAZ ainda não foi implementada** (Fase 3). Nada é transmitido hoje.

---

## 1. Fontes oficiais consultadas

Toda informação fiscal aqui veio destas fontes. Nenhuma URL, schema ou regra foi
copiada de blog ou inferida.

| O quê | Fonte | Consultado em |
|---|---|---|
| Autorizador por UF | [Portal Nacional CT-e — Web Services](http://www.cte.fazenda.gov.br/portal/webServices.aspx) | 13/08/2026 |
| URLs dos Web Services | [SVRS — Serviços CT-e](https://dfe-portal.svrs.rs.gov.br/Cte/Servicos) | 13/08/2026 |
| Notas Técnicas | [Portal Nacional CT-e — Notas Técnicas](https://www.cte.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=Y0nErnoZpsg%3D) | 13/08/2026 |
| Schemas XSD | `https://dfe-portal.svrs.rs.gov.br/Schemas/PRCTE/` | 13/08/2026 |

### Versões em uso

- **Leiaute do CT-e: 4.00**
- **Modelo: 57** (CT-e). O CT-e OS é modelo 67 e não está implementado.
- **Pacote de schemas:** `svrs-2026-08-13` (ver `VERSAO.json` com hash SHA-256 de
  cada arquivo)

### ⚠️ Leiaute em movimento — Reforma Tributária

O leiaute do CT-e **está mudando agora** por causa da Reforma Tributária:

- NT 2026.002 v1.01 — 04/08/2026
- NT 2026.001-RTC v1.01 — 02/03/2026
- NT 2025.001-RTC v1.14b — 30/04/2026

O grupo `IBSCBS` (base de cálculo, alíquotas estadual/municipal, diferimento,
cashback, alíquota zero em ZFM) passou a ser exigido em 2026. **Isso ainda não
está implementado** e é o principal item pendente de validação fiscal — ver
`CTE-IMPLEMENTACAO.md`.

Por isso os schemas são versionados em pasta própria e a versão usada fica
gravada em cada CT-e (`cte.versao_leiaute`, `cte.pacote_schemas`): um documento
emitido hoje precisa poder ser revalidado com o schema da época.

---

## 2. Autorizador de Santa Catarina

**SC não é autorizador próprio: usa a SVRS** (SEFAZ Virtual do Rio Grande do Sul).

Segundo o Portal Nacional, usam SVRS: AC, AL, AM, BA, CE, DF, ES, GO, MA, PA,
PB, PI, RJ, RN, RO, **SC**, SE, TO.

### Web Services

| Ambiente | Base |
|---|---|
| Homologação | `https://cte-homologacao.svrs.rs.gov.br` |
| Produção | `https://cte.svrs.rs.gov.br` |

Serviços (todos v4.00), no caminho `/ws/<Serviço>/<Serviço>.asmx`:

`CTeRecepcaoSincV4` · `CTeConsultaV4` · `CTeStatusServicoV4` ·
`CTeRecepcaoEventoV4` · `CTeRecepcaoOSV4` · `CTeRecepcaoGTVeV4`

Em `config.js`, apenas o SVRS está preenchido. Os demais autorizadores ficam
vazios de propósito: preencher exige conferir cada URL na fonte oficial.

---

## 3. Arquitetura

```
sistema-backend/modules/fiscal/
├── config.js               ambiente, autorizador por UF, URLs, códigos IBGE
├── migrations.js           tabelas (roda na subida, padrão do projeto)
├── cofre.js                AES-256-GCM + sanitização de logs/respostas
├── certificado.js          leitura do .pfx, validade, titularidade
├── cte/
│   ├── chave.js            chave de acesso 44 dígitos + DV módulo 11
│   ├── xml.js              geração do XML 4.00
│   ├── validacao-xsd.js    validação contra schema oficial
│   ├── assinatura.js       XMLDSig
│   ├── status.js           máquina de estados
│   └── schemas/4.00/svrs-2026-08-13/
│       ├── VERSAO.json     origem, data, SHA-256 de cada arquivo
│       └── xsd/*.xsd       20 schemas oficiais
└── testes/fase2.test.js    46 testes
```

O módulo é acoplado ao `server.js` por uma única linha (as migrations). Não foi
embutido lá porque aquele arquivo já tem ~10.000 linhas.

---

## 4. Multi-empresa

Toda entidade fiscal tem `fiscal_empresa_id`. Hoje existe uma transportadora,
mas documento fiscal pertence à empresa, não ao sistema.

- `fiscal_empresas` — emitente (CNPJ único)
- `fiscal_empresa_usuarios` — quem opera em nome de qual empresa, com
  `pode_emitir`, `pode_cancelar`, `pode_configurar`
- Certificado, numeração, CT-e, documentos e eventos: todos por empresa

O isolamento é do backend. Nenhuma query pode buscar CT-e sem filtrar por
empresa do usuário autenticado — e isso será verificado por teste na Fase 3.

---

## 5. Certificado digital A1

- Fica **somente no backend**, cifrado com **AES-256-GCM** no banco
- Não vai para disco: o Render tem filesystem efêmero
- Chave em `FISCAL_CRYPTO_KEY` (variável de ambiente, nunca no Git)
- GCM autentica: registro adulterado no banco falha ao decifrar, em vez de
  devolver lixo que viraria assinatura inválida
- Validade conferida na leitura; avisa 30 dias antes de vencer
- CNPJ do certificado precisa bater com o da empresa
- `cofre.sanitizar()` remove senha/certificado de logs e respostas de API
- `.pfx`, `.p12`, `.pem`, `.key` estão no `.gitignore`

---

## 6. Assinatura digital

Padrão exigido pelo MOC (mesmo da NF-e):

| Item | Valor |
|---|---|
| Referência | `URI="#CTe<chave>"` (Id do `infCte`) |
| Transforms | enveloped-signature + c14n |
| DigestMethod | **SHA-1** |
| SignatureMethod | **RSA-SHA1** |
| KeyInfo | `X509Data` > `X509Certificate` (só o titular) |

SHA-1 não é descuido: é o que o leiaute determina. Trocar por SHA-256 gera
rejeição (297/298).

A assinatura é verificada antes de transmitir — é muito mais barato descobrir
localmente do que no retorno da SEFAZ.

---

## 7. Máquina de estados

```
RASCUNHO → VALIDANDO → ASSINANDO → TRANSMITINDO → AUTORIZADO → CANCELADO
                                        ↓
                          REJEITADO / DENEGADO / ERRO_COMUNICACAO
```

Duas regras que evitam problema fiscal:

- **`ERRO_COMUNICACAO` não vai direto para `TRANSMITINDO`.** Quando a resposta
  se perde, não se sabe se a SEFAZ autorizou. O caminho é consultar antes —
  retransmitir às cegas é o que gera CT-e duplicado.
- **`DENEGADO` e `CANCELADO` são finais.**

---

## 8. Variáveis de ambiente

```bash
FISCAL_ENV=homologacao          # produção nunca é o padrão
FISCAL_CRYPTO_KEY=<base64>      # openssl rand -base64 32
```

Valor inválido em `FISCAL_ENV` cai em homologação de propósito: um typo não pode
transmitir documento fiscal real.

---

## 9. Como testar

```bash
cd sistema-backend
npm test                        # 46 testes da Fase 2
```

Cobre: ambiente/URLs, cofre, certificado (válido, vencido, senha errada, de
outra empresa), chave de acesso e DV, máquina de estados, geração de XML,
validação XSD contra schema oficial e assinatura digital.

Os testes geram um certificado autoassinado em memória — não é preciso ter um A1
real para rodá-los.
