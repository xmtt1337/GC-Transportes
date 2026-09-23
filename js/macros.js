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

function _macLinhaRodada(r, i) {
    return `
    <div style="display:flex;gap:8px;align-items:flex-end;margin-bottom:10px;flex-wrap:wrap;padding:12px;background:rgba(255,255,255,0.03);border-radius:10px">
        <div>
            <label class="usr-modal-label" style="font-size:10px">Horário</label>
            <div style="display:flex;gap:4px;align-items:center">
                <input type="number" min="0" max="23" value="${r.hora}" style="width:54px" class="usr-modal-input" oninput="_macMudarCampo(${i},'hora',this.value)">
                <span style="color:#7b98b5">:</span>
                <input type="number" min="0" max="59" value="${r.minuto}" style="width:54px" class="usr-modal-input" oninput="_macMudarCampo(${i},'minuto',this.value)">
            </div>
        </div>
        <div style="flex:1;min-width:200px">
            <label class="usr-modal-label" style="font-size:10px">Critério</label>
            <select class="usr-modal-input" style="cursor:pointer" onchange="_macMudarTipo(${i}, this.value)">
                ${_macTipos.map(t => `<option value="${t.id}"${t.id === r.tipo ? " selected" : ""}>${_macEsc(t.rotulo)}</option>`).join("")}
            </select>
        </div>
        <div style="width:120px">
            <label class="usr-modal-label" style="font-size:10px">${_macEsc(_macRotuloParametro(r.tipo))}</label>
            <input type="number" min="0" value="${r.parametro}" class="usr-modal-input" oninput="_macMudarCampo(${i},'parametro',this.value)">
        </div>
        <button type="button" onclick="_macRemoverRodada(${i})" title="Remover rodada"
                style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#ef4444;width:34px;height:34px;border-radius:8px;cursor:pointer;font-size:16px;line-height:1;flex-shrink:0">×</button>
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
