// ───── SHOPEE → RECEBER ─────
// Bipagem dos pedidos que chegam no hub. O XPT (CFC ou VIA) é escolhido antes e vale
// para toda a sessão, porque a pessoa recebe um lote inteiro no mesmo lugar — pedir o
// XPT a cada bipe seria um clique a mais por pacote, centenas por dia.
// Código Shopee: "BR" + 13 caracteres (ex.: BR266104829025G, BR2661048290259). Barrar
// aqui evita a ida ao servidor e o erro sai no mesmo instante do bipe — mas o servidor
// valida de novo, porque é ele quem decide o que entra no banco.
const SHR_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// O código volta pra tela dentro de innerHTML; se vier torto do leitor, pode trazer
// caractere que o navegador leria como marcação.
function _shrEsc(txt) {
    return String(txt || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Polos e o XPT de cada um. Joaçaba consta porque tem gente lotada lá, mas não recebe
// Shopee — daí xpt null, em vez de um código inventado que criaria uma contagem fantasma.
const SHR_POLOS = [
    { chave: "cacador", label: "Caçador", xpt: "XPT_CFC" },
    { chave: "videira", label: "Videira", xpt: "XPT_VIA" },
    { chave: "joacaba", label: "Joaçaba", xpt: null },
];
const _shrPolo = chave => SHR_POLOS.find(p => p.chave === chave) || null;

let _shrXpt      = null;    // XPT do polo da pessoa; null = sem polo ou polo sem Shopee
let _shrPoloAtual = null;   // { chave, label, xpt }
let _shrDados    = [];      // recebimentos de hoje do XPT da pessoa
let _shrFiltro   = "todos";

function abrirShopeeReceber(event) {
    if (event) event.preventDefault();
    _shrXpt = null;
    _shrPoloAtual = null;
    _shrFiltro = "todos";
    document.getElementById("shr-codigo").value = "";
    _shrMsg("", null);
    _shrPintarXpt();
    _shrPintarFiltroTabs();
    mostrarTela("tela-shopee-receber");

    // O XPT vem do polo do cadastro, não de um clique a cada uso: escolher toda vez era
    // justamente o que deixava passar bipe no lugar errado.
    fetch(`${API}/shopee/meu-xpt`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (!d || !d.polo) return _shrPerguntarPolo(); // cadastrado antes do polo existir
            _shrPoloAtual = _shrPolo(d.polo);
            _shrXpt = d.xpt || null;
            _shrPintarXpt();
            if (_shrXpt) _shrCarregarHoje();
        })
        .catch(() => {
            document.getElementById("shr-aviso-xpt").innerText = "Não foi possível carregar o seu polo. Recarregue a página.";
        });
}

// ── Escolha inicial, uma única vez ──
// Só aparece pra quem foi cadastrado antes do polo existir. Quem entra a partir de agora
// já vem com o polo do cadastro e nunca vê isto. O aviso de que fica salvo é o ponto: sem
// ele a pessoa clica em qualquer um pra passar da tela e o erro dura até alguém reparar.
function _shrPerguntarPolo() {
    document.getElementById("shr-aviso-xpt").innerText = "Escolha o seu polo para começar.";

    const overlay = document.createElement("div");
    overlay.id = "shr-escolha-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `
        <div style="${_gcCardStyle}">
            <div style="${_gcTitleStyle}">Qual é o seu polo?</div>
            <div style="${_gcMsgStyle}">Escolha a base em que você trabalha. Ela fica salva no seu cadastro e passa a valer em todos os recebimentos — se errar, só um administrador consegue trocar.</div>
            <div class="shr-escolha-opcoes">
                ${SHR_POLOS.map(p => `
                    <button type="button" class="shr-escolha-btn" data-polo="${p.chave}" data-xpt="${p.xpt || ""}">
                        <span class="shr-escolha-cidade">${p.label}</span>
                        <span class="shr-escolha-cod">${p.xpt || "não recebe Shopee"}</span>
                    </button>`).join("")}
            </div>
            <div id="shr-escolha-erro" style="display:none;font-size:12.5px;color:#ef4444;margin-bottom:12px"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".shr-escolha-btn").forEach(btn => {
        btn.addEventListener("click", () => _shrConfirmarPolo(btn.dataset.polo, overlay));
    });
}

function _shrConfirmarPolo(chave, overlay) {
    const polo = _shrPolo(chave);
    if (!polo) return;
    const detalhe = polo.xpt
        ? `Você vai receber os pacotes da Shopee em ${polo.label} (${polo.xpt}).`
        : `${polo.label} não recebe Shopee — você não vai bipar pacotes nesta tela.`;

    // Confirmação antes de gravar: é escolha de uma vez só, e um clique errado aqui custa
    // uma ida ao administrador.
    gcConfirm(
        `${detalhe}\n\nIsso fica salvo no seu cadastro. Depois, só um administrador pode alterar.`,
        () => {
            const erro = overlay.querySelector("#shr-escolha-erro");
            const botoes = overlay.querySelectorAll(".shr-escolha-btn");
            botoes.forEach(b => b.disabled = true);

            fetch(`${API}/shopee/meu-polo`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ polo: chave })
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                // 409 = já tinha polo (outra aba, ou o admin definiu). Segue com o que vale.
                if (!ok && !d.polo) {
                    botoes.forEach(b => b.disabled = false);
                    erro.style.display = "";
                    erro.innerText = d.error || "Não foi possível salvar. Tente de novo.";
                    return;
                }
                _shrPoloAtual = _shrPolo(d.polo || chave);
                _shrXpt = (_shrPoloAtual && _shrPoloAtual.xpt) || null;
                overlay.remove();
                _shrPintarXpt();
                if (_shrXpt) _shrCarregarHoje();
            })
            .catch(() => {
                botoes.forEach(b => b.disabled = false);
                erro.style.display = "";
                erro.innerText = "Erro de conexão. Tente de novo.";
            });
        },
        "Confirmar polo",
        "Sim, é esse"
    );
}

function _shrPintarXpt() {
    const faixa = document.getElementById("shr-faixa");
    const temPolo = !!_shrPoloAtual;
    faixa.style.display = temPolo ? "" : "none";
    faixa.className = "shr-faixa" + (!_shrXpt ? " sem" : _shrXpt === "XPT_VIA" ? " via" : " cfc");
    if (temPolo) {
        document.getElementById("shr-faixa-xpt").innerText =
            _shrXpt ? `${_shrPoloAtual.label} · ${_shrXpt}` : _shrPoloAtual.label;
        document.getElementById("shr-faixa-obs").innerText =
            _shrXpt ? "Para trocar, fale com um administrador" : "Este polo não recebe Shopee";
    }
    // Sem XPT não há onde registrar, então o campo de código nem aparece — é mais claro
    // que deixá-lo visível e recusar cada bipe depois.
    document.getElementById("shr-campo-codigo").style.display = _shrXpt ? "" : "none";
    document.getElementById("shr-dica-codigo").style.display  = _shrXpt ? "" : "none";

    const aviso = document.getElementById("shr-aviso-xpt");
    if (_shrXpt) { aviso.style.display = "none"; }
    else if (temPolo) {
        aviso.style.display = "";
        aviso.innerText = `O polo ${_shrPoloAtual.label} não recebe Shopee. Se isso estiver errado, fale com um administrador.`;
    }
    // Resumo e lista não fazem sentido sem XPT.
    document.getElementById("shr-resumo").style.display = _shrXpt ? "" : "none";
    document.getElementById("shr-bloco-lista").style.display = _shrXpt ? "" : "none";
    if (_shrXpt) document.getElementById("shr-codigo").focus();
}

// Pisca a borda do campo em verde ou vermelho. Quem bipa em rajada não lê a mensagem —
// a cor no canto do olho é o que diz se o pacote entrou.
let _shrFlashTimer = null;
function _shrFlash(tipo) {
    const wrap = document.getElementById("shr-campo-codigo");
    if (!wrap) return;
    clearTimeout(_shrFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth; // força reflow pra reiniciar a transição
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _shrFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

// ── Bipagem ──
function _shrCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _shrReceber(); }
}

function _shrScanCodigo() {
    if (!_shrXpt) return _shrMsg("Escolha o XPT antes de bipar.", "aviso");
    _bteAbrirScanner(texto => {
        document.getElementById("shr-codigo").value = texto;
        _shrReceber();
    });
}

function _shrReceber() {
    const campo  = document.getElementById("shr-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco na hora: o leitor dispara o próximo bipe antes da resposta
    // do servidor chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_shrXpt) { _gcBeepErro(); return _shrMsg("Escolha o XPT antes de bipar.", "aviso"); }
    if (!SHR_CODIGO_RE.test(codigo)) {
        _gcBeepErro(); _shrFlash("err");
        return _shrMsg(`<strong>${_shrEsc(codigo)}</strong> não é um código válido — precisa ser BR seguido de 13 caracteres.`, "erro");
    }

    // O XPT não vai no corpo: quem manda é o perfil, decidido no servidor.
    fetch(`${API}/shopee/receber`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _shrFlash("err");
            if (d.ja_recebido) {
                return _shrMsg(
                    `<strong>${_shrEsc(codigo)}</strong> já foi recebido hoje em <strong>${_shrEsc(d.xpt) || "—"}</strong>` +
                    `${d.usuario_nome ? " por " + _shrEsc(d.usuario_nome) : ""}${d.data_hora_brasilia ? " · " + _shrEsc(d.data_hora_brasilia) : ""}.`,
                    "aviso");
            }
            // Cadastro sem polo (admin limpou, ou a tela estava aberta desde antes):
            // pergunta de novo em vez de deixar a pessoa bipando contra um erro fixo.
            if (d.sem_polo) { _shrXpt = null; _shrPoloAtual = null; _shrPintarXpt(); _shrPerguntarPolo(); }
            // Polo mudou pra um que não recebe: tira o campo do caminho.
            if (d.polo_sem_xpt) { _shrXpt = null; _shrPintarXpt(); }
            return _shrMsg(_shrEsc(d.error) || "Erro ao registrar.", "erro");
        }
        _gcBeepSucesso(); _shrFlash("ok");
        _shrMsg(`✓ <strong>${_shrEsc(d.codigo)}</strong> recebido em <strong>${_shrEsc(d.xpt)}</strong>.`, "ok");
        // Insere na lista local em vez de recarregar: a cada bipe uma ida ao servidor
        // deixaria a bipagem em rajada lenta e acordaria o banco à toa.
        _shrDados.unshift({
            id: d.id, codigo: d.codigo, xpt: d.xpt, meu: true,
            usuario_nome: (window._gcUser && window._gcUser.displayName) || "—",
            data_hora_brasilia: d.data_hora_brasilia,
        });
        _shrRenderizar();
    })
    .catch(() => { _gcBeepErro(); _shrMsg("Erro ao conectar com o servidor.", "erro"); });
}

function _shrMsg(msg, tipo) {
    const el = document.getElementById("shr-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// ── Registro do dia ──
function _shrCarregarHoje() {
    const empty  = document.getElementById("shr-empty");
    const result = document.getElementById("shr-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    document.getElementById("shr-resumo").innerHTML = "";

    fetch(`${API}/shopee/recebimentos-hoje`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(rows => {
            _shrDados = Array.isArray(rows) ? rows : [];
            empty.style.display = "none";
            result.style.display = "";
            _shrRenderizar();
        })
        .catch(() => { skFim(empty, "Erro ao conectar com o servidor."); });
}

function _shrTrocarFiltro(filtro) {
    _shrFiltro = filtro;
    _shrPintarFiltroTabs();
    _shrRenderizar();
}

function _shrPintarFiltroTabs() {
    document.querySelectorAll("#shr-filtro-tabs .filtro-tab").forEach(b =>
        b.classList.toggle("active", b.dataset.filtro === _shrFiltro));
}

// Quem bipou vem marcado pelo servidor — ele é quem sabe o id de quem pediu.
function _shrEhMeu(r) {
    return r.meu === true;
}

// Só admin e dev removem: é correção de erro, não parte da operação. Quem bipa avisa.
function _shrPodeRemover() {
    return ["admin", "dev"].includes(window._gcUser && window._gcUser.role);
}

function _shrRenderizar() {
    // A lista já vem só do XPT da pessoa — o servidor filtra, então aqui não há o que
    // separar. O total é o do XPT dela, e o percentual é a fatia que ela bipou.
    const meus = _shrDados.filter(_shrEhMeu).length;
    const pct  = _shrDados.length ? Math.round((meus / _shrDados.length) * 100) : null;
    const cidade = (_shrPoloAtual && _shrPoloAtual.label) || "";

    const card = (rotulo, valor, sub) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value">${valor}</div>
        </div>`;
    document.getElementById("shr-resumo").innerHTML =
        card("Recebidos hoje", _shrDados.length, cidade) +
        card("Você recebeu", `${meus}${pct !== null ? ` <span class="shr-pct">${pct}%</span>` : ""}`, "do total de hoje");

    document.getElementById("shr-lista-titulo").innerText =
        _shrXpt ? `Recebidos hoje · ${cidade}` : "Recebidos hoje";

    const rows = _shrFiltro === "meus" ? _shrDados.filter(_shrEhMeu) : _shrDados;
    const podeRemover = _shrPodeRemover();
    const colunas = podeRemover ? 5 : 4;
    document.getElementById("shr-th-acao").style.display = podeRemover ? "" : "none";

    document.getElementById("shr-tbody").innerHTML = rows.length ? rows.map(r => `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_shrEsc(r.codigo)}</td>
            <td data-label="XPT"><span class="shr-xpt-tag ${r.xpt === "XPT_CFC" ? "cfc" : "via"}">${_shrEsc(r.xpt)}</span></td>
            <td data-label="Recebido por">${_shrEsc(r.usuario_nome) || "—"}</td>
            <td data-label="Data / hora" style="color:#94a3b8">${_shrEsc(r.data_hora_brasilia) || "—"}</td>
            ${podeRemover ? `<td data-label="" style="text-align:right">
                <button class="shr-del-btn" onclick="_shrRemover(${r.id},'${_shrEsc(r.codigo)}')" title="Remover este recebimento">Remover</button>
            </td>` : ""}
        </tr>`).join("")
        : `<tr><td colspan="${colunas}" style="text-align:center;color:#64748b;padding:26px 10px">Nenhum recebimento nesse filtro.</td></tr>`;
}

// Remoção de bipe errado. Sem isso, o único conserto era mexer no banco na mão.
function _shrRemover(id, codigo) {
    gcConfirm(
        `Remover ${codigo} do recebimento de hoje?\n\nEle sai da contagem e pode ser bipado de novo.`,
        () => {
            fetch(`${API}/shopee/recebimento/${id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível remover.");
                _shrDados = _shrDados.filter(r => r.id !== id);
                _shrRenderizar();
                _shrMsg(`<strong>${_shrEsc(codigo)}</strong> removido do recebimento de hoje.`, "aviso");
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Remover recebimento",
        "Remover"
    );
}
