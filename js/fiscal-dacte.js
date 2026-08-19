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

const _DACTE_TIPOS = { 0: "NORMAL", 1: "COMPLEMENTO", 3: "SUBSTITUTO" };
const _DACTE_SERVICOS = {
    0: "NORMAL", 1: "SUBCONTRATACAO", 2: "REDESPACHO",
    3: "REDESPACHO INTERMEDIARIO", 4: "SERVICO VINCULADO A MULTIMODAL",
};
const _DACTE_TOMADORES = {
    0: "REMETENTE", 1: "EXPEDIDOR", 2: "RECEBEDOR", 3: "DESTINATARIO", 4: "OUTROS",
};

/** Bloco rotulado — é assim que o DACTE apresenta cada campo. */
function _dCampo(rotulo, valor, largura) {
    const vazio = valor === "" || valor === null || valor === undefined;
    return '<div class="dc" style="' + (largura ? "flex:0 0 " + largura + ";" : "flex:1;") + '">' +
           '<span class="dr">' + _dEsc(rotulo) + '</span>' +
           '<span class="dv">' + (vazio ? "&nbsp;" : _dEsc(valor)) + '</span></div>';
}

function _dParte(titulo, p) {
    if (!p) return "";
    const temAlgo = p.cnpj || p.cpf || p.nome || p.razao_social;
    if (!temAlgo) return "";
    const e = p.endereco || {};
    const local = [e.municipio, e.uf].filter(Boolean).join(" / ");
    const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(", ");
    return '<div class="dsec"><div class="dtit">' + _dEsc(titulo) + '</div>' +
        '<div class="dlinha">' +
            _dCampo("Razao social / Nome", p.nome || p.razao_social || "") +
            _dCampo("CNPJ / CPF", _dDoc(p.cnpj || p.cpf), "150px") +
            _dCampo("Inscricao estadual", p.ie || "", "120px") +
        '</div><div class="dlinha">' +
            _dCampo("Endereco", rua) +
            _dCampo("Bairro", e.bairro || "", "130px") +
            _dCampo("Municipio / UF", local, "160px") +
            _dCampo("CEP", _dCep(e.cep), "80px") +
        '</div></div>';
}

function _dacteIcms(d) {
    const grupo = d.imposto && d.imposto.ICMS;
    if (grupo) {
        const nome = Object.keys(grupo)[0];
        const c = grupo[nome] || {};
        return {
            cst: nome + " — CST " + (c.CST || ""),
            vBC: c.vBC !== undefined ? c.vBC : c.vBCOutraUF,
            pICMS: c.pICMS !== undefined ? c.pICMS : c.pICMSOutraUF,
            vICMS: c.vICMS !== undefined ? c.vICMS : c.vICMSOutraUF,
        };
    }
    // Rascunho ainda não validado: mostra os campos soltos da tela.
    return {
        cst: d.imposto_cst ? "CST " + d.imposto_cst : "",
        vBC: d.imposto_vbc, pICMS: d.imposto_aliquota, vICMS: d.imposto_valor,
    };
}

function _dacteChaveAnterior(d) {
    const a = Array.isArray(d.docAnt) ? d.docAnt[0] : d.docAnt;
    if (!a) return "";
    return a.chave || (a.chaves || [])[0] || "";
}

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

    const linhasComp = comps.length
        ? comps.map((c) => '<tr><td>' + _dEsc(c.nome) + '</td><td class="dnum">' +
                           _dNum(c.valor) + '</td></tr>').join("")
        : '<tr><td colspan="2">&nbsp;</td></tr>';

    const linhasDoc = documentos.length
        ? documentos.map((x) => '<tr><td>' + _dEsc(x.tipo_documento || "NFe") + '</td>' +
              '<td>' + _dEsc([x.serie, x.numero].filter(Boolean).join(" / ")) + '</td>' +
              '<td class="dmono">' + _dEsc(x.chave_nfe || "") + '</td></tr>').join("")
        : '<tr><td colspan="3">&nbsp;</td></tr>';

    return '<div class="dacte">' +
      (homolog ? '<div class="dmarca">SEM VALOR FISCAL — AMBIENTE DE HOMOLOGACAO</div>' : "") +

      '<div class="dtopo">' +
        '<div class="dtopo-emit">' +
          '<div class="demit-nome">' + _dEsc(emitente.razao_social || "") + '</div>' +
          '<div class="demit-end">' +
            _dEsc([emitente.logradouro, emitente.numero].filter(Boolean).join(", ")) + '<br>' +
            _dEsc(emitente.bairro || "") + " — " + _dEsc(emitente.municipio || "") +
            "/" + _dEsc(emitente.uf || "") +
            (emitente.cep ? " — CEP " + _dEsc(_dCep(emitente.cep)) : "") + '<br>' +
            "CNPJ " + _dEsc(_dDoc(emitente.cnpj)) + " — IE " + _dEsc(emitente.ie || "") +
            (emitente.telefone ? "<br>Fone " + _dEsc(emitente.telefone) : "") +
          '</div>' +
        '</div>' +

        '<div class="dtopo-doc">' +
          '<div class="ddacte">DACTE</div>' +
          '<div class="ddacte-sub">Documento Auxiliar do Conhecimento<br>de Transporte Eletronico</div>' +
          '<div class="dlinha">' +
            _dCampo("Modelo", cte.modelo || "57") +
            _dCampo("Serie", cte.serie === null || cte.serie === undefined ? "" : cte.serie) +
            _dCampo("Numero", cte.numero === null || cte.numero === undefined ? "" : cte.numero) +
            _dCampo("Folha", "1/1") +
          '</div><div class="dlinha">' +
            _dCampo("Modal", "RODOVIARIO") +
            _dCampo("Tipo do CT-e", _DACTE_TIPOS[ide.tpCTe] || "") +
            _dCampo("Tipo do servico", _DACTE_SERVICOS[ide.tpServ] || "") +
          '</div>' +
        '</div>' +

        '<div class="dtopo-chave">' +
          '<div class="dbarras">' + _dacteBarras(cte.chave_acesso) + '</div>' +
          '<div class="dlinha">' + _dCampo("Chave de acesso", _dChave(cte.chave_acesso)) + '</div>' +
          '<div class="dconsulta">Consulta de autenticidade no portal nacional do CT-e, ' +
          'no site da SEFAZ autorizadora, ou em www.cte.fazenda.gov.br</div>' +
        '</div>' +
      '</div>' +

      '<div class="dlinha">' +
        _dCampo(autorizado ? "Protocolo de autorizacao de uso"
                           : "Situacao (documento ainda nao autorizado)",
                autorizado ? (cte.protocolo || "") + " — " + _dData(cte.data_autorizacao)
                           : cte.status) +
        _dCampo("Emissao", _dData(cte.data_emissao || cte.criado_em), "170px") +
      '</div>' +

      '<div class="dlinha">' +
        _dCampo("CFOP — Natureza da prestacao", (ide.CFOP || "") + " — " + (ide.natOp || "")) +
      '</div>' +
      '<div class="dlinha">' +
        _dCampo("Inicio da prestacao", (ide.xMunIni || "") + " / " + (ide.UFIni || "")) +
        _dCampo("Termino da prestacao", (ide.xMunFim || "") + " / " + (ide.UFFim || "")) +
        _dCampo("Tomador", _DACTE_TOMADORES[ide.toma] || "", "150px") +
      '</div>' +

      _dParte("Remetente", d.remetente) +
      _dParte("Destinatario", d.destinatario) +
      _dParte("Expedidor", d.expedidor) +
      _dParte("Recebedor", d.recebedor) +
      _dParte("Tomador do servico", d.tomador) +

      '<div class="dsec"><div class="dtit">Produtos transportados</div>' +
        '<div class="dlinha">' +
          _dCampo("Produto predominante", carga.produto_predominante || "") +
          _dCampo("Outras caracteristicas", carga.outras_caracteristicas || "") +
          _dCampo("Valor total da carga", _dNum(carga.valor_carga), "130px") +
        '</div><div class="dlinha">' +
          _dCampo("Quantidade", _dNum(carga.quantidade !== undefined ? carga.quantidade : carga.peso, 4), "130px") +
          _dCampo("Unidade", carga.unidade || "", "90px") +
          _dCampo("Tipo de medida", carga.tipo_medida || "") +
        '</div></div>' +

      '<div class="dsec"><div class="dtit">Componentes do valor da prestacao do servico</div>' +
        '<table class="dtab"><thead><tr><th>Nome</th><th class="dnum">Valor</th></tr></thead>' +
        '<tbody>' + linhasComp + '</tbody></table>' +
        '<div class="dlinha">' +
          _dCampo("Valor total da prestacao", _dNum(d.vPrest && d.vPrest.vTPrest)) +
          _dCampo("Valor a receber", _dNum(d.vPrest && d.vPrest.vRec)) +
        '</div></div>' +

      '<div class="dsec"><div class="dtit">Informacoes relativas ao imposto</div>' +
        '<div class="dlinha">' +
          _dCampo("Situacao tributaria", icms.cst) +
          _dCampo("Base de calculo", _dNum(icms.vBC), "130px") +
          _dCampo("Aliquota ICMS", icms.pICMS ? _dNum(icms.pICMS) + "%" : "", "110px") +
          _dCampo("Valor do ICMS", _dNum(icms.vICMS), "130px") +
        '</div>' +
        ((cte.valor_ibs !== null && cte.valor_ibs !== undefined) ||
         (cte.valor_cbs !== null && cte.valor_cbs !== undefined)
          ? '<div class="dlinha">' +
              _dCampo("Valor do IBS", _dNum(cte.valor_ibs), "150px") +
              _dCampo("Valor da CBS", _dNum(cte.valor_cbs), "150px") +
              _dCampo("Valor total do documento", _dNum(cte.valor_total_dfe)) +
            '</div>'
          : "") +
      '</div>' +

      '<div class="dsec"><div class="dtit">Documentos originarios</div>' +
        '<table class="dtab"><thead><tr><th>Tipo</th><th>Serie / Numero</th>' +
        '<th>Chave de acesso</th></tr></thead><tbody>' + linhasDoc + '</tbody></table></div>' +

      '<div class="dsec"><div class="dtit">Modal rodoviario</div>' +
        '<div class="dlinha">' +
          _dCampo("RNTRC da empresa", (d.modal && d.modal.rntrc) || "") +
          _dCampo("CT-e anterior (redespacho)", _dacteChaveAnterior(d)) +
        '</div></div>' +

      '<div class="dsec"><div class="dtit">Observacoes</div>' +
        '<div class="dobs">' + _dEsc((d.compl && d.compl.xObs) || "") + '&nbsp;</div></div>' +
    '</div>';
}

const _DACTE_CSS = [
".dacte { position:relative; width:190mm; background:#fff; color:#000;",
"  font-family:Arial, Helvetica, sans-serif; font-size:7.5pt; line-height:1.25; }",
".dacte * { box-sizing:border-box; }",
".dmarca { position:absolute; top:38%; left:0; right:0; text-align:center;",
"  font-size:20pt; font-weight:700; color:rgba(200,0,0,.16);",
"  transform:rotate(-20deg); pointer-events:none; z-index:5; letter-spacing:1px; }",
".dtopo { display:flex; border:1px solid #000; }",
".dtopo-emit { flex:1.1; padding:5px 6px; border-right:1px solid #000; }",
".demit-nome { font-size:9.5pt; font-weight:700; margin-bottom:3px; }",
".demit-end { font-size:7pt; }",
".dtopo-doc { flex:1; border-right:1px solid #000; text-align:center; }",
".ddacte { font-size:15pt; font-weight:700; margin-top:4px; }",
".ddacte-sub { font-size:6.5pt; margin-bottom:4px; }",
".dtopo-chave { flex:1.15; padding:4px; }",
".dbarras { text-align:center; margin-bottom:3px; }",
".dbarras svg { max-width:100%; height:auto; }",
".dconsulta { font-size:6pt; text-align:center; margin-top:3px; }",
".dlinha { display:flex; }",
".dc { border:1px solid #000; border-top:0; border-left:0; padding:2px 4px; min-width:0; }",
".dlinha > .dc:last-child { border-right:0; }",
".dr { display:block; font-size:5.8pt; text-transform:uppercase; color:#333; }",
".dv { display:block; font-size:7.5pt; font-weight:600; word-break:break-word; }",
".dsec { border:1px solid #000; border-top:0; }",
".dtit { background:#e8e8e8; font-size:6.5pt; font-weight:700; text-transform:uppercase;",
"  padding:2px 5px; border-bottom:1px solid #000; }",
".dtab { width:100%; border-collapse:collapse; font-size:7pt; }",
".dtab th, .dtab td { border-bottom:1px solid #000; border-right:1px solid #000;",
"  padding:2px 5px; text-align:left; }",
".dtab th { background:#f3f3f3; font-size:6pt; text-transform:uppercase; }",
".dtab tr:last-child td { border-bottom:0; }",
".dtab th:last-child, .dtab td:last-child { border-right:0; }",
".dnum { text-align:right; }",
'.dmono { font-family:Consolas, "Courier New", monospace; font-size:6.5pt; }',
".dobs { padding:4px 5px; min-height:26px; font-size:7pt; }",
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
