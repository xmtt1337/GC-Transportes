# CT-e — Estado da implementação

Atualizado em 15/08/2026.

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
| Grupo IBS/CBS (estrutura, cálculo, config) | ✅ testado contra XSD |
| **CT-e completo validado no XSD oficial** | ✅ redespacho ponta a ponta |
| Grupo de ICMS montado a partir do CST | ✅ mapa lido do XSD |
| `docAnt`, `infDoc/infNFe`, `infModal/rodo` | ✅ testados |
| Controle de numeração por série/ambiente | ✅ com trava anti-duplicidade |
| Perfil de operação (preenchimento automático) | ✅ e é a costura da API |
| 199 testes automatizados | ✅ passando (2 pulados: exigem certificado real) |

---

## O que ainda falta

### Fase 3 — SEFAZ (etapa 1 concluída e validada)

✅ **CteStatusServicoV4 funcionando contra a SVRS real** (15/08/2026,
`cStat 107`). Isso valida certificado, mTLS, SOAP, namespace e parser.

Falta:
- Envelope SOAP e transmissão com mTLS
- `CTeRecepcaoSincV4` (autorização)
- `CTeConsultaV4`
- Tratamento de rejeições e códigos de retorno
- Retry controlado (sem retry cego em transmissão)
- Log de request/response sanitizado

### Fase 4 — Frontend (em andamento)
Menu FISCAL, listagem, formulário e cadastro de empresa/certificado: prontos.
Falta: detalhes do documento emitido e DACTE.

### Fase 5 — Complementos
Eventos (cancelamento, carta de correção), auditoria ligada às rotas, testes de
isolamento entre empresas.

---

## ⚠️ Pendências que exigem validação fiscal

**Estas informações não podem ser inventadas.** O código exige que sejam
preenchidas e falha com erro explícito quando faltam — não completa com valor
plausível, porque CT-e autorizado com tributação errada é pior do que rejeitado.

### 1. Grupo IBS/CBS — VALORES (a infraestrutura já existe)

A estrutura do grupo está implementada e validada contra o XSD oficial. O que
falta são os **valores**, que só o contador pode definir:

| Campo | O que é | Quem define |
|---|---|---|
| `cst` | CST do IBS/CBS (3 dígitos) | contador |
| `c_class_trib` | Classificação tributária (6 dígitos) | contador |
| `aliquota_ibs_uf` | Alíquota do IBS estadual | UF |
| `aliquota_ibs_mun` | Alíquota do IBS municipal | município |
| `aliquota_cbs` | Alíquota da CBS | federal |
| `exigir_ibscbs` | Se a operação exige o grupo | contador |

Cadastro em **Fiscal → Configurações fiscais**. Sem isso, a emissão é
bloqueada com a mensagem "Configuração fiscal IBS/CBS não cadastrada para esta
empresa" — o sistema não preenche zero nem valor plausível.

Também dependem de definição, quando aplicáveis: redução (`pRedAliq`,
`pAliqEfet`), diferimento (`pDif`, `vDif`), devolução/cashback (`vDevTrib`),
estorno de crédito, tributação regular e compra governamental.

### 2. Regime tributário e grupo de ICMS

O **mapa CST → grupo** (`tributacao/icms.js`) foi lido das enumerações do
próprio XSD, não escolhido por nós:

| CST | Grupo |
|---|---|
| 00 | `ICMS00` |
| 20 | `ICMS20` |
| 40, 41, 51 | `ICMS45` |
| 60 | `ICMS60` |
| 90 | `ICMS90` (ou `ICMSOutraUF` / `ICMSSN`, informados explicitamente) |

Quem escolhe o CST continua sendo o contador. O módulo só traduz para a
estrutura correta e recusa CST que não exista no leiaute.

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

### 7. Série e numeração inicial — RESOLVIDO (15/08/2026)

A GC **já emitiu 260 CT-e na série 4** por outro sistema. Isso invalidou a
premissa original do módulo, que começava toda série no número 1: o primeiro
documento emitido aqui sairia com número já usado, e a SEFAZ rejeitaria um a um.

O que mudou:

- `modules/fiscal/numeracao.js` — lê e define o próximo número por
  empresa/modelo/série/ambiente, com auditoria de cada alteração
- **Produção sem numeração configurada não emite.** `reservarNumero` recusa com
  erro explícito em vez de silenciosamente começar do 1. Homologação continua
  criando a série sozinha, porque documento de teste não tem valor fiscal
- Não é possível apontar para um número que ESTA base já emitiu — os emitidos
  por outro sistema não têm como ser conferidos, e por isso a alteração fica
  registrada com o antes, o depois e a justificativa
- Tela em **Fiscal → Numeração**, exige a permissão "Configurar"

Situação da GC: série **4**, próximo número **261** em produção.

### 7b. Observação antiga (mantida para contexto)
Se a empresa já emitiu CT-e por outro sistema, a numeração precisa continuar de
onde parou.

### 8. Confirmação da NT dos schemas
Os XSD baixados do SVRS não declaram a NT internamente. Antes de produção,
conferir no Portal Nacional qual Pacote de Liberação corresponde aos arquivos em
`VERSAO.json` (os hashes SHA-256 permitem essa comparação).

---

## Decisões técnicas

### O preenchimento automático acontece no backend, não na tela

`modules/fiscal/perfil-operacao.js` guarda por empresa os valores que se repetem
em todo CT-e (CFOP, tipo de serviço, origem da prestação, CST/alíquota do ICMS,
RNTRC) e o `GET /fiscal/cte/novo` devolve o rascunho já preenchido.

Podia ter sido feito na tela, com menos código. Foi feito no backend porque é o
mesmo ponto por onde a **importação da API da Shopee** vai passar: o importador
monta o que sabe do pedido — chaves de NF-e, destinatário, valores — e chama
`aplicar(perfil, dadosDoPedido)`. O que veio do pedido vence; o perfil completa
o resto. Nada mais no sistema precisa mudar para isso funcionar.

Três garantias, com teste para cada uma:

- o perfil **nunca** sobrescreve campo já preenchido — quem digitou vence;
- só os campos da lista `CAMPOS` são gravados, para um perfil mal preenchido não
  injetar estrutura estranha no documento fiscal;
- sem perfil configurado, o formulário abre em branco como antes.

E nenhum valor fiscal está no código: o perfil é preenchido por quem configura a
empresa. A tela oferece uma sugestão com a origem de cada valor, mas nada é
gravado sem alguém conferir e salvar.

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

### O XML foi acertado contra o schema, não contra a intuição

Até 15/08/2026 nenhum teste montava um CT-e **inteiro** e o submetia ao XSD —
só pedaços. Ao fazer isso, o schema apontou seis erros de estrutura que
passariam despercebidos até a primeira rejeição da SEFAZ:

| O que estava | O que o schema exige |
|---|---|
| `<imposto>` | `<imp>` |
| `vTotDFe` dentro de `vPrest` | dentro de `<imp>`, depois de `IBSCBS` |
| `emit` sem `CRT` | `CRT` obrigatório, último filho de `emit` |
| `enderEmit` com `cPais`/`xPais` | `TEndeEmi` tem `fone`, não tem país |
| endereço opcional em `rem`/`dest` | obrigatório em todas as partes |
| `xFant` em todas as partes | só `rem` tem `xFant`; só `dest` tem `ISUF` |
| alíquota `0.1` | 2 a 4 casas: `0.10` |

Lição registrada aqui de propósito: teste de estrutura fiscal que não passa pelo
XSD oficial prova pouco. O arquivo `testes/cte-completo.test.js` existe para que
essa classe de erro não volte.

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
3. **IBS/CBS sem valores configurados** — estrutura pronta, valores pendentes (ver pendência 1).
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
