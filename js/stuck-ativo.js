// ───── STUCK / BACKLOG → ENVIAR ATIVO ─────
//
// O mesmo disparo de Ativos > Disparar (POST /admin/whatsapp/enviar) com o modelo
// da Shopee que já mora em whatsapp-teste.js (WA_REC_TEMPLATES.shopee: template
// aprovado na Meta, campos, texto e ordem dos parâmetros) — nada disso é copiado
// pra cá, senão o texto daqui divergiria do aprovado na primeira troca. O que
// muda: o código do pedido já vem da linha, então a pessoa completa só o resto.
//
// Sem prazo: prazo dado pela transportadora é coisa de extravio (acareação), e o
// Stuck e o Backlog são contato com o cliente, sem vencimento correndo.
//
// Só aparece pra quem enxerga os Ativos (sac, dev, admin): o servidor recusa os
// demais, e um botão que só leva a "Acesso negado" é pior que não ter botão.
//
// Serve as duas telas (shopee-stuck.js e shopee-stuck-backlog.js): cada uma monta a
// célula com _sstAtivoCelulaHtml e diz qual função redesenha a tela dela.

let _sstAtivoCodigo = "";
let _sstAtivoEnviando = false;
let _sstAtivoRedesenhar = null;   // redesenha a tela de onde o card foi aberto

// Andamento do ativo por pedido, pela chave em maiúsculas. Três casos que NÃO podem
// se confundir, porque "consultei e não tem" e "não consegui consultar" mostram coisas
// diferentes na célula:
//   ausente          ainda não consultei (ou a consulta falhou) — a célula não afirma nada
//   null             consultei e não há ativo enviado
//   { estado, ... }  há ativo enviado
const _sstAtivoEstados = {};

// A cor é só um pontinho (mesmo padrão do "Resposta do cliente" do Backlog,
// classes .sstb-resp/.sstb-resp-vazio) — o texto continua na cor normal, e o
// que diferencia mesmo é a palavra. Cores compartilhadas com o Backlog de
// propósito: é o mesmo fato mostrado em duas telas, não pode ter cor diferente
// dependendo de onde a pessoa olha.
const _SST_ATIVO_INFO = {
    aguardando:  { rotulo: "Aguardando resposta", cor: "#eab308",
        dica: "Enviado — o cliente ainda não respondeu." },
    respondeu:   { rotulo: "Cliente respondeu",   cor: "#3a86ff",
        dica: "O cliente escreveu depois do envio e ninguém marcou como recebido ou não recebido. Veja em Ativos > Conversas." },
    recebeu:     { rotulo: "Recebido",            cor: "#22c55e",
        dica: "O cliente confirmou (ou alguém marcou) que recebeu o pedido." },
    nao_recebeu: { rotulo: "Não recebido",        cor: "#ef4444",
        dica: "O cliente disse (ou alguém marcou) que NÃO recebeu o pedido." },
};

const _SST_ATIVO_LOTE = 2000;

function _sstAtivoEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

const _sstAtivoChave = codigo => String(codigo || "").trim().toUpperCase();

function _sstPodeAtivo() {
    const role = window._gcUser && window._gcUser.role;
    return typeof WA_ROLES_ATIVOS !== "undefined" && WA_ROLES_ATIVOS.includes(role);
}

function _sstAtivoCfg() {
    return typeof WA_REC_TEMPLATES !== "undefined" ? WA_REC_TEMPLATES.shopee : null;
}

/** undefined = não consultado; null = sem ativo; objeto = andamento. */
function _sstAtivoEstadoDe(codigo) {
    return _sstAtivoEstados[_sstAtivoChave(codigo)];
}

// "25/09 14:03", em horário de Brasília — o instante chega em ISO, e o fuso de quem olha
// a tela pode ser outro.
function _sstAtivoQuando(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = Object.fromEntries(new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map(x => [x.type, x.value]));
    return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

// Consulta o andamento de um conjunto de pedidos e guarda em _sstAtivoEstados. Nunca
// rejeita: se falhar, os pedidos ficam "não consultados" e a célula só não afirma nada.
// Em lotes porque o Backlog pode ter milhares e o servidor limita cada consulta.
function _sstAtivoCarregarEstados(codigos) {
    if (!_sstPodeAtivo()) return Promise.resolve();
    const unicos = [...new Set((codigos || []).map(_sstAtivoChave).filter(Boolean))];
    const lotes = [];
    for (let i = 0; i < unicos.length; i += _SST_ATIVO_LOTE) lotes.push(unicos.slice(i, i + _SST_ATIVO_LOTE));

    return Promise.all(lotes.map(lote =>
        fetch(`${API}/admin/whatsapp/ativos-status`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ pedidos: lote })
        })
        .then(r => r.json().then(b => ({ ok: r.ok, b })))
        .then(({ ok, b }) => {
            // Resposta sem `estados` (erro, polo pendente) não pode virar "ninguém tem ativo".
            if (!ok || !b || typeof b.estados !== "object" || b.estados === null) return;
            lote.forEach(c => { _sstAtivoEstados[c] = b.estados[c] || null; });
        })
        .catch(() => {})
    )).then(() => {});
}

// A célula "Ativo" de uma linha: andamento (se houver) e o botão. `redesenhar` é o
// NOME da função global que redesenha a tela, pra o card poder atualizar a linha
// depois de enviar.
function _sstAtivoBotaoHtml(codigo, redesenhar) {
    const rotulo = _sstAtivoEstadoDe(codigo) ? "Reenviar" : "Enviar ativo";
    return `<button type="button" class="sst-ativo-btn" onclick="_sstAbrirAtivo(this${redesenhar ? ", " + redesenhar : ""})">${rotulo}</button>`;
}

// Célula COMPLETA (andamento + botão) — pro Stuck, que não mostra o andamento em
// nenhum outro lugar da linha. O Backlog já tem a coluna "Resposta do cliente"
// (SSTB_RESPOSTAS) pro mesmo fato, então lá o botão vai sozinho
// (_sstAtivoBotaoHtml) — repetir o andamento duas vezes na mesma linha, com
// vocabulário diferente em cada uma, confundiria mais do que ajudaria.
function _sstAtivoCelulaHtml(codigo, redesenhar) {
    const est = _sstAtivoEstadoDe(codigo);
    let info = "";
    if (est === null) {
        info = `<span class="sstb-resp sstb-resp-vazio" title="Ninguém mandou Ativo pra esse cliente ainda">Não enviado</span>`;
    } else if (est) {
        const def = _SST_ATIVO_INFO[est.estado] || { rotulo: est.estado, cor: "#8494a9", dica: "" };
        info = `<span class="sstb-resp" title="${_sstAtivoEsc(def.dica)}"><i style="background:${def.cor}"></i>${_sstAtivoEsc(def.rotulo)}</span>
                <span class="sst-ativo-quando">enviado ${_sstAtivoEsc(_sstAtivoQuando(est.enviado_em))}</span>`;
    }
    return `<td data-label="Ativo">
        <div class="sst-ativo-celula">
            ${info ? `<div class="sst-ativo-info">${info}</div>` : ""}
            ${_sstAtivoBotaoHtml(codigo, redesenhar)}
        </div>
    </td>`;
}

// Semeia o cache de andamento a partir do que o Backlog já trouxe (resposta.js, no
// backend) — sem bater na rede de novo: o Backlog já sabe a resposta de cada pedido
// no MESMO retrato que carregou. "sem_resposta" (o vocabulário do Backlog não
// distingue "nunca respondeu" de "respondeu mas ninguém decidiu") vira "aguardando":
// é o que dá pra afirmar sem inventar um "respondeu" que o dado não confirma.
function _sstAtivoSemearDoBacklog(registros) {
    (registros || []).forEach(r => {
        const chave = _sstAtivoChave(r.shipment_id);
        if (!chave) return;
        if (!r.resposta || r.resposta === "sem_ativo") { _sstAtivoEstados[chave] = null; return; }
        const estado = r.resposta === "sem_resposta" ? "aguardando" : r.resposta;
        _sstAtivoEstados[chave] = { estado, enviado_em: r.ativo_em || null };
    });
}

function _sstAtivoMsg(texto, cor) {
    const el = document.getElementById("sst-ativo-msg");
    el.style.color = cor || "";
    el.innerText = texto;
}

function _sstAtivoValores(cfg) {
    const v = {};
    cfg.campos.forEach(c => {
        const el = document.getElementById(`sst-ativo-campo-${c.id}`);
        v[c.id] = el ? el.value.trim() : "";
    });
    return v;
}

function _sstAtivoPreview() {
    const cfg = _sstAtivoCfg();
    if (!cfg) return;
    document.getElementById("sst-ativo-preview").innerText = cfg.montar(_sstAtivoValores(cfg));
}

// O código vem da PRÓPRIA linha (data-codigo), não de um argumento no onclick:
// código dentro de string de atributo é o jeito de quebrar a linha inteira no dia
// em que aparecer um com aspas.
function _sstAbrirAtivo(btn, redesenhar) {
    const codigo = btn.closest("tr")?.dataset.codigo;
    const cfg = _sstAtivoCfg();
    if (!codigo || !cfg) return gcAlert("Não foi possível abrir o envio de ativo.");

    _sstAtivoCodigo = codigo;
    _sstAtivoEnviando = false;
    _sstAtivoRedesenhar = typeof redesenhar === "function" ? redesenhar : null;

    document.getElementById("sst-ativo-codigo").innerText = codigo;
    document.getElementById("sst-ativo-numero").value = "";

    document.getElementById("sst-ativo-campos").innerHTML = cfg.campos.map(c => {
        const ehPedido = c.id === cfg.campoPedido;
        return `
        <div class="usr-modal-field">
            <label class="usr-modal-label">${_sstAtivoEsc(c.label)}</label>
            <input type="text" id="sst-ativo-campo-${c.id}" class="usr-modal-input" autocomplete="off"
                   oninput="_sstAtivoPreview()"${ehPedido ? ` value="${_sstAtivoEsc(codigo)}" readonly style="opacity:.7"` : ""}>
        </div>`;
    }).join("");

    // Reenviar manda OUTRA mensagem pro WhatsApp do cliente, e pode ter sido outra pessoa
    // do time que já mandou — o aviso deixa a pessoa decidir com o que já aconteceu na frente.
    const est = _sstAtivoEstadoDe(codigo);
    const aviso = document.getElementById("sst-ativo-aviso");
    if (est) {
        const rotulo = (_SST_ATIVO_INFO[est.estado] || {}).rotulo || est.estado;
        aviso.innerText = `Já existe um ativo enviado para este pedido (${rotulo.toLowerCase()}, ` +
            `enviado ${_sstAtivoQuando(est.enviado_em)}). Enviar de novo manda outra mensagem ao cliente.`;
        aviso.style.display = "";
    } else {
        aviso.innerText = "";
        aviso.style.display = "none";
    }

    _sstAtivoMsg("", "");
    const enviar = document.getElementById("sst-ativo-btn-enviar");
    enviar.disabled = false;
    enviar.textContent = "Enviar mensagem";
    _sstAtivoPreview();
    _abrirModal("modal-sst-ativo");
}

function _sstEnviarAtivo() {
    if (_sstAtivoEnviando) return;
    const cfg = _sstAtivoCfg();
    if (!cfg) return;

    const envio = _waRecMontarEnvio({
        cfg, valores: _sstAtivoValores(cfg),
        numero: document.getElementById("sst-ativo-numero").value,
        role: window._gcUser && window._gcUser.role,
        comPrazo: false,
    });
    if (envio.erro) return _sstAtivoMsg(envio.erro, "#ef4444");

    // Trava já no clique: a mensagem vai pro WhatsApp do cliente e não tem volta, então
    // um duplo clique não pode virar duas mensagens iguais.
    _sstAtivoEnviando = true;
    const codigoEnviado = _sstAtivoCodigo;
    const redesenhar = _sstAtivoRedesenhar;
    const botao = document.getElementById("sst-ativo-btn-enviar");
    botao.disabled = true;
    botao.textContent = "Enviando...";
    _sstAtivoMsg("Enviando...", "#8494a9");

    fetch(`${API}/admin/whatsapp/enviar`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(envio.corpo)
    })
    .then(r => r.json().then(body => ({ ok: r.ok, body })))
    .then(({ ok, body }) => {
        if (!ok) {
            _sstAtivoEnviando = false;
            botao.disabled = false;
            botao.textContent = "Enviar mensagem";
            if (body.detalhe) console.error("[whatsapp] recusa da Meta:", body.detalhe);
            _sstAtivoMsg(body.error || "Erro ao enviar.", "#ef4444");
            if (body.polo_pendente) { gcPoloInvalidar(); gcPoloGarantir(); }
            return;
        }
        // Continua travado depois de enviar: reabrir o mesmo pedido zera a trava.
        botao.textContent = "Enviado";
        _sstAtivoMsg("Enviado!", "#22c55e");
        // O servidor já gravou o envio antes de responder: relê o andamento deste pedido
        // pra linha mostrar "Aguardando resposta" em vez de continuar como "Não enviado".
        _sstAtivoCarregarEstados([codigoEnviado]).then(() => { if (redesenhar) redesenhar(); });
        // Só fecha se ainda for o mesmo pedido — a pessoa pode ter aberto outro nesse meio-tempo.
        setTimeout(() => { if (_sstAtivoCodigo === codigoEnviado) _fecharModal("modal-sst-ativo"); }, 1200);
    })
    .catch(() => {
        _sstAtivoEnviando = false;
        botao.disabled = false;
        botao.textContent = "Enviar mensagem";
        _sstAtivoMsg("Erro ao conectar com o servidor.", "#ef4444");
    });
}
