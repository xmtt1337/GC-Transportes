// ───── FISCAL: DACTE (documento auxiliar do CT-e) ─────
//
// O DACTE é a folha que acompanha a carga. O leiaute vem do MOC do CT-e:
// cabeçalho com emitente, chave de acesso em código de barras e protocolo,
// depois os blocos de prestação, partes, carga, valores, imposto e documentos
// originários.
//
// NADA É GUARDADO. O DACTE é sempre derivado do CT-e, então gerar de novo é
// mais barato e mais correto do que armazenar uma cópia que envelhece quando o
// documento muda de status.
//
// Em homologação a folha sai marcada como SEM VALOR FISCAL — um DACTE de teste
// circulando junto com carga real é problema, e a marca é o que evita isso.

// ── código de barras CODE-128C
//
// O DACTE usa CODE-128C para a chave de acesso (44 dígitos = 22 pares). A
// tabela abaixo é a do padrão ISO/IEC 15417: cada valor de 0 a 106 vira 6
// larguras de módulo alternando barra e espaço; o 106 (stop) tem 7.
const _C128 = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
    "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
    "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
    "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
    "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
    "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
    "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
    "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
    "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
    "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
    "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
    "211214", "211232", "2331112",
];

/**
 * Desenha a chave como SVG em CODE-128C.
 *
 * SVG e não imagem: o html2pdf rasteriza a página inteira, e vetor sobrevive
 * melhor ao zoom do leitor de código de barras do que um PNG pequeno esticado.
 */
function _dacteBarras(chave, opcoes) {
    const { altura = 46, modulo = 1.05 } = opcoes || {};
    const d = String(chave || "").replace(/\D/g, "");
    if (d.length !== 44) return "";

    // Code Set C: cada par de dígitos vira um valor de 0 a 99.
    const valores = [];
    for (let i = 0; i < d.length; i += 2) valores.push(Number(d.slice(i, i + 2)));

    const START_C = 105;
    const STOP = 106;
    let soma = START_C;
    valores.forEach(function (v, i) { soma += v * (i + 1); });
    const dv = soma % 103;

    const sequencia = [START_C].concat(valores, [dv, STOP]);
    let x = 0;
    const barras = [];
    for (const v of sequencia) {
        const larguras = _C128[v];
        for (let i = 0; i < larguras.length; i++) {
            const w = Number(larguras[i]) * modulo;
            // Posições pares são barra; ímpares, espaço.
            if (i % 2 === 0) {
                barras.push('<rect x="' + x.toFixed(2) + '" y="0" width="' +
                            w.toFixed(2) + '" height="' + altura + '"/>');
            }
            x += w;
        }
    }
    const larg = x.toFixed(2);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + larg + '" height="' + altura +
           '" viewBox="0 0 ' + larg + ' ' + altura + '" shape-rendering="crispEdges">' +
           '<rect width="100%" height="100%" fill="#fff"/>' +
           '<g fill="#000">' + barras.join("") + '</g></svg>';
}

// ── formatação
const _dEsc = (s) => String(s === null || s === undefined ? "" : s)
    .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;",
                                   '"': "&quot;", "'": "&#39;" }[c]));

const _dNum = (v, casas) => (v === null || v === undefined || v === "")
    ? "" : Number(v).toLocaleString("pt-BR", {
        minimumFractionDigits: casas === undefined ? 2 : casas,
        maximumFractionDigits: casas === undefined ? 2 : casas });

const _dDoc = (v) => {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length === 14) {
        return d.slice(0, 2) + "." + d.slice(2, 5) + "." + d.slice(5, 8) +
               "/" + d.slice(8, 12) + "-" + d.slice(12);
    }
    if (d.length === 11) {
        return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
    }
    return v || "";
};

const _dCep = (v) => {
    const d = String(v || "").replace(/\D/g, "");
    return d.length === 8 ? d.slice(0, 5) + "-" + d.slice(5) : (v || "");
};

const _dChave = (v) => String(v || "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
const _dData = (v) => v ? new Date(v).toLocaleString("pt-BR") : "";

// ── rótulos
//
// O texto é o que o DACTE realmente imprime. A referência é o modelo de CT-e
// de redespacho vinculado ao CT-e guarda-chuva publicado pela própria Shopee,
// conferido contra um DACTE autorizado da mesma operação: mesmos blocos, mesma
// ordem, mesmos rótulos. As descrições de CST vêm da documentação do XSD.
const _DACTE_TIPOS = {
    0: "Normal", 1: "Complemento de Valores", 3: "Substituição",
};
const _DACTE_SERVICOS = {
    0: "Normal", 1: "Subcontratação", 2: "Redespacho",
    3: "Redespacho Intermediário", 4: "Serviço Vinculado a Multimodal",
};
const _DACTE_TOMADORES = {
    0: "Remetente", 1: "Expedidor", 2: "Recebedor", 3: "Destinatário", 4: "Outros",
};
const _DACTE_CST = {
    "00": "00 - Tributação normal ICMS",
    "20": "20 - Tributação com BC reduzida do ICMS",
    "40": "40 - ICMS isento, não tributado ou diferido",
    "41": "41 - ICMS isento, não tributado ou diferido",
    "51": "51 - ICMS diferido",
    "60": "60 - ICMS cobrado por substituição tributária",
    "90": "90 - ICMS outros",
};

// Logo só sai na folha da empresa dona dele. Carimbar a marca da GC no DACTE
// de outro emitente seria falsificar a origem do documento.
const _DACTE_CNPJ_GC = "40595873000109";

// Em homologação a SEFAZ exige esta razão social no remetente (rejeição 646),
// e o XML transmitido sai com ela. A folha repete: DACTE que mostra um
// remetente diferente do documento que foi transmitido confere errado.
const _DACTE_XNOME_HOMOLOGACAO =
    "CTE EMITIDO EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const _DACTE_LOGO_GC = "img/logo-dacte.png";

const _dDig = (v) => String(v || "").replace(/\D/g, "");
const _dTem = (v) => v !== "" && v !== null && v !== undefined;

/**
 * Célula do formulário: rótulo miúdo em cima, valor embaixo.
 *
 * É o único átomo da folha. O DACTE não tem seção decorada — tem uma grade de
 * campos rotulados, e é isso que faz o documento parecer um documento.
 */
function _dCel(rotulo, valor, opcoes) {
    const o = opcoes || {};
    const estilo = o.largura ? "flex:0 0 " + o.largura : "flex:" + (o.peso || 1) + " 1 0";
    const classe = ["dc", o.centro ? "dcentro" : "", o.num ? "dnum" : ""]
        .filter(Boolean).join(" ");
    return '<div class="' + classe + '" style="' + estilo + '">' +
        (rotulo ? '<span class="dr">' + _dEsc(rotulo) + "</span>" : "") +
        '<span class="dv' + (o.forte ? " dforte" : "") + '">' +
        (_dTem(valor) ? _dEsc(valor) : "&nbsp;") + "</span></div>";
}

const _dLin = (...c) => '<div class="dl">' + c.join("") + "</div>";

// Linha que absorve a sobra da página. A base é `auto`, não 0: a linha nunca
// fica menor que o conteúdo — só cresce. Com base 0 as caixas de remetente e
// destinatário ficariam do tamanho da sobra, e endereço longo seria cortado.
const _dLinCresce = (peso, ...c) =>
    '<div class="dl" style="flex:' + peso + ' 1 auto">' + c.join("") + "</div>";

/** Faixa fina com o nome da seção, como no documento real. */
const _dFaixa = (texto) => '<div class="dfaixa">' + _dEsc(texto) + "</div>";

const _dEnderecoLinha = (e) => {
    if (!e) return "";
    const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
    const resto = [e.complemento, e.bairro].filter(Boolean).join(" - ");
    return [rua, resto].filter(Boolean).join(" - ");
};

const _dMunUf = (e) => (e ? [e.municipio, e.uf].filter(Boolean).join(" - ") : "");

/** Linha "RÓTULO  valor" dentro das caixas de partes. */
const _dKv = (rotulo, valor) =>
    '<div class="dkv"><span class="dk">' + _dEsc(rotulo) + "</span>" +
    '<span class="dkv-v">' + (_dTem(valor) ? _dEsc(valor) : "&nbsp;") + "</span></div>";

/**
 * Caixa de uma parte (remetente, destinatário, expedidor, recebedor).
 *
 * Sai mesmo vazia: no DACTE as quatro caixas são fixas, e a ausência do
 * expedidor é informação — quem confere a carga precisa ver o campo em branco,
 * não a caixa sumida.
 */
function _dCaixaParte(titulo, p, opcoes) {
    const parte = p || {};
    const e = parte.endereco || {};
    const o = opcoes || {};
    return '<div class="dc dparte" style="flex:' + (o.peso || 1) + ' 1 0">' +
        '<div class="dparte-cab"><span class="dr">' + _dEsc(titulo) + "</span>" +
        '<span class="dparte-nome">' +
        (_dEsc(parte.nome || parte.razao_social || "") || "&nbsp;") + "</span></div>" +
        _dKv("ENDEREÇO", _dEnderecoLinha(e)) +
        _dKv("MUNICÍPIO", _dMunUf(e)) +
        _dKv("CEP", _dCep(e.cep)) +
        _dKv("CNPJ/CPF", _dDoc(parte.cnpj || parte.cpf)) +
        _dKv("INSCRIÇÃO ESTADUAL", parte.ie || "") +
        _dKv("PAÍS", e.pais || (e.uf ? "BRASIL" : "")) +
        _dKv("FONE", parte.telefone || "") +
        "</div>";
}

/**
 * ICMS da folha, na ordem em que a informação existe.
 *
 * O formulário só grava CST e alíquota — base e valor são calculados na
 * validação. O grupo montado fica na coluna `icms` do CT-e; é dele que a folha
 * tira base e valor. Sem essa primeira fonte o DACTE saía com "17,00" de
 * alíquota e os outros dois campos em branco.
 */
function _dacteIcms(d, cte) {
    const grupo = ((cte && cte.icms) || d.imposto || {}).ICMS;
    if (grupo) {
        const nome = Object.keys(grupo)[0];
        const c = grupo[nome] || {};
        const cst = c.CST || "";
        return {
            cst: nome === "ICMSSN" ? "90 - ICMS Simples Nacional" : (_DACTE_CST[cst] || cst),
            vBC: c.vBC !== undefined ? c.vBC : c.vBCOutraUF,
            pICMS: c.pICMS !== undefined ? c.pICMS : c.pICMSOutraUF,
            vICMS: c.vICMS !== undefined ? c.vICMS : c.vICMSOutraUF,
            pRedBC: c.pRedBC,
        };
    }
    // Rascunho ainda não validado: mostra os campos soltos da tela. Base e
    // valor podem faltar aqui — é o preço de imprimir um documento que ainda
    // não passou pela validação, não um campo perdido.
    const cst = d.imposto_cst ? String(d.imposto_cst) : "";
    return {
        cst: _DACTE_CST[cst] || cst,
        vBC: _dTem(d.imposto_vbc) ? d.imposto_vbc : (cte && cte.base_icms),
        pICMS: d.imposto_aliquota,
        vICMS: _dTem(d.imposto_valor) ? d.imposto_valor : (cte && cte.valor_icms),
        pRedBC: undefined,
    };
}

const _DACTE_UNIDADES = { "00": "M3", "01": "KG", "02": "TON", "03": "UNIDADE",
                          "04": "LITROS", "05": "MMBTU" };

/**
 * Medidas da carga, repartidas como o DACTE espera.
 *
 * A folha tem três caixas "TP MED / UN. MED" e mais duas dedicadas: CUBAGEM,
 * sempre em m³, e QTDE(VOL), em unidades. O CT-e manda tudo junto em infQ, e é
 * o código da unidade (00 = M3, 03 = UNIDADE) que diz para onde cada medida
 * vai — senão a cubagem apareceria como se fosse peso.
 */
function _dacteMedidas(carga) {
    const lista = Array.isArray(carga.quantidades) && carga.quantidades.length
        ? carga.quantidades
        : (_dTem(carga.quantidade)
            ? [{ cUnid: carga.unidade, tpMed: carga.tipo_medida, quantidade: carga.quantidade }]
            : []);

    const r = { medidas: [], cubagem: "", qtde: "" };
    for (const q of lista) {
        const unidade = String(q.cUnid || "");
        if (unidade === "00" && !r.cubagem) { r.cubagem = _dNum(q.quantidade, 4); continue; }
        if (unidade === "03" && !r.qtde) { r.qtde = _dNum(q.quantidade, 0); continue; }
        r.medidas.push({
            tipo: q.tpMed || "",
            valor: _dNum(q.quantidade, 3) + " " + (_DACTE_UNIDADES[unidade] || ""),
        });
    }
    return r;
}

/** CNPJ do emitente da NF-e sai da própria chave: posições 7 a 20. */
const _dCnpjDaChave = (chave) => {
    const d = _dDig(chave);
    return d.length === 44 ? _dDoc(d.slice(6, 20)) : "";
};

/** Monta a folha inteira. */
function _dacteHtml(pacote) {
    const cte = pacote.cte;
    const emitente = pacote.emitente || {};
    const documentos = pacote.documentos || [];
    const d = cte.dados || {};
    const ide = d.ide || {};
    const homolog = cte.ambiente !== "producao";
    const autorizado = cte.status === "AUTORIZADO";
    const comps = (d.vPrest && d.vPrest.componentes) || [];
    const carga = d.carga || {};
    const icms = _dacteIcms(d, cte);

    // O XML de homologação leva a razão social exigida pela SEFAZ em TODAS as
    // partes nomeadas; a folha acompanha, para papel e documento dizerem a
    // mesma coisa. Em produção sai o nome de verdade.
    const emHomologacao = (p) => (homolog && p
        ? Object.assign({}, p, { nome: _DACTE_XNOME_HOMOLOGACAO,
                                 razao_social: _DACTE_XNOME_HOMOLOGACAO })
        : p);
    const remetente = emHomologacao(d.remetente);
    const destinatario = emHomologacao(d.destinatario);
    const expedidor = emHomologacao(d.expedidor);
    const recebedor = emHomologacao(d.recebedor);
    const tomador = emHomologacao(d.tomador);

    // IBS/CBS: o grupo fica montado em `cte.ibscbs`, na forma do schema.
    const ib = cte.ibscbs || {};
    const gib = ib.gIBSCBS || {};
    const guf = gib.gIBSUF || {};
    const gmun = gib.gIBSMun || {};
    const gcbs = gib.gCBS || {};
    const temIbsCbs = _dTem(ib.CST) || _dTem(gib.vBC);

    const numero = _dTem(cte.numero) ? String(cte.numero) : "";
    const serie = _dTem(cte.serie) ? String(cte.serie) : "";
    const numeroLongo = numero
        ? numero.padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.") : "";

    // ── canhoto: o recibo que o destinatário assina e devolve
    const canhoto =
        '<div class="dcanhoto">' +
            '<div class="dcanhoto-esq">' +
                '<div class="ddeclaro">DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO ' +
                "EM PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE " +
                "TRANSPORTE</div>" +
                '<div class="dl dl-fim dcanhoto-campos">' +
                    '<div class="dc" style="flex:2 1 0">' +
                        '<span class="dr">NOME</span><span class="dr dr-baixo">RG</span>' +
                    "</div>" +
                    '<div class="dc" style="flex:2 1 0">' +
                        '<span class="dr dr-fundo">ASSINATURA / CARIMBO</span>' +
                    "</div>" +
                    '<div class="dc" style="flex:2 1 0">' +
                        '<span class="dr">TÉRMINO DA PRESTAÇÃO - DATA/HORA</span>' +
                        '<span class="dr dr-baixo">INÍCIO DA PRESTAÇÃO - DATA/HORA</span>' +
                    "</div>" +
                "</div>" +
            "</div>" +
            '<div class="dcanhoto-dir">' +
                '<div class="dcanhoto-cte">CT-E</div>' +
                '<div class="dcanhoto-lin">Nº. DOCUMENTO&nbsp; <b>' +
                _dEsc(numeroLongo) + "</b></div>" +
                '<div class="dcanhoto-lin">SÉRIE&nbsp; <b>' + _dEsc(serie) + "</b></div>" +
            "</div>" +
        "</div>" +
        '<div class="dcorte"></div>';

    // ── cabeçalho: emitente à esquerda ocupando três faixas, identificação do
    // documento e código de barras à direita
    const logo = _dDig(emitente.cnpj) === _DACTE_CNPJ_GC
        ? '<img class="dlogo" src="' + _DACTE_LOGO_GC + '" alt="">'
        : "";

    const cabecalho =
        '<div class="dl dcab">' +
            '<div class="dc demit" style="flex:0 0 66mm">' + logo +
                '<div class="demit-txt">' +
                    '<div class="demit-nome">' + _dEsc(emitente.razao_social || "") + "</div>" +
                    _dEsc([emitente.logradouro, emitente.numero].filter(Boolean).join(", ")) + "<br>" +
                    _dEsc([emitente.bairro, emitente.municipio, emitente.uf]
                        .filter(Boolean).join(" - ")) +
                    (emitente.cep ? " - " + _dEsc(_dCep(emitente.cep)) : "") + "<br>" +
                    (emitente.telefone ? "Fone/Fax: " + _dEsc(emitente.telefone) + "<br>" : "") +
                    "CNPJ/CPF: " + _dEsc(_dDoc(emitente.cnpj)) + "<br>" +
                    "Insc. Estadual: " + _dEsc(emitente.ie || "") +
                "</div>" +
            "</div>" +

            '<div class="dcab-dir">' +
                '<div class="dl">' +
                    '<div class="dc dmeio" style="flex:1 1 0">' +
                        '<div class="ddacte">DACTE</div>' +
                        '<div class="ddacte-sub">Documento Auxiliar do Conhecimento<br>' +
                        "de Transporte Eletrônico</div>" +
                    "</div>" +
                    _dCel("MODAL", "Rodoviário", { largura: "30mm", centro: true, forte: true }) +
                "</div>" +
                _dLin(
                    _dCel("MODELO", cte.modelo || "57", { largura: "14mm", centro: true }),
                    _dCel("SÉRIE", serie, { largura: "13mm", centro: true }),
                    _dCel("NÚMERO", numero, { largura: "22mm", centro: true, forte: true }),
                    _dCel("FL", "1/1", { largura: "11mm", centro: true }),
                    _dCel("DATA E HORA DE EMISSÃO",
                        _dData(cte.data_emissao || cte.criado_em), { peso: 2, centro: true }),
                    _dCel("INSC. SUFRAMA DO DESTINATÁRIO",
                        (d.destinatario && d.destinatario.isuf) || "", { peso: 2, centro: true })
                ) +
                '<div class="dl dl-fim">' +
                    '<div class="dc dbarras" style="flex:1 1 0">' +
                    _dacteBarras(cte.chave_acesso) + "</div>" +
                "</div>" +
            "</div>" +
        "</div>" +

        _dLin(
            _dCel("TIPO DO CTE", _DACTE_TIPOS[ide.tpCTe] || "", { largura: "33mm", centro: true }),
            _dCel("TIPO DO SERVIÇO", _DACTE_SERVICOS[ide.tpServ] || "",
                { largura: "33mm", centro: true }),
            _dCel("CHAVE DE ACESSO", _dChave(cte.chave_acesso), { centro: true, forte: true })
        ) +
        '<div class="dl">' +
            _dCel("TOMADOR DO SERVIÇO", _DACTE_TOMADORES[ide.toma] || "",
                { largura: "66mm", centro: true }) +
            '<div class="dc dconsulta" style="flex:1 1 0">Consulta de autenticidade no ' +
            "portal nacional do CT-e, no site da Sefaz Autorizadora,<br>ou em " +
            "http://www.cte.fazenda.gov.br</div>" +
        "</div>";

    // ── componentes: três caixas, cada uma com NOME e VALOR no MESMO quadro
    const porColuna = Math.max(1, Math.ceil(comps.length / 3));
    const colunas = [0, 1, 2].map((i) => comps.slice(i * porColuna, (i + 1) * porColuna));
    const caixaComp = (lista) =>
        '<div class="dc dcomp" style="flex:1 1 0">' +
            '<div class="dcomp-cab"><span class="dr">NOME</span>' +
            '<span class="dr dcomp-val">VALOR</span></div>' +
            (lista.length
                ? lista.map((c) => '<div class="dcomp-lin"><span>' + _dEsc(c.nome) +
                    '</span><span class="dcomp-val">' + _dNum(c.valor) + "</span></div>").join("")
                : '<div class="dcomp-lin">&nbsp;</div>') +
        "</div>";

    // ── documentos originários: duas colunas de três campos
    const celulaDoc = (x) =>
        _dCel("TIPO DOC", x ? (x.tipo_documento || "") : "", { largura: "17mm" }) +
        _dCel("CNPJ/CHAVE", x ? (x.chave_nfe || "") : "", { peso: 3 }) +
        _dCel("SÉRIE/NRO. DOCUMENTO",
            x ? [x.serie, x.numero].filter(Boolean).join("/") : "", { largura: "30mm" });
    const pares = [];
    for (let i = 0; i < Math.max(documentos.length, 2); i += 2) {
        pares.push(documentos.slice(i, i + 2));
    }
    const linhasDoc = pares.map((p) => _dLin(celulaDoc(p[0]), celulaDoc(p[1]))).join("");

    // A data prevista vem do dPrev de cada NF-e transportada. O importador já a
    // lê e guarda junto do documento; é a mesma para o embarque todo, então a
    // primeira que existir é a do CT-e.
    const dataPrevista = (() => {
        for (const x of documentos) {
            const v = (x.dados && x.dados.data_prevista) || x.data_prevista;
            if (_dTem(v)) return String(v).slice(0, 10).split("-").reverse().join("/");
        }
        return "";
    })();

    const medidas = _dacteMedidas(carga);
    const celulaMedida = (i) => {
        const m = medidas.medidas[i];
        return '<div class="dc" style="flex:1 1 0"><span class="dr">TP MED / UN. MED</span>' +
            '<span class="dv">' + (m ? _dEsc(m.tipo) : "&nbsp;") + "</span>" +
            '<span class="dv dforte">' + (m ? _dEsc(m.valor) : "&nbsp;") + "</span></div>";
    };

    return '<div class="dacte">' +
        (homolog ? '<div class="dmarca">SEM VALOR FISCAL — HOMOLOGAÇÃO</div>' : "") +
        canhoto +

        '<div class="dcorpo">' +
            cabecalho +

            _dLin(
                _dCel("CFOP - NATUREZA DA PRESTAÇÃO",
                    [ide.CFOP, ide.natOp].filter(Boolean).join(" - ")),
                _dCel(autorizado ? "PROTOCOLO DE AUTORIZAÇÃO DE USO" : "SITUAÇÃO DO DOCUMENTO",
                    autorizado
                        ? [cte.protocolo, _dData(cte.data_autorizacao)].filter(Boolean).join(" - ")
                        : cte.status || "")
            ) +
            _dLin(
                _dCel("INÍCIO DA PRESTAÇÃO",
                    [ide.xMunIni, ide.UFIni].filter(Boolean).join(" - ")),
                _dCel("TÉRMINO DA PRESTAÇÃO",
                    [ide.xMunFim, ide.UFFim].filter(Boolean).join(" - "))
            ) +

            _dLinCresce(1.3,
                _dCaixaParte("REMETENTE", remetente),
                _dCaixaParte("DESTINATÁRIO", destinatario)
            ) +
            _dLinCresce(1.3,
                _dCaixaParte("EXPEDIDOR", expedidor),
                _dCaixaParte("RECEBEDOR", recebedor)
            ) +
            _dLinCresce(1,
                _dCaixaParte("TOMADOR DO SERVIÇO", tomador, { peso: 2 })
            ) +

            _dLin(
                _dCel("PRODUTO PREDOMINANTE", carga.produto_predominante || "", { peso: 2 }),
                _dCel("OUTRAS CARACTERÍSTICAS DA CARGA",
                    carga.outras_caracteristicas || "", { peso: 2 }),
                _dCel("VALOR TOTAL DA MERCADORIA", _dNum(carga.valor_carga),
                    { largura: "34mm", num: true })
            ) +
            _dLin(
                celulaMedida(0), celulaMedida(1), celulaMedida(2),
                _dCel("CUBAGEM(M3)", medidas.cubagem, { largura: "24mm", num: true }),
                _dCel("QTDE(VOL)", medidas.qtde, { largura: "22mm", num: true })
            ) +
            _dLin(
                _dCel("NOME DA SEGURADORA", "", { peso: 2 }),
                _dCel("RESPONSÁVEL", ""),
                _dCel("NÚMERO DA APÓLICE", ""),
                _dCel("NÚMERO DA AVERBAÇÃO", "")
            ) +

            '<div class="dl">' +
                '<div class="dcomp-bloco">' +
                    _dFaixa("COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO") +
                    '<div class="dl dl-fim">' +
                    colunas.map(caixaComp).join("") + "</div>" +
                "</div>" +
                '<div class="dtotais">' +
                    '<div class="dc dtotal"><span class="dr">VALOR TOTAL DO SERVIÇO</span>' +
                    '<span class="dv dforte dnum-v">' +
                    _dNum(d.vPrest && d.vPrest.vTPrest) + "</span></div>" +
                    '<div class="dc dtotal dtotal-fim">' +
                    '<span class="dr">VALOR A RECEBER</span>' +
                    '<span class="dv dforte dnum-v">' +
                    _dNum(d.vPrest && d.vPrest.vRec) + "</span></div>" +
                "</div>" +
            "</div>" +

            _dFaixa("INFORMAÇÕES RELATIVAS AO IMPOSTO") +
            _dLin(
                _dCel("SITUAÇÃO TRIBUTÁRIA", icms.cst, { peso: 3 }),
                _dCel("BASE DE CALCULO", _dNum(icms.vBC), { num: true }),
                _dCel("ALÍQ ICMS", _dNum(icms.pICMS), { num: true }),
                _dCel("VALOR ICMS", _dNum(icms.vICMS), { num: true }),
                _dCel("% RED. BC ICMS", _dNum(icms.pRedBC), { num: true }),
                _dCel("ICMS ST", "", { num: true })
            ) +
            (temIbsCbs
                ? _dLin(
                    _dCel("CST IBS/CBS",
                        [ib.CST, ib.cClassTrib].filter(Boolean).join(" / "), { peso: 2 }),
                    _dCel("V. BC IBS/CBS", _dNum(gib.vBC), { num: true }),
                    _dCel("P. IBS UF", _dNum(guf.pIBSUF, 4), { num: true }),
                    _dCel("V. IBS UF", _dNum(guf.vIBSUF), { num: true }),
                    _dCel("P. IBS MUN", _dNum(gmun.pIBSMun, 4), { num: true }),
                    _dCel("V. IBS MUN", _dNum(gmun.vIBSMun), { num: true }),
                    _dCel("P. CBS", _dNum(gcbs.pCBS, 4), { num: true }),
                    _dCel("V. CBS", _dNum(gcbs.vCBS), { num: true })
                )
                : "") +

            _dFaixa("DOCUMENTOS ORIGINÁRIOS") +
            linhasDoc +

            _dFaixa("OBSERVAÇÕES") +
            _dLinCresce(1, _dCel("", (d.compl && d.compl.xObs) || "")) +

            _dFaixa("DADOS ESPECÍFICOS DO MODAL RODOVIÁRIO - CARGA FRACIONADA") +
            _dLin(
                _dCel("RNTRC DA EMPRESA", (d.modal && d.modal.rntrc) || ""),
                _dCel("CIOT", ""),
                _dCel("DATA PREVISTA DE ENTREGA", dataPrevista)
            ) +
            '<div class="dlegenda">ESTE CONHECIMENTO DE TRANSPORTE ATENDE À LEGISLAÇÃO ' +
            "DE TRANSPORTE RODOVIÁRIO EM VIGOR</div>" +

            '<div class="dl dl-fim" style="flex:1.2 1 auto">' +
                _dCel("USO EXCLUSIVO DO EMISSOR DO CT-E", "") +
                _dCel("RESERVADO AO FISCO", "") +
            "</div>" +
        "</div>" +

        '<div class="drodape">Impresso em ' +
        _dEsc(new Date().toLocaleString("pt-BR")) + "</div>" +
    "</div>";
}

// A folha tem tamanho fixo: 200 × 285 mm cabe no A4 com 5 mm de margem e ainda
// sobram 2 mm de folga. Sem essa folga o html2pdf arredonda para cima e cria
// uma segunda página em branco. `overflow:hidden` é a trava: conteúdo maior que
// a folha é cortado aqui, não empurrado para a página seguinte.
const _DACTE_CSS = [
    ".dacte { position:relative; width:200mm; height:285mm; overflow:hidden;",
    "  background:#fff; color:#000; display:flex; flex-direction:column;",
    "  font-family:Arial, Helvetica, sans-serif; font-size:6.4pt; line-height:1.15; }",
    ".dacte * { box-sizing:border-box; }",
    ".dmarca { position:absolute; top:44%; left:0; right:0; text-align:center;",
    "  font-size:28pt; font-weight:700; color:rgba(170,0,0,.08);",
    "  transform:rotate(-24deg); pointer-events:none; z-index:5; letter-spacing:3px; }",

    /* grade */
    ".dcanhoto, .dcorpo { border:0.6pt solid #000; }",
    ".dl { display:flex; border-bottom:0.6pt solid #000; }",
    ".dl-fim, .dcorpo > .dl:last-child { border-bottom:0; }",
    ".dc { border-right:0.6pt solid #000; padding:0.7mm 1.1mm 0.5mm; min-width:0;",
    "  overflow:hidden; display:flex; flex-direction:column; }",
    ".dl > .dc:last-child, .dl > *:last-child > .dc:last-child { border-right:0; }",
    ".dr { display:block; font-size:5pt; text-transform:uppercase; letter-spacing:.1px;",
    "  white-space:nowrap; overflow:hidden; }",
    ".dr-baixo { margin-top:auto; }",
    ".dr-fundo { margin-top:auto; text-align:center; }",
    ".dv { display:block; font-size:7pt; word-break:break-word; }",
    ".dforte { font-weight:700; }",
    ".dcentro { text-align:center; }",
    ".dnum .dv, .dnum-v { text-align:right; }",
    ".dfaixa { border-bottom:0.6pt solid #000; padding:0.4mm 1.1mm; font-size:5.4pt;",
    "  text-transform:uppercase; letter-spacing:.2px; }",
    ".dlegenda { border-bottom:0.6pt solid #000; padding:0.6mm; font-size:5.6pt;",
    "  text-align:center; }",

    /* canhoto */
    ".dcanhoto { display:flex; flex:0 0 auto; }",
    ".dcanhoto-esq { flex:1; display:flex; flex-direction:column;",
    "  border-right:0.6pt solid #000; }",
    ".ddeclaro { padding:0.8mm 1.1mm; font-size:5.8pt; text-align:center;",
    "  border-bottom:0.6pt solid #000; }",
    ".dcanhoto-campos { flex:1; min-height:13mm; }",
    ".dcanhoto-dir { flex:0 0 42mm; padding:1.2mm; text-align:center;",
    "  display:flex; flex-direction:column; justify-content:center; }",
    ".dcanhoto-cte { font-size:11pt; font-weight:700; line-height:1.1; }",
    ".dcanhoto-lin { font-size:6.6pt; margin-top:.4mm; }",
    ".dcanhoto-lin b { font-size:8pt; }",
    ".dcorte { flex:0 0 auto; border-top:0.6pt dashed #666; margin:1.4mm 0; }",

    /* corpo */
    ".dcorpo { flex:1; display:flex; flex-direction:column; min-height:0; }",

    /* cabeçalho */
    ".dcab { align-items:stretch; }",
    ".demit { flex-direction:row !important; align-items:center; justify-content:center;",
    "  gap:2mm; padding:1.4mm; }",
    ".dlogo { flex:0 0 auto; width:22mm; height:auto; }",
    ".demit-txt { min-width:0; font-size:6.2pt; line-height:1.32; }",
    ".demit-nome { font-size:8.4pt; font-weight:700; margin-bottom:.5mm; }",
    ".dcab-dir { flex:1; display:flex; flex-direction:column; min-width:0; }",
    ".dcab-dir > .dl { flex:0 0 auto; }",
    ".dcab-dir > .dl:first-child { flex:1; }",
    ".dmeio { align-items:center; justify-content:center; text-align:center; }",
    ".ddacte { font-size:13pt; font-weight:700; letter-spacing:1px; }",
    ".ddacte-sub { font-size:6pt; margin-top:.3mm; }",
    ".dbarras { align-items:center; justify-content:center; padding:1mm; }",
    ".dbarras svg { max-width:98%; height:10mm; }",
    ".dconsulta { font-size:5.6pt; text-align:center; justify-content:center; }",

    /* caixas de partes */
    ".dparte { padding-bottom:0.8mm; }",
    ".dparte-cab { display:flex; align-items:baseline; gap:2mm; margin-bottom:.3mm; }",
    ".dparte-cab .dr { flex:0 0 auto; }",
    ".dparte-nome { font-size:7.4pt; font-weight:700; min-width:0; word-break:break-word; }",
    ".dkv { display:flex; font-size:6pt; line-height:1.3; }",
    ".dk { flex:0 0 25mm; text-transform:uppercase; font-size:5pt; padding-top:.3mm;",
    "  white-space:nowrap; }",
    ".dkv-v { flex:1; min-width:0; word-break:break-word; }",

    /* componentes e totais */
    ".dcomp-bloco { flex:1; display:flex; flex-direction:column; min-width:0;",
    "  border-right:0.6pt solid #000; }",
    ".dcomp-bloco > .dl { flex:1; }",
    ".dcomp { justify-content:flex-start; }",
    ".dcomp-cab { display:flex; border-bottom:0.4pt solid #999; margin-bottom:.3mm; }",
    ".dcomp-cab .dr { flex:1; }",
    ".dcomp-lin { display:flex; font-size:7pt; line-height:1.3; }",
    ".dcomp-lin > span:first-child { flex:1; min-width:0; word-break:break-word; }",
    ".dcomp-val { flex:0 0 20mm; text-align:right; }",
    ".dtotais { flex:0 0 44mm; display:flex; flex-direction:column; }",
    ".dtotal { flex:1; border-right:0; border-bottom:0.6pt solid #000;",
    "  justify-content:center; }",
    ".dtotal-fim { border-bottom:0; }",

    ".drodape { flex:0 0 auto; font-size:5.4pt; text-align:right; padding-top:0.8mm; }",
].join("\n");



/**
 * Gera e baixa o DACTE em PDF.
 *
 * Monta a folha fora da tela, entrega ao html2pdf e descarta. Nada fica no
 * servidor: o documento é sempre derivado do CT-e no estado atual.
 */
async function baixarDacte(id) {
    let dados;
    try {
        dados = await _cteApi("/fiscal/cte/" + id + "/dacte");
    } catch (e) {
        alert("Nao foi possivel montar o DACTE:\n\n" + e.message);
        return;
    }

    const caixa = document.createElement("div");
    caixa.style.cssText = "position:fixed;left:-10000px;top:0;background:#fff;";
    caixa.innerHTML = "<style>" + _DACTE_CSS + "</style>" + _dacteHtml(dados);
    document.body.appendChild(caixa);

    const cte = dados.cte;
    const nome = "DACTE-" + (cte.numero || cte.id) + "-serie-" + (cte.serie || "0") + ".pdf";
    const limpar = () => {
        if (document.body.contains(caixa)) document.body.removeChild(caixa);
    };

    try {
        await html2pdf().set({
            // 5 mm de margem: a folha foi desenhada com 200 × 287 mm, que é
            // exatamente o A4 menos essas margens. Mexer aqui sem mexer no CSS
            // faz o DACTE encolher no meio da página ou vazar para a segunda.
            margin: [5, 5, 5, 5],
            filename: nome,
            image: { type: "jpeg", quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false },
            jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        }).from(caixa.querySelector(".dacte")).save();
    } catch (e) {
        alert("Falha ao gerar o PDF: " + e.message);
    } finally {
        limpar();
    }
}
