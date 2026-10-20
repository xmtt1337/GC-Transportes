// ───── ATRIBUIÇÕES → SOLICITAR AT ─────
// O entregador bipa, na rua, o pacote que chegou na mão dele sem ter passado pelo
// recebimento nem pela atribuição no SPX. O código entra na MESMA fila da operação, e
// quem cola no SPX é o colador que já roda lá — um pro Recebimento, outro pra AT.
// Por isso a tela não confirma "pronto": ela mostra o ANDAMENTO de cada pedido, que
// só avança quando o colador passa por ele.
//
// O XPT sai do POLO do cadastro do entregador: na primeira vez a tela pergunta o polo
// (fica salvo), e a cada pedido confirma "Solicitar AT no XPT …?" — trocar o polo depois
// é pedido ao suporte. O colador de cada máquina só cola o XPT logado no SPX dela.

const SOLAT_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// Interruptor de emergência (custo de compute no Neon, como em 05/09/2026). Desligar
// aqui E `ativo: false` em server.js; o menu é destravado em core.js.
const SOLAT_DESATIVADO = false;

function _solatMostrarDesativado() {
    document.getElementById("solat-faixa").style.display = "none";
    document.getElementById("solat-campo-codigo").style.display = "none";
    const aviso = document.getElementById("solat-aviso");
    aviso.style.display = "";
    aviso.innerText = "Solicitar AT está temporariamente desativado. Fale com a operação.";
    document.getElementById("solat-msg").style.display = "none";
    document.getElementById("solat-empty").innerText = "";
    document.getElementById("solat-resultado").style.display = "none";
}

// Dois estados, não três: pra quem está na rua, "recebido no SPX mas ainda sem AT"
// e "nem recebido" são a mesma espera. O que muda a vida dele é ter a AT ou não.
const SOLAT_STATUS = {
    criando: { rotulo: "Criando", cor: "#eab308" },
    criada:  { rotulo: "Criada",  cor: "#22c55e" },
    // O SPX recusou o código na AT nova: o motivo aparece embaixo, e bipar de novo tenta outra vez.
    erro:    { rotulo: "Não criada", cor: "#f87171" },
};

let _solatXpt = null;      // XPT do polo do cadastro; null = ainda sem polo
let _solatPolo = null;     // { polo, polo_label, xpt }
let _solatItens = [];
let _solatEstimativa = 45; // segundos; vem medido do servidor
let _solatTimerBusca = null;
let _solatTimerBarra = null;

// De quanto em quanto tempo perguntar o andamento ao servidor.
//
// Só roda enquanto houver pedido em "criando" — e para sozinho quando o último
// fica pronto. Cada ida dessas é uma consulta ao banco, e banco acordado à toa
// é o que a gente está justamente tentando não fazer.
const SOLAT_INTERVALO_BUSCA = 3000;

// A barra anda sozinha, sem falar com o servidor: é só relógio local. Por isso
// pode ser suave sem custar nada.
const SOLAT_INTERVALO_BARRA = 250;

// A barra não passa disso enquanto a AT não chegou. Chegar a 100% e ficar
// parada seria a tela dizendo que acabou quando não acabou.
const SOLAT_TETO_BARRA = 92;

function _solatEsc(txt) {
    return String(txt || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function abrirSolicitarAT(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-solicitar-at");
    if (SOLAT_DESATIVADO) return _solatMostrarDesativado();

    _solatXpt = null;
    _solatItens = [];
    _solatDesenhado = null;
    document.getElementById("solat-codigo").value = "";
    _solatMsg("", null);
    document.getElementById("solat-empty").innerText = "Carregando...";
    document.getElementById("solat-resultado").style.display = "none";
    _solatGarantirPolo(() => _solatCarregarHoje());
}

// ── Polo ──────────────────────────────────────────────────────────────────
// Sem polo, pergunta antes de qualquer coisa: é ele que decide em qual SPX a AT é colada.
function _solatGarantirPolo(seguir) {
    fetch(`${API}/entregador/meu-polo`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => {
            if (d.xpt) { _solatAplicarPolo(d); return seguir(); }
            _solatAplicarPolo(null);
            _solatPintarXpt();
            _solatPerguntarPolo(d.opcoes || [], seguir);
        })
        .catch(() => {
            document.getElementById("solat-empty").innerText = "Erro ao carregar. Puxe a tela pra recarregar.";
        });
}

function _solatAplicarPolo(d) {
    _solatPolo = d && d.xpt ? { polo: d.polo, polo_label: d.polo_label, xpt: d.xpt } : null;
    _solatXpt = _solatPolo ? _solatPolo.xpt : null;
}

function _solatPerguntarPolo(opcoes, seguir) {
    if (document.getElementById("solat-polo-overlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "solat-polo-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `
        <div style="${_gcCardStyle}">
            <div style="${_gcTitleStyle}">Qual é o seu polo?</div>
            <div style="${_gcMsgStyle}">É nele que as suas ATs vão ser criadas. Fica salvo no seu cadastro — pra trocar depois, você pede a redefinição ao suporte.</div>
            <div class="shr-escolha-opcoes">
                ${opcoes.map(p => `
                    <button type="button" class="shr-escolha-btn" data-polo="${_solatEsc(p.chave)}">
                        <span class="shr-escolha-cidade">${_solatEsc(p.label)}</span>
                        <span class="shr-escolha-cod">${_solatEsc(p.xpt)}</span>
                    </button>`).join("")}
            </div>
            <div id="solat-polo-erro" style="display:none;font-size:12.5px;color:#ef4444;margin-bottom:12px"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll(".shr-escolha-btn").forEach(btn => btn.addEventListener("click", () => {
        const p = opcoes.find(o => o.chave === btn.dataset.polo);
        if (!p) return;
        gcConfirm(
            `Seu polo é ${_solatEsc(p.label)} (${_solatEsc(p.xpt)})?\n\nDepois, só o suporte consegue trocar.`,
            () => _solatGravarPolo(p.chave, overlay, seguir),
            "Confirmar polo",
            "Sim, é esse"
        );
    }));
}

function _solatGravarPolo(chave, overlay, seguir) {
    const erro = overlay.querySelector("#solat-polo-erro");
    const botoes = overlay.querySelectorAll(".shr-escolha-btn");
    botoes.forEach(b => b.disabled = true);
    fetch(`${API}/entregador/meu-polo`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ polo: chave })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        // 409 com polo = já estava definido (outra aba, ou o suporte definiu). Segue com ele.
        if (!ok && !d.xpt) {
            botoes.forEach(b => b.disabled = false);
            erro.style.display = "";
            erro.innerText = d.error || "Não foi possível salvar. Tente de novo.";
            return;
        }
        overlay.remove();
        _solatAplicarPolo(d);
        seguir();
    })
    .catch(() => {
        botoes.forEach(b => b.disabled = false);
        erro.style.display = "";
        erro.innerText = "Erro de conexão. Tente de novo.";
    });
}

// A cada pedido: "Solicitar AT no XPT Videira?". Enter também confirma — quem bipa em
// sequência não larga o leitor pra tocar na tela.
function _solatConfirmarPolo(codigo, onOk) {
    const anterior = document.getElementById("solat-conf-overlay");
    if (anterior) anterior.remove();
    const p = _solatPolo;
    const overlay = document.createElement("div");
    overlay.id = "solat-conf-overlay";
    overlay.setAttribute("style", _gcOverlayStyle);
    overlay.innerHTML = `
        <div style="${_gcCardStyle}">
            <div style="${_gcTitleStyle}">Solicitar AT no XPT ${_solatEsc(p.polo_label)}?</div>
            <div style="${_gcMsgStyle}"><strong>${_solatEsc(codigo)}</strong> · ${_solatEsc(p.xpt)}</div>
            <div style="${_gcBtnsStyle};flex-wrap:wrap">
                <button style="${_gcBtnCxStyle}" data-action="redefinir">Solicitar redefinição de polo</button>
                <button style="${_gcBtnOkStyle}" data-action="ok">OK</button>
            </div>
        </div>`;

    const fechar = () => { overlay.remove(); document.removeEventListener("keydown", tecla); };
    const confirmar = () => { fechar(); onOk(); };
    const tecla = e => {
        if (e.key === "Enter") { e.preventDefault(); confirmar(); }
        else if (e.key === "Escape") fechar();
    };
    overlay.querySelector("[data-action=ok]").addEventListener("click", confirmar);
    overlay.querySelector("[data-action=redefinir]").addEventListener("click", () => {
        fechar();
        pcSolicitarPolo(p.polo);
    });
    overlay.addEventListener("click", e => { if (e.target === overlay) fechar(); });
    document.body.appendChild(overlay);
    // Fora do evento atual: o Enter do próprio bipe que abriu isto ainda está subindo
    // até o document e confirmaria sozinho.
    setTimeout(() => document.addEventListener("keydown", tecla), 0);
    overlay.querySelector("[data-action=ok]").focus();
}

/** A tela ainda é a que está aberta? */
function _solatNaTela() {
    const tela = document.getElementById("tela-solicitar-at");
    return !!tela && tela.classList.contains("active-view");
}

// Os dois relógios param quando não há mais nada em "criando" — e voltam
// sozinhos no próximo bipe. Deixar rodando com tudo pronto seria consulta ao
// banco pra confirmar o que já se sabe.
function _solatAjustarRelogios() {
    const criando = _solatItens.some(i => i.status === "criando");

    if (criando && !_solatTimerBusca) {
        _solatTimerBusca = setInterval(() => {
            // Saiu da tela: desliga tudo. Sem isto os relógios continuariam
            // consultando o servidor com ele em outra parte do site — e é
            // banco acordado à toa, que é o que estamos tentando não fazer.
            if (!_solatNaTela()) return _solatParar();
            // Aba escondida no bolso não precisa perguntar nada: quando ele
            // voltar pra tela, o próprio retorno já busca.
            if (document.hidden) return;
            _solatCarregarHoje();
        }, SOLAT_INTERVALO_BUSCA);
    } else if (!criando && _solatTimerBusca) {
        clearInterval(_solatTimerBusca);
        _solatTimerBusca = null;
    }

    if (criando && !_solatTimerBarra) {
        _solatTimerBarra = setInterval(() => {
            if (!_solatNaTela()) return _solatParar();
            _solatPintarBarras();
        }, SOLAT_INTERVALO_BARRA);
    } else if (!criando && _solatTimerBarra) {
        clearInterval(_solatTimerBarra);
        _solatTimerBarra = null;
    }
}

// Sair da tela desliga tudo: sem isto os relógios continuariam consultando o
// servidor com o entregador em outra parte do site.
function _solatParar() {
    if (_solatTimerBusca) { clearInterval(_solatTimerBusca); _solatTimerBusca = null; }
    if (_solatTimerBarra) { clearInterval(_solatTimerBarra); _solatTimerBarra = null; }
}

// Quanto falta, em fração de 0 a 1, pelo relógio local.
function _solatAndamento(item) {
    if (!item.criado_em) return 0;
    const decorrido = (Date.now() - new Date(item.criado_em).getTime()) / 1000;
    if (!isFinite(decorrido) || decorrido < 0) return 0;
    return Math.min(1, decorrido / Math.max(1, _solatEstimativa));
}

function _solatSegundos(item) {
    if (!item.criado_em) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(item.criado_em).getTime()) / 1000));
}

// Só mexe na largura e no texto das barras. Redesenhar a tabela quatro vezes
// por segundo piscaria a tela e perderia o toque no meio de um rolagem.
function _solatPintarBarras() {
    for (const item of _solatItens) {
        if (item.status !== "criando") continue;
        const fill = document.getElementById(`solat-barra-${item.id}`);
        const txt = document.getElementById(`solat-tempo-${item.id}`);
        if (!fill) continue;
        const frac = _solatAndamento(item);
        fill.style.width = Math.min(SOLAT_TETO_BARRA, frac * 100) + "%";
        const passou = frac >= 1;
        // Passou do previsto: para de prometer e passa a contar o que já se foi.
        fill.style.background = passou ? "#eab308" : "#3a86ff";
        if (txt) {
            txt.innerText = passou
                ? `${_solatSegundos(item)}s — está demorando mais que o normal`
                : `${_solatSegundos(item)}s de ~${_solatEstimativa}s`;
        }
    }
}

// O mesmo GET responde as duas perguntas: o polo atual (o suporte pode ter trocado) e o
// que ele já pediu. Uma ida só ao servidor — quem abre isso está na rua, com rede ruim.
function _solatCarregarHoje() {
    fetch(`${API}/entregador/solicitar-at/hoje`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        _solatAplicarPolo(d);
        const antes = _solatItens;
        _solatItens = d.itens || [];
        _solatAvisarRecusas(antes, _solatItens);
        if (d.estimativa_segundos) _solatEstimativa = d.estimativa_segundos;
        _solatPintarXpt();
        _solatRenderizar();
    })
    .catch(() => {
        document.getElementById("solat-empty").innerText = "Erro ao carregar. Puxe a tela pra recarregar.";
    });
}

// Pedido que estava "criando" e voltou recusado: avisa na hora, com bipe - não só na linha da tabela,
// que o entregador pode nem estar olhando.
function _solatAvisarRecusas(antes, agora) {
    const criando = new Set(antes.filter(i => i.status === "criando").map(i => i.id));
    const recusado = agora.find(i => i.status === "erro" && criando.has(i.id));
    if (!recusado) return;
    _gcBeepErro();
    _solatMsg(`<strong>${_solatEsc(recusado.codigo)}</strong>: ${_solatEsc(_solatTextoErro(recusado))}`, "erro");
}

// O motivo já vem resumido pelo macro (colador.js, resumoParaEntregador). Pra pedido entregue ou
// já na rua não adianta bipar de novo; código inexistente é conferir o código.
function _solatTextoErro(item) {
    const erro = item.erro || "o SPX recusou o código";
    if (/não existe/i.test(erro)) return `${erro}. Confira o código.`;
    if (/entregue|na rua|responsável|já está em uma AT/i.test(erro)) return erro;
    return `${erro}. Bipe de novo pra tentar outra vez.`;
}

function _solatPintarXpt() {
    const faixa = document.getElementById("solat-faixa");
    faixa.style.display = _solatXpt ? "" : "none";
    faixa.className = "shr-faixa" + (_solatXpt === "XPT_VIA" ? " via" : " cfc");
    if (_solatXpt) document.getElementById("solat-faixa-xpt").innerText = `${_solatXpt} · ${_solatPolo.polo_label}`;

    // Sem polo não há XPT, e sem XPT não há onde lançar: o campo sai do caminho em
    // vez de aceitar o bipe e recusar cada um depois.
    document.getElementById("solat-campo-codigo").style.display = _solatXpt ? "" : "none";

    const aviso = document.getElementById("solat-aviso");
    if (_solatXpt) {
        aviso.style.display = "none";
        document.getElementById("solat-codigo").focus();
    } else {
        aviso.style.display = "";
        aviso.innerText = "Escolha o seu polo pra pedir AT. Se a escolha fechou, saia e entre de novo nesta tela.";
    }
}

// Pisca a borda do campo. Quem bipa em rajada não lê a mensagem — a cor no canto do
// olho é o que diz se entrou.
let _solatFlashTimer = null;
function _solatFlash(tipo) {
    const wrap = document.getElementById("solat-campo-codigo");
    if (!wrap) return;
    clearTimeout(_solatFlashTimer);
    wrap.classList.remove("flash-ok", "flash-err");
    void wrap.offsetWidth;
    wrap.classList.add(tipo === "ok" ? "flash-ok" : "flash-err");
    _solatFlashTimer = setTimeout(() => wrap.classList.remove("flash-ok", "flash-err"), 900);
}

function _solatCodigoEnter(e) {
    if (e.key === "Enter") { e.preventDefault(); _solatEnviar(); }
}

function _solatScanCodigo() {
    if (!_solatXpt) return;
    _bteAbrirScanner(texto => {
        document.getElementById("solat-codigo").value = texto;
        _solatEnviar();
    });
}

function _solatEnviar() {
    const campo  = document.getElementById("solat-codigo");
    const codigo = campo.value.trim().toUpperCase();
    // Limpa e devolve o foco antes da resposta: o leitor dispara o próximo bipe antes de
    // ela chegar, e um campo travado perderia pacote.
    campo.value = "";
    campo.focus();
    if (!codigo) return;
    if (!_solatXpt) { _gcBeepErro(); return; }
    if (!SOLAT_CODIGO_RE.test(codigo)) {
        _gcBeepErro(); _solatFlash("err");
        return _solatMsg(`<strong>${_solatEsc(codigo)}</strong> não é um código válido — precisa ser BR seguido de 13 caracteres.`, "erro");
    }

    _solatConfirmarPolo(codigo, () => _solatPedir(codigo));
}

function _solatPedir(codigo) {
    fetch(`${API}/entregador/solicitar-at`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        // O XPT que ele acabou de confirmar: se o polo mudou nesse meio-tempo, o servidor recusa.
        body: JSON.stringify({ codigo, xpt: _solatXpt })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _solatFlash("err");
            // O polo pode ter mudado com a tela aberta (o suporte aprovou a troca):
            // repinta em vez de deixar bipando contra um erro fixo.
            if (d.sem_polo) { _solatAplicarPolo(null); _solatPintarXpt(); }
            if (d.polo_mudou) _solatCarregarHoje();
            if (d.ja_pedido) {
                return _solatMsg(
                    `<strong>${_solatEsc(codigo)}</strong> ${_solatEsc(d.error)}` +
                    `${d.usuario_nome ? " (" + _solatEsc(d.usuario_nome) + ")" : ""}`,
                    "aviso");
            }
            return _solatMsg(_solatEsc(d.error) || "Erro ao pedir.", "erro");
        }
        _gcBeepSucesso(); _solatFlash("ok");
        _solatMsg(`✓ <strong>${_solatEsc(d.codigo)}</strong> na fila.`, "ok");
        // Entra na lista local em vez de recarregar: uma ida ao servidor por bipe deixaria
        // a rajada lenta. O andamento real chega no próximo "Atualizar".
        _solatItens.unshift({
            id: d.id, codigo: d.codigo, status: "criando", at: null,
            criado_em: new Date().toISOString(), levou_segundos: null,
        });
        _solatRenderizar();
    })
    .catch(() => { _gcBeepErro(); _solatMsg("Erro ao conectar com o servidor.", "erro"); });
}

// Copiar a AT: ela sai daqui pro app do SPX, pro WhatsApp do supervisor, pro
// que for. Digitar "AT202609049AXFA" no celular, na rua, com pressa, é pedir
// erro de um caractere que ninguém acha depois.
function _solatCopiarAt(botao, at) {
    const rotulo = botao.innerText;
    gcCopiar(at).then(() => {
        botao.innerText = "Copiado!";
        botao.classList.add("copiado");
        setTimeout(() => {
            botao.innerText = rotulo;
            botao.classList.remove("copiado");
        }, 1800);
    }).catch(() => {
        // Sobrou o dedo: a AT continua na tela, selecionável.
        botao.innerText = "Não consegui";
        setTimeout(() => { botao.innerText = rotulo; }, 2200);
    });
}

function _solatMsg(msg, tipo) {
    const el = document.getElementById("solat-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { ok: "#22c55e", erro: "#f87171", aviso: "#eab308" };
    el.style.display = "";
    el.style.color = cores[tipo] || "#cbd5e1";
    el.style.fontSize = "13px";
    el.innerHTML = msg;
}

// Assinatura do que está na tela. O que muda de segundo em segundo (o tempo
// corrido, a largura da barra) não entra: aquilo é pintado à parte.
function _solatAssinatura() {
    return _solatItens.map(i => `${i.id}|${i.status}|${i.at || ""}`).join(";");
}

let _solatDesenhado = null;

function _solatRenderizar() {
    const empty  = document.getElementById("solat-empty");
    const result = document.getElementById("solat-resultado");

    // Redesenhar a cada 3s sem nada ter mudado apagaria o "Copiado!" no meio do
    // aviso, e faria a tabela piscar debaixo do dedo de quem está rolando.
    const assinatura = _solatAssinatura();
    if (assinatura === _solatDesenhado && _solatItens.length) {
        _solatPintarBarras();
        _solatAjustarRelogios();
        return;
    }
    _solatDesenhado = assinatura;

    if (!_solatItens.length) {
        empty.style.display = "";
        empty.innerText = _solatXpt
            ? "Nenhum pedido hoje. Bipe um código acima."
            : "Nenhum pedido hoje.";
        result.style.display = "none";
        return;
    }
    empty.style.display = "none";
    result.style.display = "";

    const criando = _solatItens.filter(i => i.status === "criando").length;
    document.getElementById("solat-lista-titulo").innerText =
        `Pedidos de hoje · ${_solatItens.length}` + (criando ? ` · ${criando} criando` : "");

    document.getElementById("solat-tbody").innerHTML = _solatItens.map(i => {
        const s = SOLAT_STATUS[i.status] || { rotulo: i.status, cor: "#8494a9" };
        const andamento = i.status === "criando"
            ? `<div style="min-width:150px">
                   <span style="display:inline-flex;align-items:center;gap:6px;color:${s.cor}">
                       <span style="width:7px;height:7px;border-radius:50%;background:${s.cor}"></span>
                       ${s.rotulo}
                   </span>
                   <div class="slh-barra" style="margin-top:6px">
                       <div class="slh-barra-fill" id="solat-barra-${i.id}"
                            style="width:0%;background:#3a86ff"></div>
                   </div>
                   <div id="solat-tempo-${i.id}"
                        style="font-size:11px;color:#7b98b5;margin-top:4px">0s de ~${_solatEstimativa}s</div>
               </div>`
            // Pronto: no lugar da barra, quanto ESTE levou. É o número que
            // deixa claro se hoje está melhor ou pior que o normal.
            : `<span style="display:inline-flex;align-items:center;gap:6px;color:${s.cor}">
                   <span style="width:7px;height:7px;border-radius:50%;background:${s.cor}"></span>
                   ${s.rotulo}${i.levou_segundos !== null && i.levou_segundos !== undefined
                       ? ` <span style="color:#7b98b5;font-size:11px">em ${i.levou_segundos}s</span>` : ""}
               </span>${i.status === "erro"
                   ? `<div style="font-size:11.5px;color:#f8a5a5;margin-top:4px">${_solatEsc(_solatTextoErro(i))}</div>` : ""}`;
        return `<tr>
            <td data-label="Código"><strong>${_solatEsc(i.codigo)}</strong></td>
            <td data-label="Andamento">${andamento}</td>
            <td data-label="AT">${i.at
                ? `<span style="display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap">
                       <strong>${_solatEsc(i.at)}</strong>
                       <button type="button" class="cen-at-btn"
                               onclick="_solatCopiarAt(this,'${_solatEsc(i.at)}')">Copiar</button>
                   </span>`
                : "—"}</td>
        </tr>`;
    }).join("");

    _solatPintarBarras();
    _solatAjustarRelogios();
}
