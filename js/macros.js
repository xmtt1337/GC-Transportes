// ───── MACROS (SÓ DEV) ─────
// Tarefas que o sistema roda sozinho. Hoje só o aviso de rota incompleta pro entregador
// (modules/avisos-entregador) — a lista existe pra caber mais no futuro sem redesenhar a
// tela: cada macro tem chave, nome, descrição, ativo e um resumo pronto do servidor.
//
// Configurar é sempre pela tela — nunca mexendo direto no banco (mesmo espírito de
// Conversão de nomes e Telefones dos entregadores).

let _macLista = [];
let _macTipos = [];     // catálogo de critérios do macro aberto no modal (vem do servidor)
let _macRodadas = [];   // cópia de trabalho das rodadas de quem está aberto no modal
let _macChaveEditando = null;

function abrirMacros(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev acessa os Macros.");
        return;
    }
    mostrarTela("tela-macros");
    _macCarregarLista();
}

function _macEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// "avisos_entregador" -> "avisos-entregador", o caminho que o servidor usa. Funciona pra
// qualquer chave futura que siga a mesma convenção, sem precisar de uma tabela de rotas.
const _macRotaDaChave = chave => String(chave || "").replace(/_/g, "-");

function _macCarregarLista() {
    const empty = document.getElementById("mac-empty");
    const lista = document.getElementById("mac-lista");
    skMostrar(empty, "cards");
    empty.style.display = "";
    lista.innerHTML = "";

    fetch(`${API}/admin/macros`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            _macLista = d.macros || [];
            if (!_macLista.length) { skFim(empty, "Nenhum macro cadastrado ainda."); return; }
            empty.style.display = "none";
            lista.innerHTML = _macLista.map(m => `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 18px;margin-bottom:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px">
                    <div style="min-width:0">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
                            <span style="font-weight:600;color:#e2e8f0">${_macEsc(m.nome)}</span>
                            <span class="adm-usr-badge ${m.ativo ? "ativo" : "inativo"}">${m.ativo ? "Ativo" : "Inativo"}</span>
                        </div>
                        <div style="font-size:12.5px;color:#8494a9;margin-bottom:6px">${_macEsc(m.descricao)}</div>
                        <div style="font-size:12px;color:#66829c">${_macEsc(m.resumo)}</div>
                    </div>
                    <button type="button" class="adm-usr-action senha" onclick="_macAbrirConfigurar('${m.chave}')">Configurar</button>
                </div>`).join("");
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _macAbrirConfigurar(chave) {
    _macChaveEditando = chave;
    const m = _macLista.find(x => x.chave === chave);
    document.getElementById("mac-editar-titulo").innerText = (m && m.nome) || "Configurar macro";
    document.getElementById("mac-editar-descricao").innerText = (m && m.descricao) || "";
    document.getElementById("mac-editar-erro").innerText = "";

    fetch(`${API}/admin/macros/${_macRotaDaChave(chave)}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.error) { gcAlert(d.error); return; }
            _macTipos = d.tipos || [];
            _macRodadas = (d.rodadas || []).map(r => Object.assign({}, r));
            document.getElementById("mac-editar-ativo").checked = !!d.ativo;
            _macRenderizarRodadas();
            _abrirModal("modal-macro-editar");
        })
        .catch(() => gcAlert("Erro ao conectar com o servidor."));
}

function _macRotuloParametro(tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    return t ? t.parametroRotulo : "Parâmetro";
}

// Dois dígitos nos rótulos: "03", não "3".
const _macDoisDigitos = n => String(n).padStart(2, "0");

// As opções de um seletor de horário, de `de` até `ate`, sempre com dois dígitos. Hora e minuto
// são dois seletores comuns (00–23 e 00–59) em vez de um campo type="time": a lista do campo
// nativo do Chrome dá a volta (depois do 59 vem o 00 de novo) e parecia rolar sem fim. Se o
// valor atual não é um inteiro da faixa (hora vazia, por exemplo), entra um "--" marcado — em
// vez de o seletor escolher "00" sozinho e mostrar um horário que não é o que está guardado.
function _macOpcoes(de, ate, atual) {
    const valido = Number.isInteger(atual) && atual >= de && atual <= ate;
    let html = valido ? "" : `<option value="" selected>--</option>`;
    for (let n = de; n <= ate; n++) {
        html += `<option value="${n}"${valido && n === atual ? " selected" : ""}>${_macDoisDigitos(n)}</option>`;
    }
    return html;
}

const _macCapitalizar = s => String(s || "").charAt(0).toUpperCase() + String(s || "").slice(1);

// Uma rodada = uma linha (sem cartão dentro do cartão do modal): horário, critério, o número
// do critério e um "Remover" discreto. O rótulo do número acompanha o critério escolhido.
function _macLinhaRodada(r, i) {
    const rotuloParam = _macRotuloParametro(r.tipo);
    return `
    <div class="mac-rodada">
        <div class="mac-campo mac-campo-horario" role="group" aria-label="Horário">
            <span>Horário</span>
            <div class="mac-horario">
                <select class="usr-modal-input mac-hm" aria-label="Hora" onchange="_macMudarCampo(${i},'hora',this.value)">${_macOpcoes(0, 23, r.hora)}</select>
                <b>:</b>
                <select class="usr-modal-input mac-hm" aria-label="Minuto" onchange="_macMudarCampo(${i},'minuto',this.value)">${_macOpcoes(0, 59, r.minuto)}</select>
            </div>
        </div>
        <label class="mac-campo mac-campo-criterio">
            <span>Critério</span>
            <select class="usr-modal-input mac-criterio" title="${_macEsc((_macTipos.find(t => t.id === r.tipo) || {}).rotulo)}"
                    onchange="_macMudarTipo(${i}, this.value)">
                ${_macTipos.map(t => `<option value="${t.id}"${t.id === r.tipo ? " selected" : ""}>${_macEsc(t.rotulo)}</option>`).join("")}
            </select>
        </label>
        <label class="mac-campo mac-campo-param">
            <span title="${_macEsc(rotuloParam)}">${_macEsc(_macCapitalizar(rotuloParam))}</span>
            <input type="number" min="0" class="usr-modal-input" value="${r.parametro}"
                   oninput="_macMudarCampo(${i},'parametro',this.value)">
        </label>
        <button type="button" class="mac-remover" onclick="_macRemoverRodada(${i})">Remover</button>
    </div>`;
}

function _macRenderizarRodadas() {
    const el = document.getElementById("mac-rodadas-lista");
    if (!_macRodadas.length) {
        el.innerHTML = `<div style="font-size:12.5px;color:#66829c;padding:8px 0">Nenhuma rodada — adicione pelo menos uma.</div>`;
        return;
    }
    el.innerHTML = _macRodadas.map((r, i) => _macLinhaRodada(r, i)).join("");
}

// `_macRodadas` é sempre quem manda: os campos só escrevem nela, e um re-render (troca de
// tipo) nunca perde o que já foi digitado nos outros campos.
function _macMudarCampo(i, campo, valor) {
    _macRodadas[i][campo] = valor === "" ? "" : Number(valor);
}

function _macMudarTipo(i, tipoId) {
    const t = _macTipos.find(x => x.id === tipoId);
    _macRodadas[i].tipo = tipoId;
    _macRodadas[i].parametro = t ? t.parametroPadrao : 0;
    _macRenderizarRodadas(); // o rótulo do campo parâmetro muda junto com o tipo
}

function _macAdicionarRodada() {
    const primeiro = _macTipos[0];
    _macRodadas.push({ hora: 12, minuto: 0, tipo: primeiro ? primeiro.id : "", parametro: primeiro ? primeiro.parametroPadrao : 0 });
    _macRenderizarRodadas();
}

function _macRemoverRodada(i) {
    _macRodadas.splice(i, 1);
    _macRenderizarRodadas();
}

function _macSalvar() {
    const erro = document.getElementById("mac-editar-erro");
    erro.innerText = "";
    if (!_macRodadas.length) { erro.innerText = "Adicione pelo menos uma rodada."; return; }

    const ativo = document.getElementById("mac-editar-ativo").checked;
    const btn = document.getElementById("mac-editar-salvar");
    btn.disabled = true;
    btn.textContent = "Salvando...";

    fetch(`${API}/admin/macros/${_macRotaDaChave(_macChaveEditando)}`, {
        method: "PUT",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ ativo, rodadas: _macRodadas })
    })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            if (!ok) { erro.innerText = d.error || "Não foi possível salvar."; return; }
            _fecharModal("modal-macro-editar");
            _macCarregarLista();
        })
        .catch(() => {
            btn.disabled = false;
            btn.textContent = "Salvar";
            erro.innerText = "Erro ao conectar com o servidor.";
        });
}
