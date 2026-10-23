// ───── TORRE DE CONTROLE — PACOTES FALTANTES (ADMIN/DEV) ─────
// Visão de todos os pacotes faltantes reportados por qualquer entregador. Mesmo
// esquema de listagem/paginação/exportação já usado em Baixas Total Express.
//
// Junto vêm os que o entregador NÃO bipou na conferência do dia (origem "conferencia").
// Esses são calculados por período no servidor, então a lista mostra só os últimos
// _PFA_CONF_DIAS dias; o Exportar busca de novo com o período escolhido.
const _PFA_CONF_DIAS = 7;
const _PFA_ORIGENS = { report: "Report", conferencia: "Conferência" };
let _pfaDados     = [];
let _pfaFiltrados = [];
let _pfaPagina    = 1;
let _pfaPorPagina = 25;

function abrirPacotesFaltantesAdmin(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-torre-pacotes-faltantes");
    _pfaCarregar();
}

function _pfaCarregar() {
    const empty = document.getElementById("pfa-empty");
    const lista = document.getElementById("pfa-lista");
    skMostrar(empty, "cards");
    empty.style.display = "";
    lista.style.display = "none";

    const ate = _pfaDrpDiaChave(new Date());
    const d = new Date(); d.setDate(d.getDate() - (_PFA_CONF_DIAS - 1));
    const de = _pfaDrpDiaChave(d);
    // A conferência falhar não pode esconder os reportados: cada lado cai sozinho.
    const reportados = fetch(`${API}/admin/pacotes-faltantes`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json());
    const conferencia = _pfaBuscarConferencia(de, ate).catch(() => []);

    Promise.all([reportados, conferencia])
        .then(([rows, conf]) => {
            if (!Array.isArray(rows)) { skFim(empty, rows.error || "Erro ao carregar pacotes faltantes."); return; }
            _pfaDados = [...rows.map(r => ({ ...r, origem: "report" })), ...conf];
            // sort é estável: dentro do mesmo dia continua a ordem que cada lado mandou.
            _pfaDados.sort((a, b) => (_pfaDataISO(b.data_hora_brasilia) || "").localeCompare(_pfaDataISO(a.data_hora_brasilia) || ""));
            const filtro = document.getElementById("pfa-filtro-input");
            if (filtro) filtro.value = "";
            _pfaRenderizar(_pfaDados);
        }).catch(() => { skFim(empty, "Erro ao carregar pacotes faltantes."); });
}

// Não bipados na conferência do entregador, de `de` a `ate` (YYYY-MM-DD).
function _pfaBuscarConferencia(de, ate) {
    return fetch(`${API}/admin/conferencia-entregadores/nao-bipados?de=${de}&ate=${ate}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (!d || !Array.isArray(d.linhas)) throw new Error((d && d.error) || "Erro ao carregar a conferência.");
            return d.linhas;
        });
}

function _pfaRenderizar(rows) {
    const empty = document.getElementById("pfa-empty");
    const lista = document.getElementById("pfa-lista");
    _pfaFiltrados = rows;
    _pfaPagina = 1;

    if (!rows.length) {
        skFim(empty, "Nenhum pacote faltante registrado.");
        empty.style.display = "";
        lista.style.display = "none";
        return;
    }
    const nConf = rows.filter(r => r.origem === "conferencia").length;
    document.getElementById("pfa-counter").innerText = `${rows.length.toLocaleString("pt-BR")} pacote${rows.length !== 1 ? "s" : ""}`
        + (nConf ? ` · ${nConf.toLocaleString("pt-BR")} da conferência (últimos ${_PFA_CONF_DIAS} dias)` : "");
    empty.style.display = "none";
    lista.style.display = "";
    _pfaRenderizarPagina();
}

function _pfaRenderizarPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_pfaFiltrados.length / _pfaPorPagina));
    _pfaPagina = Math.min(Math.max(1, _pfaPagina), totalPaginas);
    const inicio = (_pfaPagina - 1) * _pfaPorPagina;
    const pagina = _pfaFiltrados.slice(inicio, inicio + _pfaPorPagina);

    document.getElementById("pfa-tbody").innerHTML = pagina.map(r => `
        <tr>
            <td style="font-family:monospace;font-size:12px">${r.codigo || "—"}</td>
            <td>${_PFA_ORIGENS[r.origem] || "—"}${r.cluster ? `<div style="font-size:11.5px;color:#7b98b5">${r.cluster}</div>` : ""}</td>
            <td>${r.transportadora || "—"}</td>
            <td>${r.usuario_nome || "—"}</td>
            <td style="font-size:12px;white-space:nowrap;color:#94a3b8">${r.data_hora_brasilia || "—"}</td>
        </tr>`).join("");

    document.getElementById("pfa-pagina-info").innerText = `Página ${_pfaPagina} de ${totalPaginas}`;
}

function _pfaMudarPorPagina() {
    _pfaPorPagina = parseInt(document.getElementById("pfa-por-pagina").value, 10);
    _pfaPagina = 1;
    _pfaRenderizarPagina();
}

function _pfaPaginaAnterior() {
    if (_pfaPagina <= 1) return;
    _pfaPagina--;
    _pfaRenderizarPagina();
}

function _pfaProximaPagina() {
    const totalPaginas = Math.max(1, Math.ceil(_pfaFiltrados.length / _pfaPorPagina));
    if (_pfaPagina >= totalPaginas) return;
    _pfaPagina++;
    _pfaRenderizarPagina();
}

function _pfaFiltrarLocal() {
    const termo = document.getElementById("pfa-filtro-input").value.trim().toLowerCase();
    if (!termo) { _pfaRenderizar(_pfaDados); return; }
    const filtrado = _pfaDados.filter(r =>
        (r.codigo         || "").toLowerCase().includes(termo) ||
        (r.transportadora || "").toLowerCase().includes(termo) ||
        (r.usuario_nome   || "").toLowerCase().includes(termo) ||
        (r.cluster        || "").toLowerCase().includes(termo) ||
        (_PFA_ORIGENS[r.origem] || "").toLowerCase().includes(termo)
    );
    _pfaRenderizar(filtrado);
}

// data_hora_brasilia é sempre "dd/mm/yyyy ..." — vira "yyyy-mm-dd" pra comparar
// direto com o valor do seletor de datas.
function _pfaDataISO(dataHoraBrasilia) {
    const m = String(dataHoraBrasilia || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function _pfaAbrirExportar() {
    const entregadores = [...new Set(_pfaDados.map(r => r.usuario_nome).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const transportadoras = [...new Set(_pfaDados.map(r => r.transportadora).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));

    document.getElementById("pfa-exp-entregador").innerHTML =
        `<option value="">Todos os entregadores</option>` + entregadores.map(e => `<option value="${e}">${e}</option>`).join("");
    document.getElementById("pfa-exp-transportadora").innerHTML =
        `<option value="">Todas as transportadoras</option>` + transportadoras.map(t => `<option value="${t}">${t}</option>`).join("");
    document.getElementById("pfa-exp-origem").value = "";
    document.getElementById("pfa-exp-de").value  = "";
    document.getElementById("pfa-exp-ate").value = "";
    document.getElementById("pfa-exp-erro").textContent = "";
    document.getElementById("pfa-drp-label").innerText = "Todo o período";
    document.getElementById("pfa-drp-panel").style.display = "none";
    _pfaDrpMesRef = new Date();
    _pfaDrpInicio = null;
    _pfaDrpFim    = null;
    _abrirModal("modal-pfa-exportar");
}

async function _pfaExportar() {
    const de     = document.getElementById("pfa-exp-de").value;
    const ate    = document.getElementById("pfa-exp-ate").value;
    const ent    = document.getElementById("pfa-exp-entregador").value;
    const trns   = document.getElementById("pfa-exp-transportadora").value;
    const origem = document.getElementById("pfa-exp-origem").value;   // "" = os dois
    const erroEl = document.getElementById("pfa-exp-erro");
    const btn    = document.getElementById("pfa-exp-btn");
    erroEl.textContent = "";

    // Os da conferência são calculados por período no servidor (teto de 31 dias), então
    // "Todo o período" só existe pros reportados. Busca de novo em vez de usar a lista da
    // tela, que só tem os últimos dias.
    let base = _pfaDados.filter(r => r.origem === "report");
    if (origem !== "report") {
        if (!de) {
            erroEl.textContent = "Escolha o período (até 31 dias) para incluir a conferência.";
            return;
        }
        btn.disabled = true;
        btn.innerText = "Buscando...";
        try {
            base = base.concat(await _pfaBuscarConferencia(de, ate || de));
        } catch (e) {
            erroEl.textContent = e.message || "Erro ao carregar a conferência.";
            return;
        } finally {
            btn.disabled = false;
            btn.innerText = "Exportar XLSX";
        }
    }

    const filtrados = base.filter(r => {
        if (origem && r.origem !== origem) return false;
        if (ent && r.usuario_nome !== ent) return false;
        if (trns && r.transportadora !== trns) return false;
        if (de || ate) {
            const iso = _pfaDataISO(r.data_hora_brasilia);
            if (!iso) return false;
            if (de && iso < de) return false;
            if (ate && iso > ate) return false;
        }
        return true;
    });

    if (!filtrados.length) {
        erroEl.textContent = "Nenhum pacote faltante encontrado com esses filtros.";
        return;
    }

    const linhas = filtrados.map(r => ({
        "Código":         r.codigo || "",
        "Origem":         _PFA_ORIGENS[r.origem] || "",
        "Transportadora": r.transportadora || "",
        "Entregador":     r.usuario_nome || "",
        "Data/Hora":      r.data_hora_brasilia || "",
        "Cluster":        r.cluster || "",
        "Base":           r.base || "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Pacotes Faltantes");

    const nomeArquivo = ["Pacotes_Faltantes"];
    if (origem) nomeArquivo.push(origem === "report" ? "Report" : "Conferencia");
    if (ent)  nomeArquivo.push(ent.replace(/[\\/:*?"<>|]/g, ""));
    if (trns) nomeArquivo.push(trns.replace(/[\\/:*?"<>|]/g, ""));
    if (de || ate) nomeArquivo.push(`${de || "inicio"}_a_${ate || "fim"}`);
    XLSX.writeFile(wb, nomeArquivo.join("_") + ".xlsx");

    _fecharModal("modal-pfa-exportar");
}

// ── SELETOR DE INTERVALO DE DATAS (mesmo componente visual do Baixas Total Express) ──
let _pfaDrpMesRef = new Date();
let _pfaDrpInicio = null;
let _pfaDrpFim    = null;

function _pfaDrpDiaChave(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function _pfaDrpFormatarBR(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function _pfaDrpToggle() {
    const painel = document.getElementById("pfa-drp-panel");
    const vaiAbrir = painel.style.display === "none";
    painel.style.display = vaiAbrir ? "" : "none";
    if (vaiAbrir) _pfaDrpRenderGrid();
}

function _pfaDrpMudarMes(delta) {
    _pfaDrpMesRef.setMonth(_pfaDrpMesRef.getMonth() + delta);
    _pfaDrpRenderGrid();
}

function _pfaDrpClicarDia(chave) {
    const [y, m, d] = chave.split("-").map(Number);
    const dia = new Date(y, m - 1, d);
    if (!_pfaDrpInicio || _pfaDrpFim) {
        _pfaDrpInicio = dia; _pfaDrpFim = null;
    } else if (dia < _pfaDrpInicio) {
        _pfaDrpFim = _pfaDrpInicio; _pfaDrpInicio = dia;
    } else {
        _pfaDrpFim = dia;
    }
    _pfaDrpRenderGrid();
}

function _pfaDrpRenderGrid() {
    const ref = _pfaDrpMesRef;
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById("pfa-drp-mes-label").innerText = `${MESES[mes]} ${ano}`;

    const inicioGrid = new Date(ano, mes, 1);
    inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay());

    const hojeChave   = _pfaDrpDiaChave(new Date());
    const inicioChave = _pfaDrpInicio ? _pfaDrpDiaChave(_pfaDrpInicio) : null;
    const fimChave    = _pfaDrpFim    ? _pfaDrpDiaChave(_pfaDrpFim)    : null;

    let html = "";
    const cursor = new Date(inicioGrid);
    for (let i = 0; i < 42; i++) {
        const chave     = _pfaDrpDiaChave(cursor);
        const dow       = cursor.getDay();
        const foraDoMes = cursor.getMonth() !== mes;
        const emRange   = inicioChave && fimChave && chave >= inicioChave && chave <= fimChave;
        const ehInicio  = chave === inicioChave;
        const ehFim     = chave === fimChave;
        const unico     = inicioChave && !fimChave && ehInicio;

        let classes = "drp-day";
        if (foraDoMes) classes += " fora-mes";
        if (chave === hojeChave) classes += " hoje";
        if (emRange) classes += " in-range";
        if (emRange && (dow === 0 || ehInicio)) classes += " range-l";
        if (emRange && (dow === 6 || ehFim))    classes += " range-r";
        if (ehInicio || ehFim || unico) classes += " selecionado";

        html += `<button type="button" class="${classes}" onclick="_pfaDrpClicarDia('${chave}')">${cursor.getDate()}</button>`;
        cursor.setDate(cursor.getDate() + 1);
    }
    document.getElementById("pfa-drp-grid").innerHTML = html;
}

function _pfaDrpLimpar() {
    _pfaDrpInicio = null; _pfaDrpFim = null;
    document.getElementById("pfa-exp-de").value  = "";
    document.getElementById("pfa-exp-ate").value = "";
    document.getElementById("pfa-drp-label").innerText = "Todo o período";
    document.getElementById("pfa-drp-panel").style.display = "none";
}

function _pfaDrpAplicar() {
    const inicio = _pfaDrpInicio;
    const fim    = _pfaDrpFim || _pfaDrpInicio;
    document.getElementById("pfa-exp-de").value  = inicio ? _pfaDrpDiaChave(inicio) : "";
    document.getElementById("pfa-exp-ate").value = fim    ? _pfaDrpDiaChave(fim)    : "";
    document.getElementById("pfa-drp-label").innerText = !inicio
        ? "Todo o período"
        : (_pfaDrpDiaChave(inicio) === _pfaDrpDiaChave(fim)
            ? _pfaDrpFormatarBR(inicio)
            : `${_pfaDrpFormatarBR(inicio)} – ${_pfaDrpFormatarBR(fim)}`);
    document.getElementById("pfa-drp-panel").style.display = "none";
}

// Fecha o painel se o clique foi fora dele — composedPath() em vez de contains()
// pelo mesmo motivo do seletor de Baixas Total Express (a grade é reconstruída via
// innerHTML no clique, então o nó clicado já não existe mais quando o evento
// termina de borbulhar até aqui).
document.addEventListener("click", e => {
    const wrap = document.getElementById("pfa-drp-wrap");
    if (!wrap) return;
    const dentro = e.composedPath ? e.composedPath().includes(wrap) : wrap.contains(e.target);
    if (dentro) return;
    const painel = document.getElementById("pfa-drp-panel");
    if (painel) painel.style.display = "none";
});
