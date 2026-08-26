// ───── CUSTÓDIA ─────
// Pacote que fica guardado no galpão até alguém vir buscar. Bipa-se a entrada quando chega
// e a saída quando é retirado — o estoque é o que entrou e ainda não saiu.
//
// Uma tela só, de propósito: quem está no balcão com o pacote na mão escolhe entrada ou
// saída uma vez e bipa em sequência, sem trocar de tela entre um pacote e outro.

let _cusDados = { estoque: [], movimentos: [], resumo: {} };
let _cusObs   = [];        // observações rápidas cadastradas
let _cusObsSel = "";       // a que está marcada agora
let _cusTipo  = "entrada";
let _cusAba   = "estoque";
let _cusBusca = "";
let _cusMsgTimer = null;

function _cusEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirCustodia(event) {
    if (event) event.preventDefault();
    _cusTipo   = "entrada";
    _cusAba    = "estoque";
    _cusBusca  = "";
    _cusObsSel = "";
    const busca = document.getElementById("cus-busca");
    if (busca) busca.value = "";
    mostrarTela("tela-custodia");
    _cusPintarTipo();
    _cusPintarAbas();
    _cusCarregarObs();
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
    document.querySelectorAll("#cus-modos .cus-tab").forEach(b =>
        b.classList.toggle("ativa", b.dataset.tipo === _cusTipo));
    // O texto do campo acompanha a aba. Bipar uma leva de pacotes no modo errado é o erro
    // mais caro daqui, e a aba sozinha não segura a atenção de quem está olhando pro pacote,
    // não pro monitor.
    document.getElementById("cus-codigo").placeholder = _cusTipo === "entrada"
        ? "Bipar ou digitar o código que está ENTRANDO..."
        : "Bipar ou digitar o código que está SAINDO...";
}

// ── Observações rápidas ──
// O motivo de guardar um pacote se repete o dia inteiro. Digitar à mão toda vez é trabalho
// jogado fora, então os chips são o caminho normal e a lista mora no banco: quem cadastrar
// "Avaria" hoje resolve pros outros também.
function _cusCarregarObs() {
    fetch(`${API}/custodia/observacoes`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => { _cusObs = Array.isArray(d) ? d : []; _cusPintarChips(); })
    .catch(() => { _cusObs = []; _cusPintarChips(); });
}

function _cusPintarChips() {
    const el = document.getElementById("cus-chips");
    if (!el) return;
    el.innerHTML = _cusObs.map(o =>
        `<button type="button" class="cus-chip${_cusObsSel === o.texto ? " ativo" : ""}"
                 onclick="_cusEscolherObs('${_cusEsc(o.texto).replace(/'/g, "\\'")}')">${_cusEsc(o.texto)}</button>`
    ).join("") +
    `<button type="button" class="cus-chip nova" onclick="_cusAbrirNovaObs()">+ nova</button>`;
}

// Clicar de novo no mesmo chip desmarca: é comum o pacote seguinte não ter observação
// nenhuma, e sem como desmarcar a pessoa carregaria o motivo do anterior sem perceber.
function _cusEscolherObs(texto) {
    _cusObsSel = (_cusObsSel === texto) ? "" : texto;
    _cusPintarChips();
    const campo = document.getElementById("cus-codigo");
    if (campo) campo.focus();
}

function _cusAbrirNovaObs() {
    document.getElementById("cus-obs-nova").value = "";
    document.getElementById("cus-obs-erro").textContent = "";
    _abrirModal("modal-cus-obs");
    setTimeout(() => document.getElementById("cus-obs-nova").focus(), 60);
}

function _cusSalvarObs() {
    const texto = document.getElementById("cus-obs-nova").value.trim();
    const erro  = document.getElementById("cus-obs-erro");
    erro.textContent = "";
    if (!texto) { erro.textContent = "Escreva a observação."; return; }

    fetch(`${API}/custodia/observacoes`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ texto })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) { erro.textContent = d.error || "Não foi possível salvar."; return; }
        _fecharModal("modal-cus-obs");
        // Já deixa marcada: quem acabou de cadastrar é porque vai usar agora.
        _cusObsSel = (d.observacao && d.observacao.texto) || texto;
        _cusCarregarObs();
        const campo = document.getElementById("cus-codigo");
        if (campo) campo.focus();
    })
    .catch(() => { erro.textContent = "Erro ao conectar com o servidor."; });
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

    fetch(`${API}/custodia/movimento`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipo: _cusTipo, observacao: _cusObsSel })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) return _cusResposta(d.error || "Não foi possível registrar.", "erro");
        const m = d.movimento || {};
        _cusResposta(`${codigo} — ${m.tipo === "entrada" ? "entrou na" : "saiu da"} custódia.${
            _cusObsSel ? " (" + _cusObsSel + ")" : ""}`, "ok");
        // A observação NÃO se limpa: quem está recebendo uma leva de devolução bipa vinte
        // seguidos com o mesmo motivo, e reescolher a cada pacote seria o oposto de atalho.
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

// Cartão no mesmo componente do resto do sistema (.paj-card dentro do grid .shr-resumo).
function _cusRenderResumo() {
    const r = _cusDados.resumo || {};
    const card = (rotulo, valor, classe) => `
        <div class="paj-card ${classe || ""}">
            <div class="paj-label">${rotulo}</div>
            <div class="paj-value">${valor}</div>
        </div>`;
    document.getElementById("cus-resumo").innerHTML =
        card("Em custódia", r.em_custodia || 0) +
        card("Entradas hoje", r.entradas_hoje || 0, "positivo") +
        card("Saídas hoje", r.saidas_hoje || 0);
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
        ? `<tr><th>Código</th><th>Observação</th><th>Guardado por</th><th>Entrou em</th></tr>`
        : `<tr><th>Código</th><th>Movimento</th><th>Observação</th><th>Usuário</th><th>Data/Hora</th></tr>`;

    const colunas = estoque ? 4 : 5;
    if (!lista.length) {
        document.getElementById("cus-tbody").innerHTML =
            `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:24px">${
                _cusBusca ? "Nenhum código com essa busca."
                    : estoque ? "Nenhum pacote em custódia." : "Nenhum movimento registrado."}</td></tr>`;
        return;
    }

    const cod = c => `<td data-label="Código" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;color:#e2e8f0">${_cusEsc(c)}</td>`;
    const obs = o => `<td data-label="Observação">${o
        ? `<span class="cus-chip ativo" style="cursor:default">${_cusEsc(o)}</span>`
        : `<span style="color:#717f95">—</span>`}</td>`;

    // A tela mostra o começo da lista; o arquivo inteiro sai pela exportação. Despejar
    // milhares de linhas aqui trava o navegador e não ajuda ninguém a achar nada.
    const mostrar = lista.slice(0, 300);
    document.getElementById("cus-tbody").innerHTML = mostrar.map(l => estoque ? `
        <tr>
            ${cod(l.codigo)}
            ${obs(l.observacao)}
            <td data-label="Guardado por">${_cusEsc(l.usuario_nome) || "—"}</td>
            <td data-label="Entrou em" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.data_hora_brasilia) || "—"}</td>
        </tr>` : `
        <tr>
            ${cod(l.codigo)}
            <td data-label="Movimento"><span style="color:${l.tipo === "entrada" ? "#22c55e" : "#eab308"};font-weight:700;font-size:12.5px">${
                l.tipo === "entrada" ? "Entrada" : "Saída"}</span></td>
            ${obs(l.observacao)}
            <td data-label="Usuário">${_cusEsc(l.usuario_nome) || "—"}</td>
            <td data-label="Data/Hora" style="color:#8494a9;font-size:12.5px">${_cusEsc(l.data_hora_brasilia) || "—"}</td>
        </tr>`).join("") + (lista.length > mostrar.length
        ? `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:14px">
             + ${lista.length - mostrar.length} não mostrados — use a exportação para ver tudo</td></tr>`
        : "");
}

// ───── EXPORTAÇÃO ─────
// Um botão só. Antes eram dois — "estoque" e "movimentos" — e ninguém adivinha a diferença
// olhando pro rótulo; agora a escolha é a primeira pergunta dentro do modal.
//
// O filtro roda aqui no navegador sobre o que já foi carregado, igual ao de Pacotes
// Faltantes: mexer no seletor não custa uma ida ao servidor a cada ajuste.

function _cusDataISO(dataHoraBrasilia) {
    const m = String(dataHoraBrasilia || "").match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function _cusAbrirExportar() {
    const movs = _cusDados.movimentos || [];
    const usuarios = [...new Set(movs.map(r => r.usuario_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    // As observações do filtro saem do que foi usado de fato, não da lista cadastrada: o que
    // interessa é filtrar o que existe no histórico.
    const obsUsadas = [...new Set(movs.map(r => r.observacao).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

    document.getElementById("cus-exp-usuario").innerHTML =
        `<option value="">Todos os usuários</option>` + usuarios.map(u => `<option value="${_cusEsc(u)}">${_cusEsc(u)}</option>`).join("");
    document.getElementById("cus-exp-obs").innerHTML =
        `<option value="">Todas as observações</option>` + obsUsadas.map(o => `<option value="${_cusEsc(o)}">${_cusEsc(o)}</option>`).join("");
    // Abre sempre no histórico. Herdar a aba parecia esperto, mas quem abre o modal pelo
    // botão espera ver o calendário — e ele sumia sem explicação quando a aba era estoque.
    document.getElementById("cus-exp-fonte").value = "movimentos";
    document.getElementById("cus-exp-tipo").value = "";
    document.getElementById("cus-exp-de").value  = "";
    document.getElementById("cus-exp-ate").value = "";
    document.getElementById("cus-exp-erro").textContent = "";
    document.getElementById("cus-drp-label").innerText = "Todo o período";
    document.getElementById("cus-drp-panel").style.display = "none";
    _cusDrpMesRef = new Date();
    _cusDrpInicio = null;
    _cusDrpFim    = null;
    _cusExpTrocarFonte();
    _abrirModal("modal-cus-exportar");
}

// Estoque é uma foto de agora: período, tipo de movimento e usuário não querem dizer nada
// ali, e deixar os campos à mostra sugeriria um filtro que não existe.
function _cusExpTrocarFonte() {
    const estoque = document.getElementById("cus-exp-fonte").value === "estoque";
    document.getElementById("cus-exp-filtros").style.display = estoque ? "none" : "";
    // Some com os filtros mas diz por quê: campo que desaparece sem explicação faz a pessoa
    // achar que a tela quebrou, que foi exatamente o que aconteceu com o calendário.
    document.getElementById("cus-exp-nota").style.display = estoque ? "" : "none";
}

function _cusExportar() {
    const erroEl = document.getElementById("cus-exp-erro");
    erroEl.textContent = "";

    if (document.getElementById("cus-exp-fonte").value === "estoque") {
        const lista = _cusDados.estoque || [];
        if (!lista.length) { erroEl.textContent = "Não há pacotes em custódia para exportar."; return; }
        const linhas = lista.map(r => ({
            "Código":       r.codigo || "",
            "Observação":   r.observacao || "",
            "Guardado por": r.usuario_nome || "",
            "Entrou em":    r.data_hora_brasilia || "",
        }));
        _cusBaixar(linhas, "Em custódia", ["Custodia_Estoque", new Date().toISOString().slice(0, 10)]);
        return;
    }

    const de   = document.getElementById("cus-exp-de").value;
    const ate  = document.getElementById("cus-exp-ate").value;
    const tipo = document.getElementById("cus-exp-tipo").value;
    const usr  = document.getElementById("cus-exp-usuario").value;
    const obs  = document.getElementById("cus-exp-obs").value;

    const filtrados = (_cusDados.movimentos || []).filter(r => {
        if (tipo && r.tipo !== tipo) return false;
        if (usr && r.usuario_nome !== usr) return false;
        if (obs && (r.observacao || "") !== obs) return false;
        if (de || ate) {
            const iso = _cusDataISO(r.data_hora_brasilia);
            if (!iso) return false;
            if (de && iso < de) return false;
            if (ate && iso > ate) return false;
        }
        return true;
    });

    if (!filtrados.length) { erroEl.textContent = "Nenhum movimento encontrado com esses filtros."; return; }

    // Ordem cronológica no arquivo: a tela mostra o mais recente primeiro, mas planilha de
    // movimentação se lê do começo pro fim.
    const linhas = filtrados.slice().reverse().map(r => ({
        "Código":     r.codigo || "",
        "Movimento":  r.tipo === "entrada" ? "Entrada" : "Saída",
        "Observação": r.observacao || "",
        "Usuário":    r.usuario_nome || "",
        "Data/Hora":  r.data_hora_brasilia || "",
    }));

    const nome = ["Custodia_Movimentos"];
    if (tipo) nome.push(tipo === "entrada" ? "Entradas" : "Saidas");
    if (usr)  nome.push(usr);
    if (obs)  nome.push(obs);
    if (de || ate) nome.push(`${de || "inicio"}_a_${ate || "fim"}`);
    _cusBaixar(linhas, "Custódia", nome);
}

function _cusBaixar(linhas, aba, partesNome) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), aba);
    const nome = partesNome.map(p => String(p).replace(/[\\/:*?"<>|]/g, "")).join("_");
    XLSX.writeFile(wb, nome + ".xlsx");
    _fecharModal("modal-cus-exportar");
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
