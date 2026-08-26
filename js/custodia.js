// ───── CUSTÓDIA ─────
// Pacote que fica guardado no galpão até alguém vir buscar. Bipa-se a entrada quando chega
// e a saída quando é retirado — o estoque é o que entrou e ainda não saiu.
//
// Uma tela só, de propósito: quem está no balcão com o pacote na mão escolhe entrada ou
// saída uma vez e bipa em sequência, sem trocar de aba entre um pacote e outro.

let _cusDados = { estoque: [], movimentos: [], resumo: {} };
let _cusTipo  = "entrada";
let _cusAba   = "estoque";
let _cusBusca = "";
let _cusMsgTimer = null;

function _cusEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirCustodia(event) {
    if (event) event.preventDefault();
    _cusTipo  = "entrada";
    _cusAba   = "estoque";
    _cusBusca = "";
    const busca = document.getElementById("cus-busca");
    if (busca) busca.value = "";
    mostrarTela("tela-custodia");
    _cusPintarTipo();
    _cusPintarAbas();
    _cusCarregar();
    const campo = document.getElementById("cus-codigo");
    if (campo) { campo.value = ""; campo.focus(); }
}

// ── Entrada ou saída ──
function _cusTrocarTipo(tipo) {
    _cusTipo = tipo;
    _cusPintarTipo();
    const campo = document.getElementById("cus-codigo");
    campo.value = "";
    campo.focus();
}

function _cusPintarTipo() {
    document.querySelectorAll("#cus-tipo .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.tipo === _cusTipo));
    const entrada = _cusTipo === "entrada";
    // O campo inteiro muda de cara junto com o modo. Bipar 40 pacotes seguidos no modo
    // errado é o erro mais caro que dá pra cometer aqui, e um rótulo pequeno no topo da
    // tela não segura a atenção de quem está olhando pro pacote, não pro monitor.
    const modo = document.getElementById("cus-modo");
    modo.innerText = entrada ? "Registrando ENTRADA" : "Registrando SAÍDA";
    modo.style.color = entrada ? "#22c55e" : "#eab308";
    document.getElementById("cus-codigo").placeholder = entrada
        ? "Bipar ou digitar o código que está entrando..."
        : "Bipar ou digitar o código que está saindo...";
}

// ── Bipagem ──
function _cusCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _cusRegistrar(); }
}

function _cusScan() {
    _bteAbrirScanner(codigo => _cusRegistrar(codigo), {
        continuo: true,
        areaCheia: true,
        titulo: _cusTipo === "entrada" ? "Entrada na custódia" : "Saída da custódia",
    });
}

function _cusRegistrar(codigoLido) {
    const campo = document.getElementById("cus-codigo");
    const codigo = String(codigoLido != null ? codigoLido : campo.value).trim().toUpperCase();
    // Com a câmera aberta o campo fica atrás do overlay: focar ali subiria o teclado do
    // celular por cima da imagem.
    if (codigoLido == null) { campo.value = ""; campo.focus(); }
    if (!codigo) return;

    const obsEl = document.getElementById("cus-obs");
    fetch(`${API}/custodia/movimento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipo: _cusTipo, observacao: obsEl ? obsEl.value.trim() : "" })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) return _cusResposta(d.error || "Não foi possível registrar.", "erro");
        const m = d.movimento || {};
        _cusResposta(`${codigo} — ${m.tipo === "entrada" ? "entrou na" : "saiu da"} custódia.`, "ok");
        if (obsEl) obsEl.value = "";
        _cusCarregar(true);
    })
    .catch(() => _cusResposta("Erro ao conectar com o servidor.", "erro"));
}

// Som e cor no bipe: quem está com o pacote na mão não olha a tela a cada leitura, e é pelo
// apito que percebe que alguma coisa saiu errada.
function _cusResposta(msg, tipo) {
    if (tipo === "ok") { _gcBeepSucesso(); } else { _gcBeepErro(); }
    const wrap = document.getElementById("cus-campo");
    if (wrap) {
        wrap.classList.remove("flash-ok", "flash-err");
        void wrap.offsetWidth;   // reinicia a animação em bipes seguidos
        wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
        setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
    }
    const el = document.getElementById("cus-msg");
    const cor = tipo === "ok" ? "#22c55e" : "#ef4444";
    el.style.display = "";
    el.innerHTML = `<div style="background:${cor}1a;border:1px solid ${cor}55;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;color:${cor}">${_cusEsc(msg)}</div>`;
    clearTimeout(_cusMsgTimer);
    _cusMsgTimer = setTimeout(() => { el.style.display = "none"; }, 5000);
    // Com a câmera em tela cheia esta mensagem fica atrás do overlay.
    if (document.getElementById("bte-scan-overlay")) _bteScanStatus(msg, tipo);
}

// ── Carregar ──
function _cusCarregar(silencioso) {
    const empty = document.getElementById("cus-empty");
    if (!silencioso) {
        skMostrar(empty, "tabela");
        empty.style.display = "";
        document.getElementById("cus-resultado").style.display = "none";
    }
    fetch(`${API}/custodia`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (d && d.error) { skFim(empty, d.error); return; }
        _cusDados = d;
        empty.style.display = "none";
        document.getElementById("cus-resultado").style.display = "";
        _cusRenderResumo();
        _cusRenderLista();
    })
    .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _cusRenderResumo() {
    const r = _cusDados.resumo || {};
    document.getElementById("cus-resumo").innerHTML = `
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:#3a86ff">${r.em_custodia || 0}</span><span class="shr-resumo-lbl">Em custódia</span></div>
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:#22c55e">${r.entradas_hoje || 0}</span><span class="shr-resumo-lbl">Entradas hoje</span></div>
        <div class="shr-resumo-item"><span class="shr-resumo-num" style="color:#eab308">${r.saidas_hoje || 0}</span><span class="shr-resumo-lbl">Saídas hoje</span></div>`;
}

// ── Abas e lista ──
function _cusTrocarAba(aba) {
    _cusAba = aba;
    _cusPintarAbas();
    _cusRenderLista();
}

function _cusPintarAbas() {
    document.querySelectorAll("#cus-abas .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.aba === _cusAba));
}

function _cusFiltrar(valor) {
    _cusBusca = String(valor || "").trim().toUpperCase();
    _cusRenderLista();
}

function _cusRenderLista() {
    const estoque = _cusAba === "estoque";
    const bruto = estoque ? (_cusDados.estoque || []) : (_cusDados.movimentos || []);
    const lista = _cusBusca
        ? bruto.filter(l => String(l.codigo || "").toUpperCase().includes(_cusBusca))
        : bruto;

    document.getElementById("cus-thead").innerHTML = estoque
        ? `<tr><th>Código</th><th>Guardado por</th><th>Entrou em</th><th>Observação</th></tr>`
        : `<tr><th>Código</th><th>Movimento</th><th>Usuário</th><th>Data/Hora</th><th>Observação</th></tr>`;

    const colunas = estoque ? 4 : 5;
    if (!lista.length) {
        document.getElementById("cus-tbody").innerHTML =
            `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:24px">${
                _cusBusca ? "Nenhum código com essa busca."
                    : estoque ? "Nenhum pacote em custódia." : "Nenhum movimento registrado."}</td></tr>`;
        return;
    }

    // A tela mostra o começo da lista; o arquivo inteiro sai pela exportação. Despejar
    // milhares de linhas aqui trava o navegador e não ajuda ninguém a achar nada.
    const mostrar = lista.slice(0, 300);
    document.getElementById("cus-tbody").innerHTML = mostrar.map(l => estoque ? `
        <tr>
            <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cusEsc(l.codigo)}</td>
            <td data-label="Guardado por">${_cusEsc(l.usuario_nome) || "—"}</td>
            <td data-label="Entrou em" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.data_hora_brasilia) || "—"}</td>
            <td data-label="Observação" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.observacao) || "—"}</td>
        </tr>` : `
        <tr>
            <td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cusEsc(l.codigo)}</td>
            <td data-label="Movimento"><span style="color:${l.tipo === "entrada" ? "#22c55e" : "#eab308"};font-weight:700;font-size:12.5px">${
                l.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
            <td data-label="Usuário">${_cusEsc(l.usuario_nome) || "—"}</td>
            <td data-label="Data/Hora" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.data_hora_brasilia) || "—"}</td>
            <td data-label="Observação" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.observacao) || "—"}</td>
        </tr>`).join("") + (lista.length > mostrar.length
        ? `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:14px">
             + ${lista.length - mostrar.length} não mostrados — use a exportação para ver tudo</td></tr>`
        : "");
}

// ───── EXPORTAÇÃO ─────
// Mesmo componente de intervalo de datas do Registro de Pacotes Faltantes. O filtro é feito
// aqui no navegador sobre o que já foi carregado: mexer no seletor não custa ida ao servidor.

function _cusDataISO(dataHoraBrasilia) {
    const m = String(dataHoraBrasilia || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function _cusAbrirExportar() {
    const usuarios = [...new Set((_cusDados.movimentos || []).map(r => r.usuario_nome).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
    document.getElementById("cus-exp-usuario").innerHTML =
        `<option value="">Todos os usuários</option>` + usuarios.map(u => `<option value="${_cusEsc(u)}">${_cusEsc(u)}</option>`).join("");
    document.getElementById("cus-exp-tipo").value = "";
    document.getElementById("cus-exp-de").value  = "";
    document.getElementById("cus-exp-ate").value = "";
    document.getElementById("cus-exp-erro").textContent = "";
    document.getElementById("cus-drp-label").innerText = "Todo o período";
    document.getElementById("cus-drp-panel").style.display = "none";
    _cusDrpMesRef = new Date();
    _cusDrpInicio = null;
    _cusDrpFim    = null;
    _abrirModal("modal-cus-exportar");
}

function _cusExportar() {
    const de   = document.getElementById("cus-exp-de").value;
    const ate  = document.getElementById("cus-exp-ate").value;
    const tipo = document.getElementById("cus-exp-tipo").value;
    const usr  = document.getElementById("cus-exp-usuario").value;
    const erroEl = document.getElementById("cus-exp-erro");
    erroEl.textContent = "";

    const filtrados = (_cusDados.movimentos || []).filter(r => {
        if (tipo && r.tipo !== tipo) return false;
        if (usr && r.usuario_nome !== usr) return false;
        if (de || ate) {
            const iso = _cusDataISO(r.data_hora_brasilia);
            if (!iso) return false;
            if (de && iso < de) return false;
            if (ate && iso > ate) return false;
        }
        return true;
    });

    if (!filtrados.length) {
        erroEl.textContent = "Nenhum movimento encontrado com esses filtros.";
        return;
    }

    // Ordem cronológica no arquivo: a tela mostra o mais recente primeiro, mas planilha de
    // movimentação se lê do começo pro fim.
    const linhas = filtrados.slice().reverse().map(r => ({
        "Código":     r.codigo || "",
        "Movimento":  r.tipo === "entrada" ? "Entrada" : "Saída",
        "Usuário":    r.usuario_nome || "",
        "Data/Hora":  r.data_hora_brasilia || "",
        "Observação": r.observacao || "",
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Custódia");

    const nome = ["Custodia"];
    if (tipo) nome.push(tipo === "entrada" ? "Entradas" : "Saidas");
    if (usr)  nome.push(usr.replace(/[\\/:*?"<>|]/g, ""));
    if (de || ate) nome.push(`${de || "inicio"}_a_${ate || "fim"}`);
    XLSX.writeFile(wb, nome.join("_") + ".xlsx");

    _fecharModal("modal-cus-exportar");
}

// Exporta o estoque atual — a pergunta "o que está guardado agora" é diferente de "o que
// movimentou no período", e sair só com o histórico obrigaria a montar a conta na mão.
function _cusExportarEstoque() {
    const lista = _cusDados.estoque || [];
    if (!lista.length) return gcAlert("Não há pacotes em custódia para exportar.");
    const linhas = lista.map(r => ({
        "Código":       r.codigo || "",
        "Guardado por": r.usuario_nome || "",
        "Entrou em":    r.data_hora_brasilia || "",
        "Observação":   r.observacao || "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), "Em custódia");
    XLSX.writeFile(wb, "Custodia_Estoque_" + new Date().toISOString().slice(0, 10) + ".xlsx");
}

// ── Seletor de intervalo de datas (mesmo componente visual das outras telas) ──
let _cusDrpMesRef = new Date();
let _cusDrpInicio = null;
let _cusDrpFim    = null;

function _cusDrpDiaChave(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function _cusDrpFormatarBR(d) {
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function _cusDrpToggle() {
    const painel = document.getElementById("cus-drp-panel");
    const vaiAbrir = painel.style.display === "none";
    painel.style.display = vaiAbrir ? "" : "none";
    if (vaiAbrir) _cusDrpRenderGrid();
}

function _cusDrpMudarMes(delta) {
    _cusDrpMesRef.setMonth(_cusDrpMesRef.getMonth() + delta);
    _cusDrpRenderGrid();
}

function _cusDrpClicarDia(chave) {
    const [y, m, d] = chave.split("-").map(Number);
    const dia = new Date(y, m - 1, d);
    if (!_cusDrpInicio || _cusDrpFim) {
        _cusDrpInicio = dia; _cusDrpFim = null;
    } else if (dia < _cusDrpInicio) {
        _cusDrpFim = _cusDrpInicio; _cusDrpInicio = dia;
    } else {
        _cusDrpFim = dia;
    }
    _cusDrpRenderGrid();
}

function _cusDrpRenderGrid() {
    const ref = _cusDrpMesRef;
    const ano = ref.getFullYear(), mes = ref.getMonth();
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    document.getElementById("cus-drp-mes-label").innerText = `${MESES[mes]} ${ano}`;

    const inicioGrid = new Date(ano, mes, 1);
    inicioGrid.setDate(inicioGrid.getDate() - inicioGrid.getDay());

    const hojeChave   = _cusDrpDiaChave(new Date());
    const inicioChave = _cusDrpInicio ? _cusDrpDiaChave(_cusDrpInicio) : null;
    const fimChave    = _cusDrpFim    ? _cusDrpDiaChave(_cusDrpFim)    : null;

    let html = "";
    const cursor = new Date(inicioGrid);
    for (let i = 0; i < 42; i++) {
        const chave     = _cusDrpDiaChave(cursor);
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

        html += `<button type="button" class="${classes}" onclick="_cusDrpClicarDia('${chave}')">${cursor.getDate()}</button>`;
        cursor.setDate(cursor.getDate() + 1);
    }
    document.getElementById("cus-drp-grid").innerHTML = html;
}

function _cusDrpLimpar() {
    _cusDrpInicio = null; _cusDrpFim = null;
    document.getElementById("cus-exp-de").value  = "";
    document.getElementById("cus-exp-ate").value = "";
    document.getElementById("cus-drp-label").innerText = "Todo o período";
    document.getElementById("cus-drp-panel").style.display = "none";
}

function _cusDrpAplicar() {
    const inicio = _cusDrpInicio;
    const fim    = _cusDrpFim || _cusDrpInicio;
    document.getElementById("cus-exp-de").value  = inicio ? _cusDrpDiaChave(inicio) : "";
    document.getElementById("cus-exp-ate").value = fim    ? _cusDrpDiaChave(fim)    : "";
    document.getElementById("cus-drp-label").innerText = !inicio
        ? "Todo o período"
        : (_cusDrpDiaChave(inicio) === _cusDrpDiaChave(fim)
            ? _cusDrpFormatarBR(inicio)
            : `${_cusDrpFormatarBR(inicio)} – ${_cusDrpFormatarBR(fim)}`);
    document.getElementById("cus-drp-panel").style.display = "none";
}

// Fecha o painel no clique fora. composedPath() e não contains(): a grade é reconstruída via
// innerHTML no clique, então o nó clicado já não existe quando o evento chega aqui.
document.addEventListener("click", e => {
    const wrap = document.getElementById("cus-drp-wrap");
    if (!wrap) return;
    const dentro = e.composedPath ? e.composedPath().includes(wrap) : wrap.contains(e.target);
    if (dentro) return;
    const painel = document.getElementById("cus-drp-panel");
    if (painel) painel.style.display = "none";
});
