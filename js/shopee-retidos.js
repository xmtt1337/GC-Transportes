// ───── SHOPEE → PACOTES RETIDOS ─────
// Pacote retido é pacote que não sai para entrega. Hoje só "Item avariado"; o servidor já
// aceita "interceptado", que entra como outra tela usando estas mesmas funções.
//
// O registro aqui não é só um histórico: bipar tira o pacote de TODA conferência — a de
// cluster da operação e a do entregador. Sem isso um avariado que ficou no galpão continuaria
// sendo cobrado, e o cluster fecharia o dia em "falta 1" para sempre.

// Mesma regra do recebimento: "BR" + 13 caracteres. Barrar aqui dá o erro no mesmo instante
// do bipe, mas o servidor valida de novo — é ele quem decide o que entra no banco.
const SAV_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// O tipo de retenção desta tela. Trocar esta constante é o que separa "Item avariado" de
// "Interceptado" quando a segunda tela existir.
const SAV_TIPO = "avariado";

let _savXpt       = null;   // XPT do polo de quem está bipando; null = sem polo ou polo sem Shopee
let _savPoloLabel = "";
let _savDados     = [];     // linhas do histórico, mais recentes primeiro
let _savDias      = [];     // [{ dia, total }] vindo do servidor — total real, mesmo com teto

function abrirShopeeAvariado(event) {
    if (event) event.preventDefault();
    _savXpt = null;
    _savPoloLabel = "";
    _savDados = [];
    _savDias  = [];
    document.getElementById("sav-codigo").value = "";
    document.getElementById("sav-busca").value = "";
    _savMsg("", null);
    _savPintarXpt();
    mostrarTela("tela-shopee-avariado");

    // O XPT vem do polo do cadastro, igual ao Recebimento — não se escolhe a cada uso.
    fetch(`${API}/shopee/meu-xpt`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            _savPoloLabel = (d && d.polo_label) || "";
            _savXpt = (d && d.xpt) || null;
            _savPintarXpt(!d || !d.polo);
            if (_savXpt) _savCarregarHistorico();
        })
        .catch(() => {
            document.getElementById("sav-aviso-xpt").innerText =
                "Não foi possível carregar o seu polo. Recarregue a página.";
        });
}

function _savEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// Quem não tem polo escolhe no Recebimento, que é onde o seletor mora. Duplicar aquele
// fluxo aqui daria dois lugares gravando a mesma decisão de uma vez só.
function _savPintarXpt(semPolo) {
    const faixa = document.getElementById("sav-faixa");
    const temPolo = !!_savPoloLabel;
    faixa.style.display = temPolo ? "" : "none";
    faixa.className = "shr-faixa" + (!_savXpt ? " sem" : _savXpt === "XPT_VIA" ? " via" : " cfc");
    if (temPolo) {
        document.getElementById("sav-faixa-xpt").innerText =
            _savXpt ? `${_savPoloLabel} · ${_savXpt}` : _savPoloLabel;
        document.getElementById("sav-faixa-obs").innerText =
            _savXpt ? "Para trocar, fale com um administrador" : "Este polo não recebe Shopee";
    }

    document.getElementById("sav-campo-codigo").style.display = _savXpt ? "" : "none";
    document.getElementById("sav-dica-codigo").style.display  = _savXpt ? "" : "none";

    const aviso = document.getElementById("sav-aviso-xpt");
    if (_savXpt) {
        aviso.style.display = "none";
    } else {
        aviso.style.display = "";
        aviso.innerText = semPolo
            ? "Você ainda não tem polo definido. Abra o Recebimento Shopee para escolher."
            : temPolo
                ? `O polo ${_savPoloLabel} não recebe Shopee. Se isso estiver errado, fale com um administrador.`
                : "Carregando o seu XPT...";
    }

    document.getElementById("sav-resumo").style.display = _savXpt ? "" : "none";
    document.getElementById("sav-bloco-lista").style.display = _savXpt ? "" : "none";
    if (_savXpt) document.getElementById("sav-codigo").focus();
}

// Pisca a borda do campo. Quem bipa em rajada não lê a mensagem — a cor no canto do olho
// é o que diz se o pacote entrou.
let _savFlashTimer = null;
function _savFlash(tipo) {
    const wrap = document.getElementById("sav-campo-codigo");
    if (!wrap) return;
    clearTimeout(_savFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth; // força reflow pra reiniciar a transição
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _savFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

function _savMsg(msg, tipo) {
    const el = document.getElementById("sav-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { erro: "#ef4444", ok: "#22c55e", aviso: "#eab308" };
    const cor = cores[tipo] || cores.ok;
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px`;
    el.innerHTML = msg;
}

// ── Bipagem ──
function _savCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _savBipar(); }
}

function _savScanCodigo() {
    if (!_savXpt) return _savMsg("Você precisa de um polo com Shopee para bipar.", "aviso");
    _bteAbrirScanner(texto => {
        document.getElementById("sav-codigo").value = texto;
        _savBipar();
    });
}

function _savBipar() {
    const campo  = document.getElementById("sav-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco na hora: o leitor dispara o próximo bipe antes da resposta
    // do servidor chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_savXpt) { _gcBeepErro(); return _savMsg("Você precisa de um polo com Shopee para bipar.", "aviso"); }
    if (!SAV_CODIGO_RE.test(codigo)) {
        _gcBeepErro(); _savFlash("err");
        return _savMsg(`<strong>${_savEsc(codigo)}</strong> não é um código válido — precisa ser BR seguido de 13 caracteres.`, "erro");
    }

    // O XPT não vai no corpo: quem manda é o perfil, decidido no servidor.
    fetch(`${API}/shopee/retidos`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipo: SAV_TIPO })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _savFlash("err");
            // Já retido é aviso, não erro: o pacote está do jeito que precisa estar, alguém
            // só bipou duas vezes. Dizer quem e quando resolve a dúvida na hora.
            if (d.ja_retido) {
                return _savMsg(
                    `<strong>${_savEsc(codigo)}</strong> já está retido como <strong>${_savEsc(d.tipo_label) || "retido"}</strong>` +
                    `${d.usuario_nome ? " por " + _savEsc(d.usuario_nome) : ""}${d.data_hora_brasilia ? " · " + _savEsc(d.data_hora_brasilia) : ""}.`,
                    "aviso");
            }
            if (d.sem_polo || d.polo_sem_xpt) { _savXpt = null; _savPintarXpt(!!d.sem_polo); }
            return _savMsg(_savEsc(d.error) || "Erro ao registrar.", "erro");
        }
        _gcBeepSucesso(); _savFlash("ok");
        _savMsg(`✓ <strong>${_savEsc(d.codigo)}</strong> retido como avariado — saiu de todas as conferências.`, "ok");
        // Entra na lista local em vez de recarregar: a cada bipe uma ida ao servidor
        // deixaria a bipagem em rajada lenta e acordaria o banco à toa.
        _savDados.unshift({
            id: d.id, codigo: d.codigo, tipo: d.tipo, xpt: d.xpt, dia: d.dia,
            usuario_nome: (window._gcUser && window._gcUser.displayName) || "—",
            data_hora_brasilia: d.data_hora_brasilia,
        });
        _savSomarNoDia(d.dia, 1);
        _savRenderizar();
    })
    .catch(() => { _gcBeepErro(); _savMsg("Erro ao conectar com o servidor.", "erro"); });
}

// Mantém o total do dia em dia sem recarregar tudo. O contador do cabeçalho vem do servidor
// justamente pra continuar certo quando o histórico é cortado pelo teto — recontar as linhas
// da tela devolveria um número menor.
function _savSomarNoDia(dia, quanto) {
    if (!dia) return;
    const alvo = _savDias.find(d => d.dia === dia);
    if (alvo) alvo.total += quanto;
    else _savDias.unshift({ dia, total: quanto });
}

// ── Histórico ──
function _savCarregarHistorico() {
    const empty  = document.getElementById("sav-empty");
    const result = document.getElementById("sav-resultado");
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";
    document.getElementById("sav-resumo").innerHTML = "";

    fetch(`${API}/shopee/retidos?tipo=${encodeURIComponent(SAV_TIPO)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
        .then(r => r.json())
        .then(d => {
            if (d && d.error) { skFim(empty, d.error); return; }
            _savDados = (d && d.linhas) || [];
            _savDias  = (d && d.dias)  || [];
            empty.style.display = "none";
            result.style.display = "";
            _savRenderizar();
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _savBuscar() { _savRenderizar(); }

// Só dev remove: soltar um pacote de volta pra conferência é correção de erro, não parte
// da operação. Quem bipou errado avisa.
function _savPodeRemover() {
    return (window._gcUser && window._gcUser.role) === "dev";
}

// "Hoje" e "Ontem" por extenso: são os dois dias que se procura de fato aqui, e achá-los
// pela data exige comparar com o calendário de cabeça.
function _savDiaTexto(dia, hoje) {
    if (!dia || dia === "—") return "Sem data";
    const br = dia.split("-").reverse().join("/");
    if (dia === hoje) return `Hoje · ${br}`;
    const ontem = new Date(hoje + "T12:00:00");
    ontem.setDate(ontem.getDate() - 1);
    if (dia === ontem.toISOString().slice(0, 10)) return `Ontem · ${br}`;
    return br;
}

function _savRenderizar() {
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    const totalGeral = _savDias.reduce((s, d) => s + d.total, 0);
    const doDia = (_savDias.find(d => d.dia === hoje) || {}).total || 0;

    const card = (rotulo, valor, sub, cor) => `
        <div class="paj-card">
            <div class="paj-label">${rotulo}</div>
            ${sub ? `<div class="paj-sublabel">${sub}</div>` : ""}
            <div class="paj-value"${cor ? ` style="color:${cor}"` : ""}>${valor}</div>
        </div>`;
    document.getElementById("sav-resumo").innerHTML =
        card("Avariados hoje", doDia.toLocaleString("pt-BR"), _savPoloLabel, doDia ? "#eab308" : null) +
        card("Retidos no total", totalGeral.toLocaleString("pt-BR"), "fora de todas as conferências");

    // A busca pega código e quem bipou, que é o que se procura quando alguém pergunta
    // "esse pacote foi dado como avariado?".
    const termo = (document.getElementById("sav-busca")?.value || "").trim().toLowerCase();
    const rows = termo
        ? _savDados.filter(r =>
            String(r.codigo || "").toLowerCase().includes(termo) ||
            String(r.usuario_nome || "").toLowerCase().includes(termo))
        : _savDados;

    const podeRemover = _savPodeRemover();
    const colunas = podeRemover ? 4 : 3;
    document.getElementById("sav-th-acao").style.display = podeRemover ? "" : "none";

    const tbody = document.getElementById("sav-tbody");
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${colunas}" style="text-align:center;color:#8494a9;padding:26px 10px">${
            termo ? "Nenhum código encontrado." : "Nenhum item avariado registrado ainda."}</td></tr>`;
        return;
    }

    // Agrupado por dia, com o total do dia no cabeçalho — mesmo desenho do histórico do
    // Romaneiro. Numa lista corrida não dá pra ver quanto de hoje já foi separado, que é a
    // pergunta que se faz olhando esta tela.
    const porDia = new Map();
    for (const r of rows) {
        const dia = r.dia || "—";
        if (!porDia.has(dia)) porDia.set(dia, []);
        porDia.get(dia).push(r);
    }
    const totaisDia = Object.fromEntries(_savDias.map(d => [d.dia, d.total]));

    tbody.innerHTML = [...porDia.entries()].map(([dia, lista]) => {
        // Com busca ativa o total do servidor não corresponde ao que está na tela; nesse
        // caso conta o que sobrou do filtro, senão o cabeçalho mentiria.
        const n = termo ? lista.length : (totaisDia[dia] ?? lista.length);
        return `
        <tr class="shl-dia-linha">
            <td colspan="${colunas}" style="background:rgba(234,179,8,0.07);border-top:1px solid rgba(234,179,8,0.18);padding:9px 12px">
                <span style="font-weight:700;color:#fcd34d;font-size:13px">${_savDiaTexto(dia, hoje)}</span>
                <span style="color:#8494a9;font-size:12.5px;margin-left:8px">
                    ${n.toLocaleString("pt-BR")} item${n !== 1 ? "s" : ""} avariado${n !== 1 ? "s" : ""}
                </span>
            </td>
        </tr>` + lista.map(r => `
        <tr>
            <td data-label="Código" style="font-family:monospace;font-weight:700;color:#e2e8f0">${_savEsc(r.codigo)}</td>
            <td data-label="Bipado por">${_savEsc(r.usuario_nome) || "—"}</td>
            <td data-label="Data / hora" style="color:#94a3b8">${_savEsc(r.data_hora_brasilia) || "—"}</td>
            ${podeRemover ? `<td data-label="" style="text-align:right">
                <button class="shr-del-btn" onclick="_savRemover(${r.id},'${_savEsc(r.codigo)}')" title="Tirar da retenção">Remover</button>
            </td>` : ""}
        </tr>`).join("");
    }).join("");
}

function _savRemover(id, codigo) {
    gcConfirm(
        `Tirar ${codigo} da retenção?\n\nEle volta a contar nas conferências e pode ser bipado como avariado de novo.`,
        () => {
            fetch(`${API}/shopee/retidos/${id}`, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + token }
            }).then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) return gcAlert(d.error || "Não foi possível remover.");
                const alvo = _savDados.find(r => r.id === id);
                _savSomarNoDia(alvo && alvo.dia, -1);
                _savDados = _savDados.filter(r => r.id !== id);
                _savRenderizar();
            })
            .catch(() => gcAlert("Erro ao conectar com o servidor."));
        },
        "Tirar da retenção",
        "Sim, tirar"
    );
}
