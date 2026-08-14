# CT-e — Estado da implementação

Atualizado em 13/08/2026, ao final da **Fase 2**.

---

## O que está pronto

| Item | Situação |
|---|---|
| Estrutura do módulo (`modules/fiscal`) | ✅ |
| Migrations (8 tabelas) | ✅ roda na subida do servidor |
| Multi-empresa (`fiscal_empresa_id` em tudo) | ✅ estrutura pronta |
| Cofre AES-256-GCM do certificado | ✅ testado |
| Leitura do A1, validade, titularidade | ✅ testado |
| Sanitização de logs/respostas | ✅ testado |
| Chave de acesso + DV módulo 11 | ✅ testado |
| Geração do XML CT-e 4.00 | ✅ estrutura principal |
| Validação XSD contra schema oficial | ✅ testado |
| Assinatura XMLDSig | ✅ testado |
| Máquina de estados | ✅ testado |
| Schemas oficiais versionados + hash | ✅ 20 arquivos |
| 46 testes automatizados | ✅ passando |

---

## O que ainda falta

### Fase 3 — SEFAZ (não iniciada)
- Envelope SOAP e transmissão com mTLS
- `CTeStatusServicoV4` (primeiro teste de conectividade + certificado)
- `CTeRecepcaoSincV4` (autorização)
- `CTeConsultaV4`
- Tratamento de rejeições e códigos de retorno
- Retry controlado (sem retry cego em transmissão)
- Log de request/response sanitizado

### Fase 4 — Frontend (não iniciada)
Menu FISCAL, listagem, formulário, detalhes, DACTE.

### Fase 5 — Complementos
Eventos (cancelamento, carta de correção), auditoria ligada às rotas, testes de
isolamento entre empresas.

---

## ⚠️ Pendências que exigem validação fiscal

**Estas informações não podem ser inventadas.** O código exige que sejam
preenchidas e falha com erro explícito quando faltam — não completa com valor
plausível, porque CT-e autorizado com tributação errada é pior do que rejeitado.

### 1. Grupo IBS/CBS — Reforma Tributária (mais urgente)

A NT 2026.002 (04/08/2026) tornou obrigatório o grupo `IBSCBS`. **Não está
implementado.** Precisa de definição contábil sobre: base de cálculo, alíquotas
estadual e municipal, diferimento, redução, crédito presumido e cashback
aplicáveis à operação da transportadora.

Sem isso, a emissão em produção não é possível — e provavelmente nem em
homologação, dependendo de como o SVRS está validando.

### 2. Regime tributário e grupo de ICMS
O XML repassa `dados.imposto` como veio. Falta definir se a empresa é Simples
Nacional (CSOSN) ou Normal (CST), e qual grupo se aplica: `ICMS00`, `ICMS20`,
`ICMS45`, `ICMS60`, `ICMS90`, `ICMSOutraUF` ou `ICMSSN`.

### 3. CFOP
Varia por operação (dentro/fora do estado, tipo de serviço). Não há padrão
seguro possível.

### 4. Tipo de CT-e (`tpCTe`) e tipo de serviço (`tpServ`)
Normal, Subcontratação, Redespacho, Redespacho Intermediário ou Serviço
Vinculado a Multimodal.

### 5. Tomador (`toma`)
Remetente, expedidor, recebedor ou destinatário — muda o XML e a tributação.

### 6. Dados cadastrais da empresa
CNPJ, IE, razão social, endereço completo, código IBGE do município, CRT.

### 7. Série e numeração inicial
Se a empresa já emitiu CT-e por outro sistema, a numeração precisa continuar de
onde parou.

### 8. Confirmação da NT dos schemas
Os XSD baixados do SVRS não declaram a NT internamente. Antes de produção,
conferir no Portal Nacional qual Pacote de Liberação corresponde aos arquivos em
`VERSAO.json` (os hashes SHA-256 permitem essa comparação).

---

## Decisões técnicas

### Validação XSD em WebAssembly, não binding nativo
`libxmljs2` funciona, mas depende de `node-gyp` ou de prebuild por versão de
Node. O Render escolhe a versão do runtime sozinho quando não há `engines`, e um
upgrade silencioso quebraria o build — não um teste, o **deploy**.

`libxml2-wasm` é o mesmo libxml2 compilado para WASM: sem build nativo, sem
prebuild, roda igual em qualquer plataforma. Instala em 1s. O schema oficial
completo compila em ~48ms.

Custo: precisa de `xmlRegisterInputProvider` para que `<xs:include>` resolva, já
que o WASM não enxerga o filesystem. Está encapsulado em `validacao-xsd.js`.

Também foi fixado `engines.node` no `package.json` para o Render não trocar de
runtime sem aviso.

### Grupos fiscais repassados como objeto, não montados no código
`imposto` e `infCTeNorm` são escritos a partir de um objeto JS preservando a
ordem das chaves. Montá-los no código exigiria embutir regra tributária — que é
justamente o que não pode ser inventado. A ordem das chaves precisa seguir o
leiaute, porque o schema é `sequence`.

### JSONB para as partes do CT-e
`cte.dados` guarda remetente, destinatário, componentes etc. em JSONB. O leiaute
tem dezenas de campos opcionais por grupo e virar coluna cada um engessaria o
módulo a cada Nota Técnica. O que precisa ser filtrado ou listado (chave,
número, série, status, valores, UF) está em coluna própria e indexado.

### Numeração separada por ambiente
`fiscal_numeracao` tem o ambiente na chave única. Número queimado em homologação
não pode furar a sequência fiscal real.

---

## Dependências adicionadas

| Pacote | Versão | Para quê | Nativo? |
|---|---|---|---|
| `libxml2-wasm` | ^0.7.1 | Validação XSD | Não (WASM) |
| `node-forge` | ^1.4.0 | Ler .pfx, extrair chave/cert | Não |
| `xml-crypto` | ^6.1.2 | Assinatura XMLDSig | Não |
| `@xmldom/xmldom` | ^0.9.11 | DOM para verificar assinatura | Não |
| `xmlbuilder2` | ^4.0.3 | Gerar XML com namespace correto | Não |
| `fast-xml-parser` | ^5.10.1 | Ler resposta SOAP (Fase 3) | Não |

Nenhuma exige compilação — importante para o Render. Não foi usada biblioteca
SOAP: o `https.Agent` nativo faz mTLS e o envelope do CT-e é simples o
suficiente; libs SOAP genéricas costumam atrapalhar com os namespaces da SEFAZ.

Para o DACTE (Fase 4), a intenção é reusar `@napi-rs/canvas`, que já existe no
projeto para as etiquetas.

---

## Limitações conhecidas

1. **Só modelo 57.** CT-e OS (67) e GTV-e não implementados.
2. **Só modal rodoviário** exercitado. Os schemas dos outros modais estão no
   pacote, mas a geração não monta os grupos deles.
3. **Sem IBS/CBS** (ver pendência 1).
4. **Contingência não implementada.** `tpEmis` é sempre 1 (normal).
5. **Sem inutilização de numeração.**
6. **A assinatura foi testada com certificado autoassinado**, não com um A1
   ICP-Brasil real. O algoritmo e a estrutura estão corretos, mas o teste
   definitivo é a SEFAZ aceitar — Fase 3.
7. **Nenhuma rota HTTP exposta ainda.** O módulo só roda as migrations; não há
   endpoint de emissão, o que é proposital nesta fase.

---

## Riscos

| Risco | Gravidade | Situação |
|---|---|---|
| Leiaute mudando (Reforma Tributária) | **Alta** | Schemas versionados e versão gravada por documento; IBS/CBS pendente |
| Build nativo quebrar no Render | ~~Alta~~ | **Resolvido** com WASM + `engines` fixado |
| Perda da `FISCAL_CRYPTO_KEY` | Média | Certificados salvos param de abrir; precisam ser reenviados. Guardar a chave em local seguro. |
| Duplicidade de CT-e | Média | Índice único por empresa/modelo/série/número/ambiente + máquina de estados barrando retransmissão cega |
| Regra fiscal errada | **Alta** | Mitigado: o código recusa emitir sem os dados, em vez de assumir |
| Certificado vencer sem aviso | Baixa | Aviso a partir de 30 dias |
