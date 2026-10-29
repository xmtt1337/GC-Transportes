// ───── FECHAMENTO › CONVERSÕES ─────
// Um lugar só pras conversões, por aba:
//   Cidade                       Conversão de cidades (editor do fechamento-criar.js, #cf-cidades)
//   Usuário → Usuário principal  login de cada transportadora → a PESSOA (novo, 29/10/2026)
//   Usuário → Entregador         Conversão de nomes (nomes-padrao.js; só dev edita)
// Fica: login → usuário principal → entregador. A PNR conta pela pessoa (soma os logins dela
// de todas as transportadoras) e, se passar, caem as entregas de todos os logins dela no dia.
// Backend: /admin/fechamento-transportadoras/principais (modules/fechamento-transportadoras/principais.js).
const _CV_API = () => `${API}/admin/fechamento-transportadoras`;
const _CV_ABAS = [["principal", "Usuário → Usuário principal"], ["entregador", "Usuário → Entregador"], ["cidade", "Cidade"]];
let _cvAba = "principal";
let _cvDados = null;

function _cvEsc(t) {
    return String(t ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function _cvNorm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(); }
function _cvHeaders(json) {
    const h = { "Authorization": "Bearer " + token };
    if (json) h["Content-Type"] = "application/json";
    return h;
}

function abrirConversoes(event, aba) {
    if (event) event.preventDefault();
    mostrarTela("tela-conversoes");
    _cvAbrirAba(aba || _cvAba);
}

function _cvAbrirAba(aba) {
    _cvAba = aba;
    document.getElementById("cv-abas").innerHTML = _CV_ABAS.map(([k, n]) =>
        `<button type="button" class="filtro-tab${k === aba ? " active" : ""}" onclick="_cvAbrirAba('${k}')">${n}</button>`).join("");
    for (const [k] of _CV_ABAS) {
        const p = document.getElementById("cv-painel-" + k);
        if (p) p.style.display = k === aba ? "" : "none";
    }
    if (aba === "principal") _cvCarregar();
    if (aba === "cidade") {
        const el = document.getElementById("cf-cidades");
        if (el) { el.style.display = "none"; _cfAbrirConvCidades(); }
    }
    if (aba === "entregador") {
        const dev = window._gcUser && window._gcUser.role === "dev";
        document.getElementById("cv-entregador-aviso").style.display = dev ? "none" : "";
        document.getElementById("cv-entregador-conteudo").style.display = dev ? "" : "none";
        if (dev) { document.getElementById("cnp-busca").value = ""; _cnpCarregar(); }
    }
}

// ── Usuário → Usuário principal ──
function _cvCarregar(msg) {
    const el = document.getElementById("cv-principal");
    if (!el) return;
    if (!_cvDados) el.innerHTML = `<div class="cft-ajuda">Carregando...</div>`;
    fetch(`${_CV_API()}/principais`, { headers: _cvHeaders() })
    .then(r => r.json())
    .then(d => {
        if (d.error) { el.innerHTML = `<div class="cft-erro">${_cvEsc(d.error)}</div>`; return; }
        _cvDados = d;
        _cvRender(msg);
    }).catch(() => { el.innerHTML = `<div class="cft-erro">Erro ao carregar.</div>`; });
}

function _cvRender(msg) {
    const d = _cvDados || {};
    const el = document.getElementById("cv-principal");
    const busca = (document.getElementById("cv-busca") || {}).value || "";
    const soFaltando = (document.getElementById("cv-so-falta") || { checked: true }).checked;
    el.innerHTML = `
        <div class="cft-regras">
            <div class="cft-ajuda" style="margin-bottom:8px">Cada transportadora tem um login pra mesma pessoa (ex.: <b>fulano.s</b> na Shopee e <b>Fulano S</b> na Anjun).
                Aqui você diz quem é a <b>pessoa</b> (usuário principal) de cada login. O entregador dela vem da Conversão de nomes (Usuário → Entregador).
                A PNR conta pela pessoa: soma os logins dela de todas as transportadoras e, se passar do limite, caem as entregas de todos os logins dela no dia
                — as das outras pessoas do mesmo entregador não. Login sem usuário principal conta sozinho.
                Depois de vincular, use <b>Recalcular</b> em PNR abertas na quinzena.</div>
            <div class="cft-barra" style="margin:0;flex-wrap:wrap">
                <input class="cft-input" id="cv-busca" placeholder="Buscar entregador ou login..." value="${_cvEsc(busca)}" style="width:280px;flex:0 0 auto;margin:0" oninput="_cvRender()">
                <label class="cft-ajuda" style="display:flex;align-items:center;gap:6px;cursor:pointer">
                    <input type="checkbox" id="cv-so-falta"${soFaltando ? " checked" : ""} onchange="_cvRender()"> só entregador com login sem usuário principal</label>
                <span class="cft-ajuda">${d.sem_principal || 0} login(s) sem usuário principal</span>
                <span class="cft-ajuda" id="cv-status">${msg || ""}</span>
            </div>
        </div>
        ${(d.conflitos || []).length ? `<div class="cft-pend"><div class="cft-pend-titulo"><span class="cft-aviso">Usuário principal em mais de um entregador (${d.conflitos.length})</span></div>
            <div class="cft-ajuda" style="margin-bottom:6px">Os logins dessa pessoa estão em entregadores diferentes na Conversão de nomes — confira qual é o certo.</div>
            ${d.conflitos.map(c => `<div class="cft-ajuda"><b>${_cvEsc(c.principal)}</b>: ${_cvEsc(c.entregadores.join(" · "))} (logins: ${_cvEsc(c.usuarios.join(", "))})</div>`).join("")}
        </div>` : ""}
        <datalist id="cv-principais">${(d.principais || []).map(p => `<option value="${_cvEsc(p.principal)}">`).join("")}</datalist>
        <div id="cv-lista">${_cvLista(busca, soFaltando)}</div>`;
    const b = document.getElementById("cv-busca");
    if (b && busca) { b.focus(); b.setSelectionRange(busca.length, busca.length); }
}

function _cvLista(busca, soFaltando) {
    const d = _cvDados || {};
    const q = _cvNorm(busca);
    const lista = (d.entregadores || []).filter(e => (!soFaltando || e.sem_principal > 0)
        && (!q || _cvNorm(e.entregador).includes(q) || e.usuarios.some(u => _cvNorm(u.usuario).includes(q) || _cvNorm(u.principal).includes(q))));
    if (!lista.length) return `<div class="cft-ajuda">Nada por aqui${soFaltando ? " — todos os logins já têm usuário principal" : ""}.</div>`;
    return lista.slice(0, 80).map((e, i) => `<div class="cft-regras">
        <div class="cft-pend-titulo" style="color:#e2e8f0">${_cvEsc(e.entregador)}
            ${e.sem_principal ? `<span class="cft-aviso" style="font-weight:400">· ${e.sem_principal} sem usuário principal</span>` : ""}</div>
        <div class="cft-tabela-wrap"><table class="cft-tabela"><tbody>${e.usuarios.map(u => `<tr>
            <td style="width:1%"><input type="checkbox" class="cv-marca-${i}" value="${_cvEsc(u.usuario)}"></td>
            <td>${_cvEsc(u.usuario)}</td>
            <td class="cft-ajuda">${_cvEsc(u.transportadoras.join(", "))}</td>
            <td>${u.principal ? `${_cvEsc(u.principal)} <a href="#" class="cft-ajuda" style="text-decoration:underline;margin-left:6px"
                onclick="event.preventDefault();_cvRemover(${Number(u.id)})">desvincular</a>` : `<span class="cft-aviso">sem usuário principal</span>`}</td>
        </tr>`).join("")}</tbody></table></div>
        <div class="cft-barra" style="margin:8px 0 0;flex-wrap:wrap">
            <span class="cft-ajuda">Marcados →</span>
            <input class="cft-input" id="cv-nome-${i}" list="cv-principais" placeholder="Usuário principal (a pessoa)..." style="width:260px;flex:0 0 auto;margin:0">
            <button class="cft-btn primario" onclick="_cvVincular(${i})">Vincular</button>
        </div>
    </div>`).join("") + (lista.length > 80 ? `<div class="cft-ajuda">Mostrando 80 de ${lista.length} — busque pra achar os outros.</div>` : "");
}

async function _cvVincular(i) {
    const usuarios = [...document.querySelectorAll(".cv-marca-" + i)].filter(c => c.checked).map(c => c.value);
    const principal = (document.getElementById("cv-nome-" + i) || {}).value || "";
    if (!usuarios.length) { gcAlert("Marque o(s) login(s) dessa pessoa."); return; }
    try {
        const r = await fetch(`${_CV_API()}/principais`, { method: "POST", headers: _cvHeaders(true), body: JSON.stringify({ principal, usuarios }) });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { gcAlert(d.error || "Erro ao salvar."); return; }
        _cvCarregar(_cvEsc(`${usuarios.length} login(s) → ${d.principal}.`));
    } catch (_) { gcAlert("Erro ao salvar."); }
}

function _cvRemover(id) {
    fetch(`${_CV_API()}/principais/${id}`, { method: "DELETE", headers: _cvHeaders() })
    .then(r => r.json())
    .then(d => { if (d.error) gcAlert(d.error); else _cvCarregar("Desvinculado."); })
    .catch(() => gcAlert("Erro ao remover."));
}
