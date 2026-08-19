// Testes do DACTE.
//
// O leiaute foi conferido contra um CT-e autorizado real, e o que se quebra
// sozinho num gerador de documento auxiliar é justamente o que ninguém olha:
// bloco que some, rótulo que muda de nome, número que sai sem formatação. Os
// testes abaixo fixam a estrutura que a fiscalização espera encontrar na folha.
//
// A fixture é sintética. Nenhum dado de cliente entra em teste.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// ── carrega o módulo do navegador num contexto isolado
//
// O arquivo é escrito para rodar no browser: só declara funções no topo e não
// toca em `document` até alguém clicar. Dá para avaliá-lo aqui e pegar as
// funções puras — o que evita ter que duplicar o gerador só para testá-lo.
const arquivo = path.join(__dirname, "..", "js", "fiscal-dacte.js");
const fonte = fs.readFileSync(arquivo, "utf8") +
    "\n;globalThis.__dacte = { _dacteHtml, _dacteBarras, _dChave, _dNum, _DACTE_CSS };";

const contexto = vm.createContext({ globalThis: undefined, console });
contexto.globalThis = contexto;
vm.runInContext(fonte, contexto, { filename: "fiscal-dacte.js" });
const api = contexto.__dacte;

const CHAVE = "42260500000000000191570040000000261100000015";

function pacote(extra) {
    const base = {
        cte: {
            id: 7,
            status: "AUTORIZADO",
            ambiente: "producao",
            modelo: "57",
            serie: 4,
            numero: 261,
            chave_acesso: CHAVE,
            protocolo: "142260000000001",
            data_emissao: "2026-08-18T10:00:00-03:00",
            data_autorizacao: "2026-08-18T10:02:00-03:00",
            ibscbs: {
                CST: "000",
                cClassTrib: "000001",
                gIBSCBS: {
                    vBC: "3.32",
                    gIBSUF: { pIBSUF: "0.1000", vIBSUF: "0.00" },
                    gIBSMun: { pIBSMun: "0.0000", vIBSMun: "0.00" },
                    vIBS: "0.00",
                    gCBS: { pCBS: "0.9000", vCBS: "0.03" },
                },
            },
            dados: {
                ide: {
                    CFOP: "5351", natOp: "PRESTACAO DE SERVICO DE TRANSPORTE",
                    tpCTe: 0, tpServ: 2, toma: 4,
                    xMunIni: "CACADOR", UFIni: "SC",
                    xMunFim: "VIDEIRA", UFFim: "SC",
                },
                remetente: {
                    cnpj: "00000000000191", ie: "111111111", nome: "REMETENTE TESTE",
                    telefone: "4900000000",
                    endereco: { logradouro: "RUA UM", numero: "10", bairro: "CENTRO",
                                municipio: "CACADOR", uf: "SC", cep: "89500000" },
                },
                destinatario: {
                    cpf: "00000000191", nome: "DESTINATARIO TESTE",
                    endereco: { logradouro: "RUA DOIS", numero: "20", bairro: "CENTRO",
                                municipio: "VIDEIRA", uf: "SC", cep: "89560000" },
                },
                tomador: {
                    cnpj: "00000000000272", ie: "222222222", nome: "TOMADOR TESTE",
                    endereco: { logradouro: "AV TRES", numero: "30", municipio: "CACADOR",
                                uf: "SC", cep: "89500000" },
                },
                vPrest: {
                    vTPrest: "4.00", vRec: "4.00",
                    componentes: [
                        { nome: "FRETE", valor: "3.00" },
                        { nome: "BONUS PRAZO", valor: "1.00" },
                    ],
                },
                imposto: { ICMS: { ICMS00: { CST: "00", vBC: "4.00", pICMS: "17.00", vICMS: "0.68" } } },
                carga: {
                    valor_carga: "20.85", produto_predominante: "caixa",
                    outras_caracteristicas: "SECA",
                    unidade: "01", tipo_medida: "PESO BRUTO", quantidade: "1.0000",
                },
                modal: { rntrc: "55913900" },
                compl: { xObs: "OBSERVACAO DE TESTE" },
            },
        },
        emitente: {
            razao_social: "TRANSPORTADORA TESTE LTDA", cnpj: "00000000000191",
            ie: "261772104", logradouro: "RODOVIA TESTE", numero: "801",
            bairro: "MARTELLO", municipio: "CACADOR", uf: "SC", cep: "89510620",
            telefone: "4999999999",
        },
        documentos: [
            { tipo_documento: "NFe", chave_nfe: "42260500000000000272550010000001231000000012",
              serie: "1", numero: "123" },
        ],
    };
    return Object.assign(base, extra || {});
}

// ── blocos que o DACTE precisa ter
//
// A lista veio de um CT-e autorizado; cada rótulo aqui é um bloco que o
// conferente procura na folha. Sumiu um, a folha deixou de ser um DACTE.
const BLOCOS = [
    "DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO",
    "ASSINATURA / CARIMBO",
    "TÉRMINO DA PRESTAÇÃO - DATA/HORA",
    "INÍCIO DA PRESTAÇÃO - DATA/HORA",
    "Nº. DOCUMENTO", "SÉRIE",
    "DACTE",
    "Documento Auxiliar do Conhecimento",
    "MODAL",
    "CHAVE DE ACESSO",
    "Consulta de autenticidade no portal nacional do CT-e",
    "TIPO DO CTE", "TIPO DO SERVIÇO", "TOMADOR DO SERVIÇO",
    "MODELO", "NÚMERO", "FL", "DATA E HORA DE EMISSÃO",
    "PROTOCOLO DE AUTORIZAÇÃO DE USO",
    "INSC. SUFRAMA DO DESTINATÁRIO",
    "CFOP - NATUREZA DA PRESTAÇÃO",
    "INÍCIO DA PRESTAÇÃO", "TÉRMINO DA PRESTAÇÃO",
    "REMETENTE", "DESTINATÁRIO", "EXPEDIDOR", "RECEBEDOR",
    "INSCRIÇÃO ESTADUAL", "PAÍS", "FONE",
    "PRODUTO PREDOMINANTE",
    "OUTRAS CARACTERÍSTICAS DA CARGA",
    "VALOR TOTAL DA MERCADORIA",
    "TP MED / UN. MED",
    "NOME DA SEGURADORA", "RESPONSÁVEL", "NÚMERO DA APÓLICE", "NÚMERO DA AVERBAÇÃO",
    "COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO",
    "VALOR TOTAL DO SERVIÇO", "VALOR A RECEBER",
    "INFORMAÇÕES RELATIVAS AO IMPOSTO",
    "SITUAÇÃO TRIBUTÁRIA", "BASE DE CALCULO", "ALÍQ ICMS", "VALOR ICMS",
    "% RED. BC ICMS", "ICMS ST",
    "CST IBS/CBS", "V. BC IBS/CBS", "P. CBS", "V. CBS",
    "DOCUMENTOS ORIGINÁRIOS", "TIPO DOC", "CNPJ/CHAVE", "SÉRIE/NRO. DOCUMENTO",
    "OBSERVAÇÕES",
    "DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO - CARGA FRACIONADA",
    "RNTRC DA EMPRESA", "CIOT", "DATA PREVISTA DE ENTREGA",
    "ESTE CONHECIMENTO DE TRANSPORTE ATENDE",
    "USO EXCLUSIVO DO EMISSOR DO CT-E",
    "RESERVADO AO FISCO",
];

test("a folha tem todos os blocos do DACTE", () => {
    const html = api._dacteHtml(pacote());
    for (const bloco of BLOCOS) {
        assert.ok(html.includes(bloco), "faltou o bloco: " + bloco);
    }
});

test("o canhoto traz numero e serie destacados", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("000.000.261"), "numero do canhoto sem os zeros a esquerda");
    assert.ok(/SÉRIE&nbsp; <b>4<\/b>/.test(html), "serie do canhoto");
    assert.ok(html.includes(">RG<"));
});

test("a chave sai agrupada de quatro em quatro", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("4226 0500 0000 0000 0191 5700 4000 0000 2611 0000 0015"));
});

test("valores saem no formato brasileiro", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("20,85"), "valor da carga");
    assert.ok(html.includes("4,00"), "valor da prestacao");
    assert.ok(html.includes("0,68"), "valor do ICMS");
    assert.ok(!html.includes("20.85"), "sobrou ponto decimal americano");
});

test("os componentes do frete aparecem com nome e valor", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("FRETE"));
    assert.ok(html.includes("BONUS PRAZO"));
    assert.ok(html.includes("3,00"));
    assert.ok(html.includes("1,00"));
});

test("o IBS/CBS sai do grupo montado, com CST e aliquotas", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("000 / 000001"), "CST e cClassTrib do IBS/CBS");
    assert.ok(html.includes("3,32"), "base do IBS/CBS");
    assert.ok(html.includes("0,9000"), "aliquota da CBS com quatro casas");
});

test("a situacao tributaria do ICMS sai descrita, nao so o codigo", () => {
    const html = api._dacteHtml(pacote());
    assert.ok(html.includes("00 - Tributação normal ICMS"));
});

test("documento originario mostra o CNPJ tirado da propria chave", () => {
    const html = api._dacteHtml(pacote());
    // posições 7..20 da chave da NF-e da fixture
    assert.ok(html.includes("00.000.000/0002-72"));
});

test("homologacao marca a folha; producao nao", () => {
    const emTeste = pacote();
    emTeste.cte.ambiente = "homologacao";
    assert.ok(api._dacteHtml(emTeste).includes("SEM VALOR FISCAL"));
    assert.ok(!api._dacteHtml(pacote()).includes("SEM VALOR FISCAL"));
});

test("o logo da GC so entra na folha da GC", () => {
    const outra = pacote();
    assert.ok(!api._dacteHtml(outra).includes("logo-dacte.png"), "logo da GC em emitente alheio");

    const daGc = pacote();
    daGc.emitente.cnpj = "40595873000109";
    assert.ok(api._dacteHtml(daGc).includes("logo-dacte.png"));
});

test("as caixas de expedidor e recebedor saem mesmo vazias", () => {
    const html = api._dacteHtml(pacote());
    // o DACTE tem as quatro caixas fixas: a ausência é informação para quem confere
    assert.ok(html.includes("EXPEDIDOR"));
    assert.ok(html.includes("RECEBEDOR"));
});

test("rascunho sem protocolo mostra a situacao no lugar", () => {
    const p = pacote();
    p.cte.status = "RASCUNHO";
    p.cte.protocolo = null;
    const html = api._dacteHtml(p);
    assert.ok(html.includes("SITUAÇÃO DO DOCUMENTO"));
    assert.ok(html.includes("RASCUNHO"));
    assert.ok(!html.includes("PROTOCOLO DE AUTORIZAÇÃO DE USO"));
});

// ── código de barras
//
// O DACTE é lido por leitor óptico na fiscalização de estrada. Um código de
// barras errado passa despercebido na tela e falha na balança.
test("o codigo de barras tem a largura exata do CODE-128C", () => {
    const svg = api._dacteBarras(CHAVE, { modulo: 1, altura: 40 });
    // start(11) + 22 pares x 11 + dv(11) + stop(13) = 277 módulos
    assert.match(svg, /width="277\.00"/);
    assert.ok(svg.includes("<rect"), "sem barras");
});

test("chave que nao tem 44 digitos nao vira codigo de barras", () => {
    assert.strictEqual(api._dacteBarras("123"), "");
    assert.strictEqual(api._dacteBarras(null), "");
});

test("o CSS acompanha a folha", () => {
    assert.ok(api._DACTE_CSS.includes(".dacte"));
    assert.ok(api._DACTE_CSS.includes(".dcanhoto"));
    assert.ok(api._DACTE_CSS.includes("200mm") && api._DACTE_CSS.includes("285mm"),
        "a folha precisa ocupar o A4 inteiro");
});

// ── o que o usuário apontou olhando o PDF impresso
//
// Cada teste aqui nasceu de um defeito real na folha gerada. São baratos e
// pegam exatamente a classe de erro que só aparece depois de imprimir.

test("nome e valor do componente ficam no MESMO quadro", () => {
    const html = api._dacteHtml(pacote());
    // uma caixa por coluna, com cabeçalho NOME/VALOR e as linhas dentro dela
    const caixas = html.match(/<div class="dc dcomp"[\s\S]*?<\/div><\/div>/g) || [];
    assert.strictEqual(caixas.length, 3, "o DACTE tem três caixas de componentes");
    const comFrete = caixas.find((c) => c.includes("FRETE"));
    assert.ok(comFrete, "FRETE sumiu");
    assert.ok(comFrete.includes("3,00"),
        "o valor tem que estar no mesmo quadro que o nome");
});

test("CNPJ e inscricao estadual do emitente nao dividem linha", () => {
    const html = api._dacteHtml(pacote());
    // estavam na mesma linha com nbsp, o que fazia um texto montar no outro
    assert.ok(/CNPJ\/CPF: [^<]*<br>Insc\. Estadual:/.test(html),
        "CNPJ e IE precisam de linhas separadas");
});

test("a folha e travada em uma pagina", () => {
    // altura fixa + overflow hidden: conteudo que passar e cortado aqui, nunca
    // empurrado para uma segunda pagina em branco
    assert.ok(api._DACTE_CSS.includes("height:285mm"));
    assert.ok(/\.dacte \{[^}]*overflow:hidden/.test(api._DACTE_CSS));
});

test("o logo entra com altura automatica, sem esticar", () => {
    // o html2canvas ignora object-fit; largura fixa + height:auto e o que
    // preserva a proporcao na rasterizacao
    assert.ok(/\.dlogo \{[^}]*height:auto/.test(api._DACTE_CSS));
    assert.ok(!/\.dlogo \{[^}]*object-fit/.test(api._DACTE_CSS));
});

test("os totais ficam ao lado dos componentes, nao embaixo", () => {
    const html = api._dacteHtml(pacote());
    const bloco = html.slice(html.indexOf("COMPONENTES DO VALOR"));
    const fim = bloco.indexOf("INFORMAÇÕES RELATIVAS AO IMPOSTO");
    const trecho = bloco.slice(0, fim);
    assert.ok(trecho.includes("dtotais"), "faltou a coluna de totais");
    assert.ok(trecho.includes("VALOR TOTAL DO SERVIÇO"));
    assert.ok(trecho.includes("VALOR A RECEBER"));
});

// ── de onde a folha tira o ICMS
//
// A tela grava so CST e aliquota; base e valor saem da validacao e ficam na
// coluna `icms`. Sem ler dali, o DACTE saia com "17,00" e dois campos vazios.
test("base e valor do ICMS vem do grupo guardado no CT-e", () => {
    const p = pacote();
    delete p.cte.dados.imposto;             // como fica um CT-e vindo da tela
    p.cte.dados.imposto_cst = "00";
    p.cte.dados.imposto_aliquota = "17";
    p.cte.icms = { ICMS: { ICMS00: { CST: "00", vBC: "4.00", pICMS: "17.00",
                                     vICMS: "0.68" } } };
    const html = api._dacteHtml(p);
    assert.ok(html.includes("00 - Tributação normal ICMS"));
    assert.ok(html.includes("4,00"), "base de calculo");
    assert.ok(html.includes("0,68"), "valor do ICMS");
});

test("rascunho sem validacao ainda mostra o que houver", () => {
    const p = pacote();
    delete p.cte.dados.imposto;
    p.cte.dados.imposto_cst = "00";
    p.cte.dados.imposto_aliquota = "17";
    p.cte.base_icms = "4.00";
    p.cte.valor_icms = "0.68";
    const html = api._dacteHtml(p);
    assert.ok(html.includes("17,00"));
    assert.ok(html.includes("0,68"), "cai para a coluna solta quando nao ha grupo");
});

test("cubagem e quantidade de volumes saem das proprias unidades", () => {
    const p = pacote();
    delete p.cte.dados.carga.unidade;
    delete p.cte.dados.carga.tipo_medida;
    delete p.cte.dados.carga.quantidade;
    p.cte.dados.carga.quantidades = [
        { cUnid: "01", tpMed: "PESO BRUTO", quantidade: "3.998" },
        { cUnid: "00", tpMed: "CUBAGEM", quantidade: "0.0125" },
        { cUnid: "03", tpMed: "VOLUMES", quantidade: "2" },
    ];
    const html = api._dacteHtml(p);
    assert.ok(html.includes("3,998 KG"), "peso na caixa de TP MED");
    assert.ok(html.includes("0,0125"), "cubagem na coluna dela");
    // a cubagem nao pode aparecer como se fosse peso
    assert.ok(!html.includes("0,013 M3"));
    assert.ok(/QTDE\(VOL\)<\/span><span class="dv">2</.test(html), "quantidade de volumes");
});

test("data prevista de entrega sai do dPrev da NF-e transportada", () => {
    const p = pacote();
    p.documentos = [{
        tipo_documento: "NFe",
        chave_nfe: "42260500000000000272550010000001231000000012",
        serie: "1", numero: "123",
        dados: { data_prevista: "2026-08-22" },
    }];
    const html = api._dacteHtml(p);
    assert.ok(html.includes("22/08/2026"), "a data prevista nao foi puxada");
});
