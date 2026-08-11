// ───── TORRE DE CONTROLE → NA RUA ─────
// O relatório da transportadora vira o retrato do que ainda não foi entregue, com duas
// tabelas dinâmicas (por entregador e por cidade) recortadas por quantos dias o pacote já
// passou do prazo. O arquivo é lido aqui no navegador: o servidor recebe linha pronta e não
// precisa saber o formato de CSV de cada transportadora.

const NR_TRANSPORTADORAS = [
    { chave: "loggi",         rotulo: "Loggi",         cor: "#12A5E8" },
    { chave: "anjun",         rotulo: "Anjun",         cor: "#22C55E" },
    { chave: "jt",            rotulo: "J&T",           cor: "#EF4444" },
    { chave: "imile",         rotulo: "iMile",         cor: "#9333EA" },
    { chave: "shopee",        rotulo: "Shopee",        cor: "#F97316" },
    { chave: "total_express", rotulo: "Total Express", cor: "#8494a9" },
];

// Colunas do relatório, por transportadora. `nomes` são as grafias já vistas — o cabeçalho
// muda de acento e de caixa entre um export e outro, então o casamento é pelo nome
// normalizado, nunca pela posição da coluna.
const NR_COLUNAS = {
    loggi: [
        { id: "destinatario",  nomes: ["nome do destinatario", "destinatario"] },
        { id: "endereco",      nomes: ["endereco completo", "endereco"] },
        { id: "codigo_barras", nomes: ["codigo de barras", "codigo"] },
        { id: "id_pacote",     nomes: ["id do pacote", "id pacote"] },
        { id: "prazo",         nomes: ["prazo"] },
        { id: "entregador",    nomes: ["entregador", "motorista"] },
        { id: "status",        nomes: ["status do pacote", "status"] },
    ],
};

// Faixas de dias. `ate` é o limite superior inclusivo; a última é aberta.
// "No prazo" existe porque o relatório traz pacote que ainda não venceu — jogá-lo em
// "1 dia" inventaria atraso que não existe.
const NR_FAIXAS = [
    { chave: "no_prazo", rotulo: "No prazo", ate: 0 },
    { chave: "d1",       rotulo: "1 dia",    ate: 1 },
    { chave: "d2",       rotulo: "2 dias",   ate: 2 },
    { chave: "d3",       rotulo: "3 dias",   ate: 3 },
    { chave: "d4",       rotulo: "4 dias +", ate: Infinity },
];

// Uma rampa ordinal por transportadora, no hue da marca. Os degraus de luminância são os
// mesmos em todas (copiados da rampa azul de referência), então a legibilidade não muda de
// uma pra outra — só a cor. As seis passaram no validador contra a superfície #0f1520:
// monotonia de luminância, degrau visível entre passos e contraste da ponta clara.
//
// Sem amarelo/vermelho de severidade: "dias de atraso" é uma escala ORDENADA, e escala
// ordenada pede um hue só. Misturar cor de status aí gasta o vermelho — que no sistema
// significa erro — pra dizer o que a posição na escala já diz.
const NR_RAMPAS = {
    loggi:         ["#06577c", "#0673a4", "#0e91cc", "#51aee4", "#90caef"],
    anjun:         ["#006229", "#038138", "#21a04d", "#6ab87b", "#9ed0a6"],
    jt:            ["#892c2a", "#b13f3c", "#d75852", "#e4857d", "#f1aea8"],
    imile:         ["#5f3b8a", "#7c51b1", "#9a6bd6", "#b291e1", "#cbb6ec"],
    shopee:        ["#833600", "#ab4a00", "#d26218", "#e08c60", "#edb396"],
    total_express: ["#405269", "#5a6d85", "#7588a2", "#91a6c0", "#aec4df"],
};

// chave da faixa -> cor, na rampa da transportadora aberta.
function _nrCores() {
    const r = NR_RAMPAS[_nrTransp] || NR_RAMPAS.loggi;
    return Object.fromEntries(NR_FAIXAS.map((f, i) => [f.chave, r[i]]));
}

let _nrTransp   = "loggi";
let _nrLinhas   = [];      // retrato carregado do servidor
let _nrMeta     = {};      // { importado_em, importado_por }
let _nrArquivo  = null;    // { nome, linhas } lido e aguardando envio
let _nrEnviando = false;
let _nrGraficos = {};      // instâncias do Chart.js, pra destruir antes de redesenhar
// O que está escondido. Só em memória, de propósito: recarregar a página traz tudo de
// volta. Guardar em localStorage faria alguém abrir a tela dias depois sem entender por
// que falta entregador na lista — e o único jeito de descobrir seria achar este código.
let _nrColsOcultas   = new Set();                                   // faixas — valem pras duas tabelas
let _nrLinhasOcultas = { entregador: new Map(), cidade: new Map() }; // linhas — chave -> rótulo
let _nrDim      = "entregador";  // dimensão da tabela: uma de cada vez, alternada por aba
let _nrPacotes  = [];      // pedidos da célula aberta no modal
let _nrPacTitulo = "";

function abrirTorreNaRua(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-torre-na-rua");
    _nrPintarTranspTabs();
    _nrCarregar();
}

function _nrEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const _nrNorm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
                        .toLowerCase().replace(/\s+/g, " ").trim();

const _nrCfg = () => NR_TRANSPORTADORAS.find(t => t.chave === _nrTransp) || NR_TRANSPORTADORAS[0];

// ── Seletor de transportadora ──
// Abas de texto, e não chips coloridos: a cor aqui não distingue dado nenhum (só uma
// transportadora aparece por vez), então seria decoração competindo com os números.
function _nrPintarTranspTabs() {
    document.getElementById("nr-transp-tabs").innerHTML = NR_TRANSPORTADORAS.map(t => `
        <button type="button" class="filtro-tab${_nrTransp === t.chave ? " active" : ""}"
                onclick="_nrTrocarTransp('${t.chave}')">${_nrEsc(t.rotulo)}</button>
    `).join("");
}

function _nrTrocarTransp(chave) {
    if (_nrTransp === chave) return;
    _nrTransp = chave;
    _nrColsOcultas.clear();
    _nrLinhasOcultas.entregador.clear();
    _nrLinhasOcultas.cidade.clear();
    _nrPintarTranspTabs();
    _nrCarregar();
}

function _nrTrocarDim(dim) {
    _nrDim = dim;
    document.querySelectorAll("#nr-dim-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.dim === dim));
    _nrRenderizar();
}

// ── Retrato atual ──
function _nrCarregar() {
    const empty  = document.getElementById("nr-empty");
    const result = document.getElementById("nr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    _nrPintarMeta(null);

    fetch(`${API}/torre/na-rua?transportadora=${encodeURIComponent(_nrTransp)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            _nrLinhas = (d && d.linhas) || [];
            _nrMeta = { importado_em: d.importado_em, importado_por: d.importado_por };
            _nrPintarMeta(_nrMeta);
            if (!_nrLinhas.length) {
                skFim(empty, `Nenhum relatório da ${_nrCfg().rotulo} enviado ainda. Use "Enviar relatório" para começar.`);
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            _nrRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _nrPintarMeta(meta) {
    const el = document.getElementById("nr-atualizado");
    if (!meta || !meta.importado_em) { el.innerText = "nenhum relatório enviado"; return; }
    const d = new Date(meta.importado_em);
    el.innerText = `atualizado ${d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo",
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${
        meta.importado_por ? " · " + meta.importado_por : ""}`;
}

// ── Dias de atraso ──
// Conta em DIAS DE CALENDÁRIO, não em blocos de 24h: o relatório traz o prazo com hora
// (22:00), e contar por hora faria um pacote vencido às 22h de ontem aparecer como "0 dias"
// durante a manhã inteira de hoje.
function _nrDiasAtraso(prazo) {
    if (!prazo) return null;
    const p = new Date(prazo);
    if (isNaN(p.getTime())) return null;
    const meiaNoite = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    return Math.floor((meiaNoite(new Date()) - meiaNoite(p)) / 86400000);
}

function _nrFaixaDe(linha) {
    const dias = _nrDiasAtraso(linha.prazo);
    if (dias === null) return null;           // sem prazo legível: fica fora das faixas
    return NR_FAIXAS.find(f => dias <= f.ate) || NR_FAIXAS[NR_FAIXAS.length - 1];
}

// ── Tabela dinâmica ──
// `campo` é a dimensão das linhas (entregador ou cidade); as colunas são sempre as faixas.
// A chave de agrupamento é normalizada (sem acento, sem caixa); o rótulo mostrado é a
// grafia que mais aparece no arquivo. Entregador vem de campo controlado da transportadora
// e é sempre igual, mas CIDADE eu extraio de endereço escrito à mão: "Concórdia",
// "Concordia" e "CONCÓRDIA" são o mesmo município e viravam três linhas, cada uma com um
// pedaço do número — que é a soma que não fechava.
const NR_SEM_INFO = "— sem informação —";

function _nrChaveDim(valor) {
    const t = String(valor || "").trim();
    if (!t) return NR_SEM_INFO;
    return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
}

function _nrPivot(linhas, campo) {
    const mapa = new Map();
    linhas.forEach(l => {
        const faixa = _nrFaixaDe(l);
        if (!faixa) return;
        const bruto = String(l[campo] || "").trim();
        const chave = _nrChaveDim(bruto);
        if (!mapa.has(chave)) {
            mapa.set(chave, { chave, nome: bruto || NR_SEM_INFO, grafias: new Map(), total: 0,
                              ...Object.fromEntries(NR_FAIXAS.map(f => [f.chave, 0])) });
        }
        const linha = mapa.get(chave);
        if (bruto) linha.grafias.set(bruto, (linha.grafias.get(bruto) || 0) + 1);
        linha[faixa.chave]++;
        linha.total++;
    });
    // Entre as grafias do mesmo município, mostra a mais frequente — costuma ser a correta,
    // com acento, porque o erro de digitação é a exceção.
    mapa.forEach(l => {
        if (!l.grafias.size) return;
        l.nome = [...l.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
    });
    // Ordena pelo que exige ação: mais atrasado primeiro, e o total desempata. Ordem
    // alfabética deixaria o pior caso no meio da lista.
    return [...mapa.values()].sort((a, b) => (b.d4 - a.d4) || (b.d3 - a.d3) || (b.total - a.total));
}

const _nrFaixasVisiveis = () => NR_FAIXAS.filter(f => !_nrColsOcultas.has(f.chave));

function _nrOcultarCol(chave) { _nrColsOcultas.add(chave); _nrRenderizar(); }
function _nrMostrarCol(chave) { _nrColsOcultas.delete(chave); _nrRenderizar(); }
// Guarda a CHAVE normalizada (é por ela que a linha é identificada) junto do rótulo que
// estava na tela — o chip precisa mostrar "Concórdia", não a chave "concordia".
function _nrOcultarLinha(campo, chave, nome) { _nrLinhasOcultas[campo].set(chave, nome || chave); _nrRenderizar(); }
function _nrMostrarLinha(campo, chave) { _nrLinhasOcultas[campo].delete(chave); _nrRenderizar(); }

function _nrMostrarTudo(campo) {
    _nrColsOcultas.clear();
    if (campo) _nrLinhasOcultas[campo].clear();
    _nrRenderizar();
}

// Barra do que foi escondido. Sem ela, ocultar seria um caminho sem volta: a coluna some e
// não sobra nada na tela dizendo que ela existe.
function _nrBarraOcultos(campo) {
    const cols = [...NR_COLUNAS_OCULTAS_ORDEM()];
    const linhas = [..._nrLinhasOcultas[campo].entries()];
    if (!cols.length && !linhas.length) return "";
    const chip = (rotulo, acao) =>
        `<button type="button" class="nr-oculto-chip" data-acao="${acao}">${_nrEsc(rotulo)}<span>+</span></button>`;
    return `
        <div class="nr-ocultos">
            <span class="nr-ocultos-label">Ocultos</span>
            ${cols.map(f => chip(f.rotulo, "col:" + f.chave)).join("")}
            ${linhas.map(([chave, nome]) => chip(nome, "linha:" + chave)).join("")}
            <button type="button" class="nr-ocultos-tudo" data-acao="tudo">mostrar tudo</button>
        </div>`;
}

// Mantém a ordem das faixas na barra, em vez da ordem em que foram clicadas.
const NR_COLUNAS_OCULTAS_ORDEM = () => NR_FAIXAS.filter(f => _nrColsOcultas.has(f.chave));

function _nrTabela(alvoId, linhas, campo, rotuloDim) {
    const el = document.getElementById(alvoId);
    const cores = _nrCores();
    const faixas = _nrFaixasVisiveis();
    const dados = _nrPivot(linhas, campo).filter(l => !_nrLinhasOcultas[campo].has(l.chave));
    const barra = _nrBarraOcultos(campo);

    if (!faixas.length) {
        el.innerHTML = barra + `<div class="fechamento-empty">Todas as colunas estão ocultas.</div>`;
        _nrLigarBarra(el, campo);
        return;
    }
    if (!dados.length) {
        el.innerHTML = barra + `<div class="fechamento-empty">Nada para mostrar.</div>`;
        _nrLigarBarra(el, campo);
        return;
    }

    // O total é sempre a soma do que está À VISTA. Esconder "No prazo" e o total continuar
    // contando com ele faria as colunas não fecharem com a última — e o motivo de esconder
    // é justamente olhar só o atraso.
    // Linha sem prazo legível não entra em faixa nenhuma, então também não entra na tabela.
    // O aviso existe pra soma bater com o "na rua" do topo — sem ele a diferença aparecia
    // como erro de conta, e não como o que é: pacote que o arquivo trouxe sem prazo.
    const foraDasFaixas = linhas.filter(l => !_nrFaixaDe(l)).length;
    const totalLinha = l => faixas.reduce((soma, f) => soma + l[f.chave], 0);
    const totais = faixas.map(f => dados.reduce((s, l) => s + l[f.chave], 0));
    const totalGeral = dados.reduce((s, l) => s + totalLinha(l), 0);

    el.innerHTML = barra + `
        <div class="nr-tabela-scroll">
        <table class="ant-hist-table nr-pivot">
            <thead>
                <tr>
                    <th>${_nrEsc(rotuloDim)}</th>
                    ${faixas.map(f => `<th class="nr-num nr-th-col" data-col="${f.chave}" title="Clique para ocultar esta coluna"><span class="nr-chip-cor" style="background:${cores[f.chave]}"></span>${f.rotulo}</th>`).join("")}
                    <th class="nr-num">Total</th>
                </tr>
            </thead>
            <tbody>
                ${dados.map(l => `
                <tr data-valor="${_nrEsc(l.chave)}" data-nome="${_nrEsc(l.nome)}">
                    <td data-label="${_nrEsc(rotuloDim)}" class="nr-dim" title="Clique para ocultar esta linha">${_nrEsc(l.nome)}</td>
                    ${faixas.map(f => l[f.chave]
                        ? `<td data-label="${f.rotulo}" class="nr-num nr-click" data-faixa="${f.chave}">${l[f.chave]}</td>`
                        : `<td data-label="${f.rotulo}" class="nr-num zero">—</td>`).join("")}
                    <td data-label="Total" class="nr-num nr-total nr-click" data-faixa="">${totalLinha(l)}</td>
                </tr>`).join("")}
            </tbody>
            <tfoot>
                <tr>
                    <td>Total</td>
                    ${totais.map(n => `<td class="nr-num">${n || "—"}</td>`).join("")}
                    <td class="nr-num nr-total">${totalGeral}</td>
                </tr>
            </tfoot>
        </table>
        </div>` + (foraDasFaixas
            ? `<div class="nr-rodape-nota">${foraDasFaixas.toLocaleString("pt-BR")} pacote${
                foraDasFaixas !== 1 ? "s" : ""} sem prazo no arquivo — fora das faixas acima.</div>`
            : "");

    // Delegação em vez de onclick por célula: nome de entregador e de cidade vem com
    // apóstrofo ("Herval D'Oeste") e acento, e montar a chamada dentro do atributo exigiria
    // escapar isso à mão em toda linha — um nome novo quebraria a tabela inteira.
    el.querySelector("table").onclick = ev => {
        const th = ev.target.closest("th.nr-th-col");
        if (th) return _nrOcultarCol(th.dataset.col);

        const dim = ev.target.closest("td.nr-dim");
        if (dim) {
            const tr = dim.closest("tr");
            return _nrOcultarLinha(campo, tr.dataset.valor, tr.dataset.nome);
        }

        const td = ev.target.closest("td.nr-click");
        if (!td) return;
        _nrAbrirPacotes(campo, td.closest("tr").dataset.valor, td.dataset.faixa, rotuloDim);
    };
    _nrLigarBarra(el, campo);
}

function _nrLigarBarra(el, campo) {
    const barra = el.querySelector(".nr-ocultos");
    if (!barra) return;
    barra.onclick = ev => {
        const btn = ev.target.closest("[data-acao]");
        if (!btn) return;
        const acao = btn.dataset.acao;
        if (acao === "tudo") return _nrMostrarTudo(campo);
        const [tipo, ...resto] = acao.split(":");
        const valor = resto.join(":");   // nome pode ter ":" dentro
        if (tipo === "col") _nrMostrarCol(valor); else _nrMostrarLinha(campo, valor);
    };
}

// ── Pedidos por trás de um número ──
// A tabela responde "quantos"; a pergunta seguinte é sempre "quais". Sem isso a pessoa
// via 12 pacotes com 4 dias de atraso e não tinha como descobrir de quem cobrar.
function _nrAbrirPacotes(campo, valor, faixaChave, rotuloDim) {
    const faixa = NR_FAIXAS.find(f => f.chave === faixaChave);
    _nrPacotes = _nrLinhas.filter(l => {
        if (_nrChaveDim(l[campo]) !== valor) return false;
        const f = _nrFaixaDe(l);
        if (!f) return false;                       // sem prazo não entra em faixa nenhuma
        // Total da linha = as faixas à vista, o mesmo que o número clicado somou.
        return faixaChave ? f.chave === faixaChave : !_nrColsOcultas.has(f.chave);
    });
    _nrPacTitulo = `${valor} · ${faixa ? faixa.rotulo : "todos"}`;
    document.getElementById("nr-pac-titulo").innerText = valor;
    document.getElementById("nr-pac-sub").innerText =
        `${rotuloDim} · ${faixa ? faixa.rotulo : "todas as faixas"} · ${_nrPacotes.length} pacote${_nrPacotes.length !== 1 ? "s" : ""}`;
    document.getElementById("nr-pac-busca").value = "";
    _nrPacRender();
    _abrirModal("modal-nr-pacotes");
}

function _nrPacFiltrados() {
    const termo = (document.getElementById("nr-pac-busca")?.value || "").trim().toLowerCase();
    if (!termo) return _nrPacotes;
    return _nrPacotes.filter(l => [l.codigo_barras, l.id_pacote, l.destinatario, l.cidade, l.status]
        .some(v => String(v || "").toLowerCase().includes(termo)));
}

function _nrPacRender() {
    const lista = _nrPacFiltrados();
    const el = document.getElementById("nr-pac-lista");
    if (!lista.length) {
        el.innerHTML = `<div class="fechamento-empty">Nenhum pedido neste filtro.</div>`;
        return;
    }
    el.innerHTML = lista.map(l => {
        const dias = _nrDiasAtraso(l.prazo);
        const f = _nrFaixaDe(l);
        const cor = f ? _nrCores()[f.chave] : "#4a5568";
        return `
        <div class="nr-pac-item">
            <div class="nr-pac-topo">
                <span class="nr-pac-cod">${_nrEsc(l.codigo_barras) || _nrEsc(l.id_pacote) || "—"}</span>
                <span class="nr-pac-dias"><i class="nr-pac-ponto" style="background:${cor}"></i>${
                    dias === null ? "sem prazo" : dias <= 0 ? "no prazo" : `${dias} dia${dias !== 1 ? "s" : ""}`}</span>
            </div>
            <div class="nr-pac-nome">${_nrEsc(l.destinatario) || "—"}</div>
            <div class="nr-pac-obs">${_nrEsc(l.cidade) || "—"}${l.status ? " · " + _nrEsc(l.status) : ""}${
                l.prazo ? " · prazo " + _nrEsc(_nrDataCurta(l.prazo)) : ""}</div>
        </div>`;
    }).join("");
}

function _nrPacExportar() {
    const lista = _nrPacFiltrados();
    if (!lista.length) return gcAlert("Nenhum pedido para exportar.");
    const dados = lista.map(l => ({
        "Código":       l.codigo_barras || "",
        "Id do pacote": l.id_pacote || "",
        "Destinatário": l.destinatario || "",
        "Cidade":       l.cidade || "",
        "UF":           l.uf || "",
        "CEP":          l.cep || "",
        "Entregador":   l.entregador || "",
        "Prazo":        _nrDataCurta(l.prazo),
        "Dias":         _nrDiasAtraso(l.prazo) ?? "",
        "Status":       l.status || "",
        "Endereço":     l.endereco || "",
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Na rua");
    const limpo = _nrPacTitulo.replace(/[^\wÀ-ɏ]+/g, "-").replace(/^-|-$/g, "");
    XLSX.writeFile(wb, `na_rua_${_nrTransp}_${limpo}.xlsx`);
}

function _nrRenderizar() {
    // Ocultar uma faixa é um recorte da TELA, não um enfeite da tabela: o corte é feito uma
    // vez aqui e tudo abaixo deriva dele. Antes só a tabela obedecia, e os cards do topo
    // seguiam contando o que a pessoa tinha acabado de mandar sumir.
    const faixas = _nrFaixasVisiveis();
    const visiveisSet = new Set(faixas.map(f => f.chave));
    const linhas = _nrLinhas.filter(l => {
        const f = _nrFaixaDe(l);
        return f && visiveisSet.has(f.chave);
    });
    const semPrazo = _nrLinhas.filter(l => !_nrFaixaDe(l)).length;

    const porFaixa = Object.fromEntries(NR_FAIXAS.map(f => [f.chave, 0]));
    linhas.forEach(l => { porFaixa[_nrFaixaDe(l).chave]++; });

    const atrasados = ["d1", "d2", "d3", "d4"].reduce((s, k) => s + porFaixa[k], 0);
    const noPrazoVisivel = visiveisSet.has("no_prazo");
    const pctPrazo = linhas.length ? (porFaixa.no_prazo / linhas.length) * 100 : 0;

    // Um número lidera a tela: é o que exige ação. O total entra como contexto dele, e não
    // como um card do mesmo tamanho — quatro números de peso igual não dizem por onde começar.
    // Figuras proporcionais (sem tabular-nums): em corpo grande, dígito de largura fixa faz
    // "121" parecer frouxo. Tabular fica só nas colunas da tabela, que alinham na vertical.
    const ocultas = NR_FAIXAS.length - faixas.length;
    document.getElementById("nr-hero-valor").innerText = atrasados.toLocaleString("pt-BR");
    document.getElementById("nr-hero-sub").innerText =
        `de ${linhas.length.toLocaleString("pt-BR")} ${ocultas ? "no recorte" : "na rua"}` +
        (semPrazo && !ocultas ? ` · ${semPrazo} sem prazo no arquivo` : "") +
        (ocultas ? ` · ${ocultas} faixa${ocultas !== 1 ? "s" : ""} oculta${ocultas !== 1 ? "s" : ""}` : "");

    // O medidor mede a parcela no prazo; escondida essa faixa, ele não tem o que medir.
    const meter = document.getElementById("nr-meter-fill").parentElement;
    const legenda = document.getElementById("nr-meter-legenda");
    meter.style.display = noPrazoVisivel ? "" : "none";
    legenda.style.display = noPrazoVisivel ? "" : "none";
    if (noPrazoVisivel) {
        const fill = document.getElementById("nr-meter-fill");
        fill.style.width = Math.max(0, Math.min(100, pctPrazo)).toFixed(1) + "%";
        // Cor da marca, não semáforo: o medidor mostra uma proporção, e verde/amarelo/vermelho
        // fariam ela parecer uma nota — sendo que o que é "bom" aqui depende da operação.
        fill.style.background = _nrCfg().cor;
        legenda.innerText = `${porFaixa.no_prazo.toLocaleString("pt-BR")} ainda no prazo · ${_nrPct(pctPrazo)}`;
    }

    // Os tiles também acompanham: faixa oculta some daqui, não aparece zerada.
    // Valor em tinta de texto; quem carrega a identidade é o quadradinho ao lado do rótulo,
    // na mesma cor da coluna da tabela e da barra do gráfico. Numero colorido competia com
    // o hero e, em passo escuro da rampa, ficava ilegível.
    const cores = _nrCores();
    const tile = (rotulo, valor, sub, cor) => `
        <div class="nr-tile">
            <div class="nr-tile-label"><span class="nr-chip-cor" style="background:${cor}"></span>${rotulo}</div>
            <div class="nr-tile-valor">${valor}</div>
            <div class="nr-tile-sub">${sub}</div>
        </div>`;
    const recentes = ["d1", "d2", "d3"].filter(k => visiveisSet.has(k));
    const ate3 = recentes.reduce((s, k) => s + porFaixa[k], 0);
    let tiles = "";
    if (noPrazoVisivel) tiles += tile("No prazo", porFaixa.no_prazo.toLocaleString("pt-BR"), "ainda não venceram", cores.no_prazo);
    if (recentes.length) tiles += tile("1 a 3 dias", ate3.toLocaleString("pt-BR"), "atraso recente", cores.d2);
    if (visiveisSet.has("d4")) tiles += tile("4 dias ou mais", porFaixa.d4.toLocaleString("pt-BR"), "atraso grave", cores.d4);
    document.getElementById("nr-tiles").innerHTML = tiles;

    // UMA tabela, alternada pela aba. Empilhar as duas dobrava a altura da página.
    _nrTabela("nr-tabela", _nrLinhas, _nrDim, _nrDim === "entregador" ? "Entregador" : "Cidade");
    const rotDim = _nrDim === "entregador" ? "entregador" : "cidade";
    document.getElementById("nr-gr-vol-titulo").innerText = `Volume por ${rotDim}`;
    document.getElementById("nr-gr-mix-titulo").innerText = `Composição do atraso por ${rotDim}`;
    _nrGraficar(linhas, porFaixa);
}

function _nrPct(p) {
    if (!isFinite(p)) return "—";
    if (p >= 100) return "100%";
    if (p <= 0) return "0%";
    return p.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

// ── Gráficos ──
// Quatro perguntas diferentes, nenhuma respondida pela tabela de relance:
//   1. qual o formato do atraso    2. o que vence quando
//   3. quem tem volume             4. quem tem atraso VELHO — que não é o mesmo que muito
//
// Especificações comuns: barra fina com a ponta arredondada só na saída do dado, grade
// hairline sólida e recuada, e a separação entre segmentos feita por vão na cor da
// superfície — nunca por contorno, que seria tinta sem dado.
const NR_SUPERFICIE = "#0f1520";
const NR_EIXO  = { color: "#7b8ba3", font: { size: 11 } };
const NR_GRADE = { color: "rgba(255,255,255,0.055)", drawTicks: false };
const NR_BASE  = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 220 },
};

function _nrDestruirGraficos() {
    Object.values(_nrGraficos).forEach(g => { try { g.destroy(); } catch (_) {} });
    _nrGraficos = {};
}

function _nrGraficar(linhas, porFaixa) {
    _nrDestruirGraficos();
    if (typeof Chart === "undefined") return;
    const faixas = _nrFaixasVisiveis();
    const cores = _nrCores();

    // 1. Distribuição — escala ordenada, então rampa de um hue só.
    _nrGraficos.faixas = new Chart(document.getElementById("nr-gr-faixas"), {
        type: "bar",
        data: {
            labels: faixas.map(f => f.rotulo),
            datasets: [{
                data: faixas.map(f => porFaixa[f.chave]),
                backgroundColor: faixas.map(f => cores[f.chave]),
                borderRadius: { topLeft: 4, topRight: 4 },
                borderSkipped: "bottom",
                maxBarThickness: 24,
            }],
        },
        options: {
            ...NR_BASE,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: c => c.parsed.y.toLocaleString("pt-BR") + " pacotes" } },
            },
            scales: {
                x: { ticks: NR_EIXO, grid: { display: false } },
                y: { ticks: NR_EIXO, grid: NR_GRADE, beginAtZero: true },
            },
        },
    });

    _nrGraficoPrazos(linhas);
    _nrGraficoVolume(linhas);
    _nrGraficoMix(linhas, faixas);
}

// 2. Vencimentos por dia. Cada coluna é uma data de prazo, pintada pela faixa em que ela
// cai — a mesma rampa do resto da tela. Assim a virada entre "no prazo" e "atrasado"
// aparece sozinha, sem precisar de uma linha de referência marcando hoje.
function _nrGraficoPrazos(linhas) {
    const cores = _nrCores();
    const porDia = new Map();
    linhas.forEach(l => {
        if (!l.prazo) return;
        const d = new Date(l.prazo);
        if (isNaN(d.getTime())) return;
        const chave = d.getFullYear() + "-" +
                      String(d.getMonth() + 1).padStart(2, "0") + "-" +
                      String(d.getDate()).padStart(2, "0");
        porDia.set(chave, (porDia.get(chave) || 0) + 1);
    });
    const vazio = document.getElementById("nr-gr-prazos-vazio");
    vazio.style.display = porDia.size ? "none" : "";
    if (!porDia.size) return;

    // Os 21 dias mais recentes: além disso os rótulos se sobrepõem, e a cauda antiga — que
    // é sempre um punhado de pacotes — rouba a largura de onde está o volume.
    const dias = [...porDia.keys()].sort().slice(-21);
    const corDoDia = dia => {
        const f = _nrFaixaDe({ prazo: dia + "T12:00:00" });
        return f ? cores[f.chave] : "#4a5568";
    };

    _nrGraficos.prazos = new Chart(document.getElementById("nr-gr-prazos"), {
        type: "bar",
        data: {
            labels: dias.map(d => d.slice(8, 10) + "/" + d.slice(5, 7)),
            datasets: [{
                data: dias.map(d => porDia.get(d)),
                backgroundColor: dias.map(corDoDia),
                borderRadius: { topLeft: 4, topRight: 4 },
                borderSkipped: "bottom",
                maxBarThickness: 18,
            }],
        },
        options: {
            ...NR_BASE,
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    title: c => "Prazo " + c[0].label,
                    label: c => c.parsed.y.toLocaleString("pt-BR") + " pacotes",
                } },
            },
            scales: {
                x: { ticks: { ...NR_EIXO, maxRotation: 0 }, grid: { display: false } },
                y: { ticks: NR_EIXO, grid: NR_GRADE, beginAtZero: true },
            },
        },
    });
}

// 3. Volume — uma série só, então um hue só. Pintar cada barra por tamanho gastaria a cor
// repetindo o que o comprimento da barra já diz.
function _nrGraficoVolume(linhas) {
    const faixas = _nrFaixasVisiveis();
    const dados = _nrPivot(linhas, _nrDim)
        .map(l => ({ nome: l.nome, total: faixas.reduce((s, f) => s + l[f.chave], 0) }))
        .filter(l => l.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    const vazio = document.getElementById("nr-gr-vol-vazio");
    vazio.style.display = dados.length ? "none" : "";
    if (!dados.length) return;

    _nrGraficos.volume = new Chart(document.getElementById("nr-gr-volume"), {
        type: "bar",
        data: {
            labels: dados.map(l => _nrEncurtar(l.nome)),
            datasets: [{
                data: dados.map(l => l.total),
                backgroundColor: "#3987e5",
                borderRadius: { topRight: 4, bottomRight: 4 },
                borderSkipped: "left",
                maxBarThickness: 18,
            }],
        },
        options: {
            ...NR_BASE, indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: {
                    title: c => dados[c[0].dataIndex].nome,
                    label: c => c.parsed.x.toLocaleString("pt-BR") + " pacotes",
                } },
            },
            scales: {
                x: { ticks: NR_EIXO, grid: NR_GRADE, beginAtZero: true },
                y: { ticks: { ...NR_EIXO, autoSkip: false }, grid: { display: false } },
            },
        },
    });
}

// 4. Composição do atraso. Volume alto não é o mesmo problema que atraso velho: quem tem
// 40 pacotes de 1 dia está trabalhando; quem tem 8 de 4+ dias está travado. Empilhada na
// horizontal porque os nomes são longos, com vão de 2px na cor da superfície entre os
// segmentos — é o vão que separa, não um contorno.
function _nrGraficoMix(linhas, faixas) {
    const cores = _nrCores();
    const atrasadas = faixas.filter(f => f.chave !== "no_prazo");
    const dados = _nrPivot(linhas, _nrDim)
        .map(l => ({ ...l, atraso: atrasadas.reduce((s, f) => s + l[f.chave], 0) }))
        .filter(l => l.atraso > 0)
        .sort((a, b) => b.atraso - a.atraso)
        .slice(0, 8);

    const vazio = document.getElementById("nr-gr-mix-vazio");
    vazio.style.display = dados.length ? "none" : "";
    // Cinco séries empilhadas precisam de legenda — a cor sozinha não diz qual é qual.
    document.getElementById("nr-gr-mix-legenda").innerHTML = dados.length
        ? atrasadas.map(f => '<span class="nr-leg"><i style="background:' + cores[f.chave] + '"></i>' + f.rotulo + "</span>").join("")
        : "";
    if (!dados.length || !atrasadas.length) return;

    _nrGraficos.mix = new Chart(document.getElementById("nr-gr-mix"), {
        type: "bar",
        data: {
            labels: dados.map(l => _nrEncurtar(l.nome)),
            datasets: atrasadas.map((f, i) => ({
                label: f.rotulo,
                data: dados.map(l => l[f.chave]),
                backgroundColor: cores[f.chave],
                borderColor: NR_SUPERFICIE,
                borderWidth: { top: 0, bottom: 0, left: 0, right: 2 }, // o vão de 2px
                borderSkipped: false,
                borderRadius: i === atrasadas.length - 1 ? { topRight: 4, bottomRight: 4 } : 0,
                maxBarThickness: 18,
            })),
        },
        options: {
            ...NR_BASE, indexAxis: "y",
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { title: c => dados[c[0].dataIndex].nome } },
            },
            scales: {
                x: { stacked: true, ticks: NR_EIXO, grid: NR_GRADE, beginAtZero: true },
                y: { stacked: true, ticks: { ...NR_EIXO, autoSkip: false }, grid: { display: false } },
            },
        },
    });
}

// Nome comprido vira "Ana Lucia A." no eixo; o nome inteiro fica no tooltip. Cortar no meio
// de uma palavra é o que transforma o eixo numa parede de texto ilegível.
function _nrEncurtar(nome) {
    const t = String(nome || "").trim();
    if (t.length <= 18) return t;
    const partes = t.split(/\s+/);
    if (partes.length < 2) return t.slice(0, 17) + "…";
    const inicial = partes.length > 2 ? " " + partes[partes.length - 1][0] + "." : "";
    return partes[0] + " " + partes[1].slice(0, 8) + inicial;
}

// ── Envio do relatório ──
function _nrAbrirUpload() {
    document.getElementById("nr-upload-titulo").innerText = `Relatório da ${_nrCfg().rotulo}`;
    _nrMsg("", null);
    _nrArquivo = null;
    _nrPintarPrevia();

    const area = document.getElementById("nr-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files && e.dataTransfer.files.length) _nrLerArquivo(e.dataTransfer.files[0]);
    };
    _abrirModal("modal-nr-upload");
}

function _nrEscolherArquivo(input) {
    if (input.files && input.files.length) _nrLerArquivo(input.files[0]);
    input.value = ""; // permite reenviar o mesmo arquivo sem recarregar a tela
}

function _nrMsg(msg, tipo) {
    const el = document.getElementById("nr-upload-erro");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.erro;
    el.style.cssText = `display:block;margin:12px 0;padding:11px 15px;border-radius:10px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// O CSV da Loggi vem em Latin-1. Lido como UTF-8 ele vira "EndereÃ§o"/"RegiÃ£o", e esse
// texto ia parar no banco — depois não dá mais pra saber o que era acento e o que era
// caractere de verdade. Decide o encoding pelo conteúdo em vez de fixar um: arquivo já
// salvo em UTF-8 (que acontece quando alguém reabre e salva no Excel) continua valendo.
function _nrDecodificar(buffer) {
    const bytes = new Uint8Array(buffer);
    const utf8 = new TextDecoder("utf-8").decode(bytes);
    // Escapes em vez de caracteres literais: este arquivo trata justamente de encoding
    // � = byte que nao e UTF-8 valido. Ã/Â seguidos de continuacao = Latin-1
    if (!/�/.test(utf8) && !/[ÃÂ][-¿]/.test(utf8)) return utf8;
    return new TextDecoder("windows-1252").decode(bytes);
}

function _nrLerArquivo(file) {
    _nrMsg("", null);
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const nome = file.name.toLowerCase();
            let grid;
            if (nome.endsWith(".csv") || nome.endsWith(".txt")) {
                // XLSX resolve o CSV com aspas: o "Endereço completo" tem vírgula dentro,
                // e um split(",") ingênuo partiria a linha no meio do endereço.
                const wb = XLSX.read(_nrDecodificar(e.target.result), { type: "string" });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            } else {
                const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", raw: false });
                grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: false });
            }
            const lido = _nrMapear(grid);
            if (lido.erro) return _nrMsg(_nrEsc(lido.erro), "erro");
            if (!lido.dados.length) return _nrMsg("O arquivo não tem nenhuma linha preenchida.", "erro");
            _nrArquivo = { nome: file.name, linhas: lido.dados };
            if (lido.faltando.length) {
                _nrMsg(`Colunas não encontradas (entram em branco): <strong>${_nrEsc(lido.faltando.join(", "))}</strong>.`, "aviso");
            }
            _nrPintarPrevia();
        } catch (err) {
            _nrMsg(`Não consegui ler o arquivo: ${_nrEsc(err.message)}`, "erro");
        }
    };
    reader.onerror = () => _nrMsg("Falha ao abrir o arquivo.", "erro");
    reader.readAsArrayBuffer(file);
}

// Acha o cabeçalho nas primeiras linhas (esses relatórios costumam vir com título ou linha
// em branco antes da tabela) e casa as colunas pelo nome normalizado.
function _nrMapear(grid) {
    const cols = NR_COLUNAS[_nrTransp];
    if (!cols) return { erro: `O relatório da ${_nrCfg().rotulo} ainda não está configurado.` };

    let cabIdx = -1, indices = null;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
        const cab = (grid[i] || []).map(_nrNorm);
        const tentativa = {};
        let achou = 0;
        for (const col of cols) {
            const idx = cab.findIndex(c => col.nomes.includes(c));
            if (idx >= 0) { tentativa[col.id] = idx; achou++; }
        }
        if (achou >= Math.ceil(cols.length / 2)) { cabIdx = i; indices = tentativa; break; }
    }
    if (cabIdx < 0) {
        return { erro: "Não encontrei o cabeçalho no arquivo. Ele precisa ter as colunas: " +
                       cols.map(c => c.nomes[0]).join(", ") + "." };
    }

    const faltando = cols.filter(c => indices[c.id] === undefined).map(c => c.nomes[0]);
    const dados = [];
    for (let i = cabIdx + 1; i < grid.length; i++) {
        const linha = grid[i] || [];
        const obj = {};
        for (const col of cols) {
            const idx = indices[col.id];
            obj[col.id] = idx === undefined ? "" : String(linha[idx] ?? "").trim();
        }
        if (!Object.values(obj).some(v => v)) continue; // linha vazia no fim do arquivo
        Object.assign(obj, _nrPartesEndereco(obj.endereco));
        dados.push(obj);
    }
    return { dados, faltando };
}

// Cidade, UF e CEP saem do "Endereço completo" — não existem em coluna própria.
// O padrão é constante no fim do texto: "..., <Cidade> - <UF>, <CEP>, Brasil - <ponto>".
// Ancorar no par "UF, CEP" é o que faz funcionar com cidade de nome composto e com vírgula
// no começo do endereço ("Rua X, 1246 - Centro, Concórdia - SC, 89700055, Brasil").
function _nrPartesEndereco(endereco) {
    const txt = String(endereco || "");
    // 1ª tentativa: ancorada no par "UF, CEP", que é o trecho mais previsível do texto.
    let m = txt.match(/,\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,\s*(\d{5}-?\d{3})/);
    if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase(), cep: m[3].replace(/\D/g, "") };

    // 2ª: endereço sem CEP. Sem ele a âncora é o "- UF" seguido de vírgula ou fim do texto.
    // Perder a cidade inteira por falta de CEP jogava a linha em "sem informação", e era
    // isso que fazia a tabela por cidade não fechar com a de entregador.
    m = txt.match(/,\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*(?:,|$)/);
    if (m) return { cidade: m[1].trim(), uf: m[2].toUpperCase(), cep: "" };

    return { cidade: "", uf: "", cep: "" };
}

function _nrPintarPrevia() {
    const el = document.getElementById("nr-previa");
    const btn = document.getElementById("nr-btn-enviar");
    if (!_nrArquivo) {
        el.innerHTML = "";
        btn.style.display = "none";
        return;
    }
    const n = _nrArquivo.linhas.length;
    const semCidade = _nrArquivo.linhas.filter(l => !l.cidade).length;
    const amostra = _nrArquivo.linhas.slice(0, 8);

    el.innerHTML = `
        <div class="nr-previa-topo">
            <span class="ant-sol-title" style="border:none;padding:0;margin:0">
                Prévia · ${n.toLocaleString("pt-BR")} linha${n !== 1 ? "s" : ""} de ${_nrEsc(_nrArquivo.nome)}
            </span>
            <button type="button" class="usr-modal-btn-cancel" onclick="_nrDescartar()">Descartar</button>
        </div>
        ${semCidade ? `<div class="nr-aviso">Em ${semCidade} linha${semCidade !== 1 ? "s" : ""} não consegui identificar a cidade pelo endereço — elas entram como "sem informação" na tabela por cidade.</div>` : ""}
        <table class="ant-hist-table">
            <thead><tr><th>Entregador</th><th>Cidade</th><th>Prazo</th><th>Status</th><th>Código</th></tr></thead>
            <tbody>
                ${amostra.map(l => `
                <tr>
                    <td data-label="Entregador">${_nrEsc(l.entregador) || "—"}</td>
                    <td data-label="Cidade">${_nrEsc(l.cidade) || '<span style="color:#717f95">—</span>'}</td>
                    <td data-label="Prazo">${_nrEsc(_nrDataCurta(l.prazo))}</td>
                    <td data-label="Status">${_nrEsc(l.status) || "—"}</td>
                    <td data-label="Código" style="font-family:monospace;font-size:11.5px">${_nrEsc(l.codigo_barras) || "—"}</td>
                </tr>`).join("")}
                ${n > amostra.length ? `<tr><td colspan="5" style="text-align:center;color:#8494a9;padding:12px">
                    + ${(n - amostra.length).toLocaleString("pt-BR")} linhas que não cabem na prévia</td></tr>` : ""}
            </tbody>
        </table>`;
    btn.style.display = "";
    btn.disabled = false;
    btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linha${n !== 1 ? "s" : ""}`;
}

function _nrDataCurta(v) {
    if (!v) return "—";
    const d = new Date(v);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("pt-BR");
}

function _nrDescartar() {
    _nrArquivo = null;
    _nrMsg("", null);
    _nrPintarPrevia();
}

function _nrEnviar() {
    if (_nrEnviando || !_nrArquivo) return;
    const n = _nrArquivo.linhas.length;
    // O envio SUBSTITUI o retrato anterior — vale avisar antes, não depois.
    gcConfirm(
        `Enviar ${n.toLocaleString("pt-BR")} linhas como o retrato atual da ${_nrCfg().rotulo}?\n\nIsso substitui o relatório anterior dessa transportadora.`,
        () => {
            _nrEnviando = true;
            const btn = document.getElementById("nr-btn-enviar");
            btn.disabled = true;
            btn.textContent = "Enviando...";

            fetch(`${API}/torre/na-rua/importar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ transportadora: _nrTransp, linhas: _nrArquivo.linhas })
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                _nrEnviando = false;
                btn.disabled = false;
                if (!ok) {
                    btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linhas`;
                    return _nrMsg(_nrEsc(d.error) || "Não foi possível enviar.", "erro");
                }
                _fecharModal("modal-nr-upload");
                _nrCarregar();
            })
            .catch(() => {
                _nrEnviando = false;
                btn.disabled = false;
                btn.textContent = `Enviar ${n.toLocaleString("pt-BR")} linhas`;
                _nrMsg("Erro ao conectar com o servidor.", "erro");
            });
        },
        "Enviar relatório",
        "Sim, enviar"
    );
}
