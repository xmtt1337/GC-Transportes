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

O grupo `IBSCBS` passou a ser exigido em 2026. **A infraestrutura está
implementada** (seção 10); o que falta são os **valores fiscais**, que dependem
do contador — ver `CTE-IMPLEMENTACAO.md`.

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
├── tributacao/
│   ├── ibscbs-leiaute.js   estrutura do grupo, lida do XSD
│   ├── ibscbs.js           monta, valida e calcula IBS/CBS
│   └── config-tributaria.js  configuração por empresa, versionada
└── testes/                 74 testes (fase2 + ibscbs)
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
npm test                        # 74 testes
```

Cobre: ambiente/URLs, cofre, certificado (válido, vencido, senha errada, de
outra empresa), chave de acesso e DV, máquina de estados, geração de XML,
validação XSD contra schema oficial e assinatura digital.

Os testes geram um certificado autoassinado em memória — não é preciso ter um A1
real para rodá-los.

---

## 10. Grupo IBS/CBS (Reforma Tributária)

### Onde fica

`infCte > imposto > IBSCBS` — tipo `TTribCTe`, definido em
`DFeTiposBasicos_v1.00.xsd`. Há ainda `vPrest > vTotDFe`
(= vTPrest + total IBS + total CBS).

### Estrutura, lida do XSD oficial

```
IBSCBS (TTribCTe)          minOccurs=0 no schema
├── CST            \d{3}   OBRIGATÓRIO
├── cClassTrib     \d{6}   OBRIGATÓRIO
├── indDoacao      "1"     opcional
├── gIBSCBS (TCIBS)        opcional no schema
│   ├── vBC                OBRIGATÓRIO
│   ├── gIBSUF             OBRIGATÓRIO
│   │   ├── pIBSUF         OBRIGATÓRIO   (alíquota)
│   │   ├── gDif           opcional      (pDif, vDif)
│   │   ├── gDevTrib       opcional      (vDevTrib — cashback)
│   │   ├── gRed           opcional      (pRedAliq, pAliqEfet)
│   │   └── vIBSUF         OBRIGATÓRIO
│   ├── gIBSMun            OBRIGATÓRIO   (mesma estrutura, pIBSMun/vIBSMun)
│   ├── vIBS               OBRIGATÓRIO   (soma UF + Municipal)
│   ├── gCBS               OBRIGATÓRIO   (pCBS, gDif, gDevTrib, gRed, vCBS)
│   ├── gTribRegular       opcional      (8 campos)
│   └── gTribCompraGov     opcional      (6 campos)
└── gEstornoCred           opcional      (vIBSEstCred, vCBSEstCred)
```

Tipos: percentual `TDec_0302_04RTC` (até 4 casas), monetário `TDec1302RTC`
(2 casas).

### ⚠️ Duas obrigatoriedades diferentes

O **XSD aceita** CT-e sem o grupo (`minOccurs="0"`). A **NT 2026.002 exige** o
preenchimento em 2026, e isso é regra de validação da SEFAZ — rejeição, não
erro de schema.

Por isso a exigência é a chave `exigir_ibscbs` na configuração da empresa, e não
uma constante no código: validar contra o XSD não basta para saber se o
documento será aceito.

### O que o schema NÃO valida

`TCST` é apenas `\d{3}` e `TcClassTrib` é `\d{6}` — **não há lista de valores
válidos no XSD**. Um CST inexistente passa no schema e é rejeitado pela SEFAZ.
A escolha do código é decisão fiscal.

### Configuração por empresa

Tabela `fiscal_config_tributaria`, versionada por vigência (nova alíquota entra
como linha nova, não sobrescreve). Nenhum valor tem padrão no código.

| Campo | Origem |
|---|---|
| `cst`, `c_class_trib` | contador |
| `aliquota_ibs_uf` | UF |
| `aliquota_ibs_mun` | município |
| `aliquota_cbs` | federal |
| `exigir_ibscbs` | decisão fiscal |

Alterar exige vínculo com `pode_configurar` na empresa — não basta ser admin.

### Cálculo

`vIBSUF = vBC × pIBSUF ÷ 100` (idem municipal e CBS), `vIBS = vIBSUF + vIBSMun`.
É a aritmética implícita nos próprios campos do leiaute.

Com redução (`gRed`), usa-se `pAliqEfet` como informada — o sistema **não
recalcula** a redução por conta própria.
