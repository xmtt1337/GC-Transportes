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
// O texto é o que o DACTE realmente imprime. As descrições de CST vêm da
// documentação do próprio XSD (cteTiposBasico_v4.00.xsd), não de memória.
const _DACTE_TIPOS = {
    0: "CT-e Normal", 1: "CT-e de Complemento de Valores", 3: "CT-e de Substituição",
};
const _DACTE_SERVICOS = {
    0: "Normal", 1: "Subcontratação", 2: "Redespacho",
    3: "Redespacho Intermediário", 4: "Serviço Vinculado a Multimodal",
};
const _DACTE_TOMADORES = {
    0: "REMETENTE", 1: "EXPEDIDOR", 2: "RECEBEDOR", 3: "DESTINATARIO", 4: "OUTROS",
};
const _DACTE_CST = {
    "00": "00 - tributação normal ICMS",
    "20": "20 - tributação com BC reduzida do ICMS",
    "40": "40 - ICMS isento, não tributado ou diferido",
    "41": "41 - ICMS isento, não tributado ou diferido",
    "51": "51 - ICMS diferido",
    "60": "60 - ICMS cobrado por substituição tributária",
    "90": "90 - ICMS outros",
};

// Logo só sai na folha da empresa dona dele. Carimbar a marca da GC no DACTE
// de outro emitente seria falsificar a origem do documento.
const _DACTE_CNPJ_GC = "40595873000109";
const _DACTE_LOGO_GC = "img/Transportadoras/GC%20preto%20sem%20fundo.png";

const _dDig = (v) => String(v || "").replace(/\D/g, "");

/** Célula rotulada: rótulo miúdo em cima, valor embaixo. É o átomo do DACTE. */
function _dCel(rotulo, valor, opcoes) {
    const o = opcoes || {};
    const vazio = valor === "" || valor === null || valor === undefined;
    const estilo = o.largura ? "flex:0 0 " + o.largura : "flex:" + (o.peso || 1);
    return '<div class="dc" style="' + estilo + '">' +
        '<span class="dr">' + _dEsc(rotulo) + "</span>" +
        '<span class="dv' + (o.centro ? " dcentro" : "") + (o.forte ? " dforte" : "") +
        (o.num ? " dnum" : "") + '">' + (vazio ? "&nbsp;" : _dEsc(valor)) + "</span></div>";
}

const _dLin = (...celulas) => '<div class="dlin">' + celulas.join("") + "</div>";
const _dTit = (texto) => '<div class="dtit">' + _dEsc(texto) + "</div>";

/** Par rótulo/valor em linha — o formato das colunas de remetente e afins. */
function _dKv(rotulo, valor) {
    const vazio = valor === "" || valor === null || valor === undefined;
    return '<div class="dkv"><span class="dk">' + _dEsc(rotulo) + "</span>" +
        '<span class="dkval">' + (vazio ? "&nbsp;" : _dEsc(valor)) + "</span></div>";
}

const _dEnderecoLinha = (e) => {
    if (!e) return "";
    const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
    const resto = [e.complemento, e.bairro].filter(Boolean).join(" - ");
    return [rua, resto].filter(Boolean).join("  ");
};

const _dMunUf = (e) => (e ? [e.municipio, e.uf].filter(Boolean).join("/") : "");

/**
 * Coluna de uma parte (remetente, destinatário, expedidor, recebedor).
 *
 * Sai mesmo vazia: no DACTE as quatro caixas são fixas, e a ausência do
 * expedidor é informação — quem confere a carga precisa ver o campo em branco,
 * não a caixa sumida.
 */
function _dColunaParte(titulo, p) {
    const parte = p || {};
    const e = parte.endereco || {};
    return '<div class="dcol">' + _dTit(titulo) +
        '<div class="dnome">' + _dEsc(parte.nome || parte.razao_social || "") + "&nbsp;</div>" +
        _dKv("ENDEREÇO", _dEnderecoLinha(e)) +
        _dKv("MUNICÍPIO", _dMunUf(e)) +
        _dKv("CEP", _dCep(e.cep)) +
        _dKv("CNPJ/CPF", _dDoc(parte.cnpj || parte.cpf)) +
        _dKv("INSC.ESTADUAL", parte.ie || "") +
        _dKv("PAIS", e.pais || (e.uf ? "BRASIL" : "")) +
        _dKv("FONE", parte.telefone || "") +
        "</div>";
}

function _dacteIcms(d) {
    const grupo = d.imposto && d.imposto.ICMS;
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
    // Rascunho ainda não validado: mostra os campos soltos da tela.
    const cst = d.imposto_cst ? String(d.imposto_cst) : "";
    return {
        cst: _DACTE_CST[cst] || cst,
        vBC: d.imposto_vbc, pICMS: d.imposto_aliquota, vICMS: d.imposto_valor,
        pRedBC: undefined,
    };
}

/** Medidas da carga, no formato "01-KG 801,000" do DACTE. */
function _dacteMedidas(carga) {
    const lista = Array.isArray(carga.quantidades) && carga.quantidades.length
        ? carga.quantidades
        : (carga.quantidade !== undefined && carga.quantidade !== null
            ? [{ cUnid: carga.unidade, tpMed: carga.tipo_medida, quantidade: carga.quantidade }]
            : []);
    return lista
        .map((q) => [q.cUnid, q.tpMed].filter(Boolean).join("-") + "  " + _dNum(q.quantidade, 3))
        .join("   ");
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
    const icms = _dacteIcms(d);

    // IBS/CBS: o grupo fica montado em `cte.ibscbs`, na forma do schema.
    const ib = cte.ibscbs || {};
    const g = ib.gIBSCBS || {};
    const uf = g.gIBSUF || {};
    const mun = g.gIBSMun || {};
    const cbs = g.gCBS || {};

    const numero = cte.numero === null || cte.numero === undefined ? "" : String(cte.numero);
    const numeroLongo = numero ? numero.padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1.") : "";

    // ── canhoto: o recibo que o destinatário assina e devolve
    const canhoto =
        '<div class="dcanhoto">' +
            '<div class="dcanhoto-esq">' +
                '<div class="ddeclaro">DECLARO QUE RECEBI OS VOLUMES DESTE CONHECIMENTO EM ' +
                "PERFEITO ESTADO PELO QUE DOU POR CUMPRIDO O PRESENTE CONTRATO DE TRANSPORTE</div>" +
                _dLin(
                    _dCel("Nome:", "", { peso: 2 }),
                    _dCel("ASSINATURA/CARIMBO", "", { peso: 2 }),
                    _dCel("CHEGADA DATA/HORA", "___/___/______   ___:___", { largura: "42mm" }),
                    _dCel("SAÍDA DATA/HORA", "___/___/______   ___:___", { largura: "42mm" })
                ) +
            "</div>" +
            '<div class="dcanhoto-dir">' +
                '<div class="dcanhoto-cte">CT-e</div>' +
                '<div class="dcanhoto-num">N°: ' + _dEsc(numeroLongo) + "</div>" +
                '<div class="dcanhoto-num">SÉRIE: ' + _dEsc(cte.serie === null || cte.serie === undefined ? "" : cte.serie) + "</div>" +
                '<div class="dcanhoto-rg">RG/CPF: ____________________</div>' +
            "</div>" +
        "</div>" +
        '<div class="dcorte"></div>';

    // ── cabeçalho de três colunas
    const logo = _dDig(emitente.cnpj) === _DACTE_CNPJ_GC
        ? '<img class="dlogo" src="' + _DACTE_LOGO_GC + '" alt="">'
        : "";

    const cabecalho =
        '<div class="dcab">' +
            '<div class="dcab-emit">' + _dTit("IDENTIFICAÇÃO DO EMITENTE") +
                '<div class="demit">' + logo +
                    '<div class="demit-txt">' +
                        '<div class="demit-nome">' + _dEsc(emitente.razao_social || "") + "</div>" +
                        _dEsc([emitente.logradouro, emitente.numero].filter(Boolean).join(", ")) + "<br>" +
                        _dEsc([emitente.complemento, emitente.bairro].filter(Boolean).join(" - ")) + "<br>" +
                        _dEsc([emitente.municipio, emitente.uf].filter(Boolean).join("/")) +
                        (emitente.cep ? " - CEP: " + _dEsc(_dCep(emitente.cep)) : "") + "<br>" +
                        (emitente.telefone ? "Fone: " + _dEsc(emitente.telefone) + "<br>" : "") +
                        "CNPJ: " + _dEsc(_dDoc(emitente.cnpj)) + "<br>" +
                        "Inscrição Estadual: " + _dEsc(emitente.ie || "") +
                    "</div>" +
                "</div>" +
            "</div>" +

            '<div class="dcab-meio">' +
                '<div class="ddacte">DACTE</div>' +
                '<div class="ddacte-sub">Documento Auxiliar do Conhecimento de ' +
                "Transporte Eletrônico</div>" +
                _dLin(_dCel("Modal", "Rodoviário", { centro: true })) +
                _dLin(
                    _dCel("MODELO", cte.modelo || "57", { centro: true }),
                    _dCel("SERIE", cte.serie === null || cte.serie === undefined ? "" : cte.serie, { centro: true }),
                    _dCel("NÚMERO", numero, { centro: true, forte: true }),
                    _dCel("FOLHA", "1/1", { centro: true })
                ) +
                _dLin(_dCel("DATA E HORA DE EMISSÃO",
                    _dData(cte.data_emissao || cte.criado_em), { centro: true })) +
                _dLin(
                    _dCel("TIPO DO CT-e", _DACTE_TIPOS[ide.tpCTe] || ""),
                    _dCel("TIPO DO SERVIÇO", _DACTE_SERVICOS[ide.tpServ] || "")
                ) +
            "</div>" +

            '<div class="dcab-dir">' +
                '<div class="dbarras">' + _dacteBarras(cte.chave_acesso) + "</div>" +
                _dLin(_dCel("Chave de Acesso", _dChave(cte.chave_acesso), { centro: true })) +
                _dLin(
                    _dCel("TOMADOR DO SERVIÇO", _DACTE_TOMADORES[ide.toma] || ""),
                    _dCel("INDICADOR DE CT-E GLOBALIZADO",
                        String(ide.indGlobalizado) === "1" ? "SIM" : "NÃO", { largura: "34mm", centro: true })
                ) +
                '<div class="dconsulta">Consulta de autenticidade no portal nacional do CT-e, ' +
                "no site da Sefaz Autorizadora ou em http://www.cte.fazenda.gov.br/portal</div>" +
            "</div>" +
        "</div>";

    // ── componentes: o DACTE imprime quatro pares Nome/Valor por linha
    const grupos = [];
    for (let i = 0; i < Math.max(comps.length, 4); i += 4) grupos.push(comps.slice(i, i + 4));
    const linhasComp = grupos.map((g) => _dLin(
        ...[0, 1, 2, 3].map((k) => {
            const c = g[k];
            return '<div class="dc dpar" style="flex:1">' +
                '<span class="dr">Nome</span><span class="dv">' +
                (c ? _dEsc(c.nome) : "&nbsp;") + "</span></div>" +
                '<div class="dc" style="flex:0 0 22mm">' +
                '<span class="dr">Valor</span><span class="dv dnum">' +
                (c ? _dNum(c.valor) : "&nbsp;") + "</span></div>";
        })
    )).join("");

    // ── documentos originários: duas colunas de três campos, como no MOC
    const pares = [];
    for (let i = 0; i < Math.max(documentos.length, 2); i += 2) pares.push(documentos.slice(i, i + 2));
    const celulaDoc = (x) => x
        ? _dCel("TP DOC.", x.tipo_documento || "", { largura: "18mm" }) +
          _dCel("CNPJ/CPF EMIT.", _dCnpjDaChave(x.chave_nfe), { largura: "34mm" }) +
          _dCel("SÉRIE/NRO DOC.", [x.serie, x.numero].filter(Boolean).join(" / "))
        : _dCel("TP DOC.", "", { largura: "18mm" }) +
          _dCel("CNPJ/CPF EMIT.", "", { largura: "34mm" }) +
          _dCel("SÉRIE/NRO DOC.", "");
    const linhasDoc = pares
        .map((p) => _dLin(celulaDoc(p[0]), celulaDoc(p[1])))
        .join("");

    return '<div class="dacte">' +
        (homolog ? '<div class="dmarca">SEM VALOR FISCAL — HOMOLOGAÇÃO</div>' : "") +

        canhoto +
        cabecalho +

        _dLin(
            _dCel("CFOP - NATUREZA DA PRESTAÇÃO",
                [ide.CFOP, ide.natOp].filter(Boolean).join("-"), { peso: 2 }),
            _dCel(autorizado ? "PROTOCOLO DE AUTORIZAÇÃO DE USO" : "SITUAÇÃO DO DOCUMENTO",
                autorizado
                    ? [cte.protocolo, _dData(cte.data_autorizacao)].filter(Boolean).join("  ")
                    : cte.status || "")
        ) +
        _dLin(
            _dCel("ORIGEM DA PRESTAÇÃO", [ide.xMunIni, ide.UFIni].filter(Boolean).join("/")),
            _dCel("DESTINO DA PRESTAÇÃO", [ide.xMunFim, ide.UFFim].filter(Boolean).join("/"))
        ) +

        '<div class="dlin dpartes">' +
            _dColunaParte("REMETENTE", d.remetente) +
            _dColunaParte("DESTINATÁRIO", d.destinatario) +
        "</div>" +
        '<div class="dlin dpartes">' +
            _dColunaParte("EXPEDIDOR", d.expedidor) +
            _dColunaParte("RECEBEDOR", d.recebedor) +
        "</div>" +

        _dLin(
            _dCel("Tomador:", (d.tomador && (d.tomador.nome || d.tomador.razao_social)) || "", { peso: 2 }),
            _dCel("MUNICÍPIO", _dMunUf(d.tomador && d.tomador.endereco)),
            _dCel("CEP", _dCep(d.tomador && d.tomador.endereco && d.tomador.endereco.cep), { largura: "24mm" })
        ) +
        _dLin(
            _dCel("Endereço:", _dEnderecoLinha(d.tomador && d.tomador.endereco), { peso: 2 }),
            _dCel("CPF/CNPJ:", _dDoc(d.tomador && (d.tomador.cnpj || d.tomador.cpf)), { largura: "34mm" }),
            _dCel("INSC.ESTADUAL", (d.tomador && d.tomador.ie) || "", { largura: "28mm" }),
            _dCel("PAIS", d.tomador ? "BRASIL" : "", { largura: "20mm" }),
            _dCel("FONE", (d.tomador && d.tomador.telefone) || "", { largura: "28mm" })
        ) +

        _dLin(
            _dCel("PRODUTO PREDOMINANTE", carga.produto_predominante || "", { peso: 2 }),
            _dCel("OUTRAS CARACTERISTICAS DA CARGA", carga.outras_caracteristicas || "", { peso: 2 }),
            _dCel("VALOR TOTAL DA MERCADORIA", _dNum(carga.valor_carga), { largura: "32mm", num: true }),
            _dCel("Unidade/Quantidade", _dacteMedidas(carga), { largura: "38mm" })
        ) +

        _dTit("COMPONENTES DO VALOR DA PRESTAÇÃO DO SERVIÇO") +
        linhasComp +
        _dLin(
            _dCel("VALOR TOTAL DO SERVIÇO", _dNum(d.vPrest && d.vPrest.vTPrest), { num: true, forte: true }),
            _dCel("VALOR A RECEBER", _dNum(d.vPrest && d.vPrest.vRec), { num: true, forte: true })
        ) +

        _dTit("INFORMAÇÕES RELATIVAS AO IMPOSTO") +
        _dLin(
            _dCel("SITUAÇÃO TRIBUTÁRIA", icms.cst, { peso: 2 }),
            _dCel("BASE DE CALCULO", _dNum(icms.vBC), { num: true }),
            _dCel("ALIQ. ICMS", _dNum(icms.pICMS), { num: true, largura: "22mm" }),
            _dCel("VALOR DO ICMS", _dNum(icms.vICMS), { num: true }),
            _dCel("% RED.BC", _dNum(icms.pRedBC), { num: true, largura: "20mm" })
        ) +
        _dLin(
            _dCel("Código Situação Tributária do IBS/CBS",
                [ib.CST, ib.cClassTrib].filter(Boolean).join(" / "), { peso: 2 }),
            _dCel("v. BC IBS/CBS", _dNum(g.vBC), { num: true }),
            _dCel("p. IBS UF", _dNum(uf.pIBSUF, 4), { num: true }),
            _dCel("v. IBS UF", _dNum(uf.vIBSUF), { num: true }),
            _dCel("p. IBS Mun", _dNum(mun.pIBSMun, 4), { num: true }),
            _dCel("v. IBS Mun.", _dNum(mun.vIBSMun), { num: true }),
            _dCel("p. CBS", _dNum(cbs.pCBS, 4), { num: true }),
            _dCel("v. CBS", _dNum(cbs.vCBS), { num: true })
        ) +

        _dTit("INFORMAÇÕES SOBRE OS VEÍCULOS NOVOS TRANSPORTADOS") +
        _dLin(
            _dCel("Chassi:", ""), _dCel("Cod. Cor:", ""), _dCel("Cor:", ""),
            _dCel("Marca:", ""), _dCel("Valor Unitário Veículo:", ""),
            _dCel("Valor Frete Veículo:", "")
        ) +

        _dTit("DOCUMENTOS ORIGINÁRIOS") +
        linhasDoc +

        _dTit("OBSERVAÇÕES GERAIS") +
        '<div class="dobs">' + _dEsc((d.compl && d.compl.xObs) || "") + "&nbsp;</div>" +

        _dTit("INFORMAÇÕES ESPECÍFICAS DO MODAL RODOVIÁRIO") +
        _dLin(
            _dCel("RNTRC DA EMPRESA", (d.modal && d.modal.rntrc) || ""),
            _dCel("DATA PREV. ENTREGA", "")
        ) +

        '<div class="dlin dreserva">' +
            '<div class="dc" style="flex:1"><span class="dr">USO EXCLUSIVO DO EMISSOR DO CT-e</span>' +
            '<span class="dv">&nbsp;</span></div>' +
            '<div class="dc" style="flex:1"><span class="dr">RESERVADO AO FISCO</span>' +
            '<span class="dv">&nbsp;</span></div>' +
        "</div>" +

        '<div class="drodape">Data/Hora Impressão: ' +
        _dEsc(new Date().toLocaleString("pt-BR")) + "</div>" +
    "</div>";
}

const _DACTE_CSS = [
    ".dacte { position:relative; width:190mm; background:#fff; color:#000;",
    "  font-family:Arial, Helvetica, sans-serif; font-size:6.5pt; line-height:1.15; }",
    ".dacte * { box-sizing:border-box; }",
    ".dmarca { position:absolute; top:42%; left:0; right:0; text-align:center;",
    "  font-size:26pt; font-weight:700; color:rgba(190,0,0,.13);",
    "  transform:rotate(-22deg); pointer-events:none; z-index:5; letter-spacing:2px; }",

    /* canhoto */
    ".dcanhoto { display:flex; border:1px solid #000; }",
    ".dcanhoto-esq { flex:1; border-right:1px solid #000; }",
    ".ddeclaro { padding:3px 4px; font-size:6pt; border-bottom:1px solid #000; }",
    ".dcanhoto-dir { flex:0 0 46mm; padding:4px 6px; text-align:center; }",
    ".dcanhoto-cte { font-size:13pt; font-weight:700; line-height:1.1; }",
    ".dcanhoto-num { font-size:8pt; font-weight:700; }",
    ".dcanhoto-rg { font-size:6.5pt; margin-top:4px; }",
    ".dcorte { border-top:1px dashed #555; margin:2px 0 3px; }",

    /* cabeçalho */
    ".dcab { display:flex; border:1px solid #000; }",
    ".dcab-emit { flex:1.05; border-right:1px solid #000; display:flex; flex-direction:column; }",
    ".demit { display:flex; gap:5px; padding:4px 5px; font-size:6.3pt; }",
    ".dlogo { width:17mm; height:17mm; object-fit:contain; flex:0 0 auto; }",
    ".demit-txt { min-width:0; }",
    ".demit-nome { font-size:8.5pt; font-weight:700; margin-bottom:2px; }",
    ".dcab-meio { flex:1; border-right:1px solid #000; display:flex; flex-direction:column; }",
    ".ddacte { font-size:16pt; font-weight:700; text-align:center; margin-top:3px; }",
    ".ddacte-sub { font-size:6pt; text-align:center; padding:0 6px 3px; }",
    ".dcab-dir { flex:1.25; display:flex; flex-direction:column; }",
    ".dbarras { text-align:center; padding:4px 3px 2px; }",
    ".dbarras svg { max-width:100%; height:12mm; }",
    ".dconsulta { font-size:5.6pt; text-align:center; padding:3px 4px; flex:1; }",

    /* célula rotulada */
    ".dlin { display:flex; border:1px solid #000; border-top:0; }",
    ".dcab .dlin, .dcanhoto .dlin { border-left:0; border-right:0; border-bottom:0;",
    "  border-top:1px solid #000; }",
    ".dc { border-right:1px solid #000; padding:1px 3px; min-width:0; overflow:hidden; }",
    ".dlin > .dc:last-child, .dlin > *:last-child > .dc:last-child { border-right:0; }",
    ".dr { display:block; font-size:5.2pt; text-transform:uppercase; color:#000;",
    "  letter-spacing:.2px; white-space:nowrap; overflow:hidden; }",
    ".dv { display:block; font-size:7pt; min-height:9pt; word-break:break-word; }",
    ".dforte { font-weight:700; font-size:8pt; }",
    ".dcentro { text-align:center; }",
    ".dnum { text-align:right; }",
    ".dpar { border-right:0; }",

    /* seções */
    ".dtit { background:#dcdcdc; font-size:6pt; font-weight:700; text-transform:uppercase;",
    "  padding:1px 4px; border:1px solid #000; border-top:0; }",
    ".dpartes { padding:0; }",
    ".dcol { flex:1; min-width:0; border-right:1px solid #000; }",
    ".dpartes > .dcol:last-child { border-right:0; }",
    ".dcol .dtit { border-left:0; border-right:0; }",
    ".dnome { font-size:7.5pt; font-weight:700; padding:1px 4px; }",
    ".dkv { display:flex; padding:0 4px; font-size:6.4pt; }",
    ".dk { flex:0 0 24mm; text-transform:uppercase; font-size:5.6pt; padding-top:.5pt; }",
    ".dkval { flex:1; min-width:0; word-break:break-word; }",
    ".dobs { border:1px solid #000; border-top:0; padding:3px 4px; min-height:22px; font-size:6.5pt; }",
    ".dreserva .dc { min-height:34px; }",
    ".drodape { font-size:5.6pt; text-align:right; padding-top:2px; }",
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
            margin: [8, 8, 8, 8],
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
