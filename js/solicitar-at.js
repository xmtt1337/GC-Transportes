// ───── ATRIBUIÇÕES → SOLICITAR AT ─────
// O entregador bipa, na rua, o pacote que chegou na mão dele sem ter passado pelo
// recebimento nem pela atribuição no SPX. O código entra na MESMA fila do galpão, e
// quem cola no SPX é o colador que já roda lá — um pro Recebimento, outro pra AT.
// Por isso a tela não confirma "pronto": ela mostra o ANDAMENTO de cada pedido, que
// só avança quando o colador do galpão passa por ele.
//
// Sem seletor de XPT de propósito: o entregador não tem polo no cadastro, e o XPT sai
// da rota que ele já tem hoje. Deixar escolher seria deixar errar.

const SOLAT_CODIGO_RE = /^BR[A-Z0-9]{13}$/;

// Dois estados, não três: pra quem está na rua, "recebido no SPX mas ainda sem AT"
// e "nem recebido" são a mesma espera. O que muda a vida dele é ter a AT ou não.
const SOLAT_STATUS = {
    criando: { rotulo: "Criando", cor: "#eab308" },
    criada:  { rotulo: "Criada",  cor: "#22c55e" },
};

let _solatXpt = null;      // XPT da rota de hoje; null = sem rota hoje
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
    _solatXpt = null;
    _solatItens = [];
    document.getElementById("solat-codigo").value = "";
    _solatMsg("", null);
    document.getElementById("solat-empty").innerText = "Carregando...";
    document.getElementById("solat-resultado").style.display = "none";
    mostrarTela("tela-solicitar-at");
    _solatCarregarHoje();
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

// O mesmo GET responde as duas perguntas: se ele tem rota hoje (daí sai o XPT) e o que
// ele já pediu. Uma ida só ao servidor — quem abre isso está na rua, com rede ruim.
function _solatCarregarHoje() {
    fetch(`${API}/entregador/solicitar-at/hoje`, {
        headers: { "Authorization": "Bearer " + token }
    }).then(r => r.json())
    .then(d => {
        _solatXpt = d.xpt || null;
        _solatItens = d.itens || [];
        if (d.estimativa_segundos) _solatEstimativa = d.estimativa_segundos;
        _solatPintarXpt();
        _solatRenderizar();
    })
    .catch(() => {
        document.getElementById("solat-empty").innerText = "Erro ao carregar. Puxe a tela pra recarregar.";
    });
}

function _solatPintarXpt() {
    const faixa = document.getElementById("solat-faixa");
    faixa.style.display = _solatXpt ? "" : "none";
    faixa.className = "shr-faixa" + (_solatXpt === "XPT_VIA" ? " via" : " cfc");
    if (_solatXpt) document.getElementById("solat-faixa-xpt").innerText = _solatXpt;

    // Sem rota hoje não há XPT, e sem XPT não há onde lançar: o campo sai do caminho em
    // vez de aceitar o bipe e recusar cada um depois.
    document.getElementById("solat-campo-codigo").style.display = _solatXpt ? "" : "none";

    const aviso = document.getElementById("solat-aviso");
    if (_solatXpt) {
        aviso.style.display = "none";
        document.getElementById("solat-codigo").focus();
    } else {
        aviso.style.display = "";
        aviso.innerText = "Você não tem rota hoje. Sem rota não dá pra saber em qual XPT lançar o pedido — "
                        + "fale com a operação.";
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

    fetch(`${API}/entregador/solicitar-at`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ codigo })
    }).then(r => r.json().then(d => ({ ok: r.ok, d })))
    .then(({ ok, d }) => {
        if (!ok) {
            _gcBeepErro(); _solatFlash("err");
            // A rota pode ter mudado com a tela aberta (ele saiu da rota, virou o dia):
            // repinta em vez de deixar bipando contra um erro fixo.
            if (d.sem_rota) { _solatXpt = null; _solatPintarXpt(); }
            if (d.ja_pedido) {
                return _solatMsg(
                    `<strong>${_solatEsc(codigo)}</strong> ${_solatEsc(d.error)}` +
                    `${d.usuario_nome ? " (" + _solatEsc(d.usuario_nome) + ")" : ""}`,
                    "aviso");
            }
            return _solatMsg(_solatEsc(d.error) || "Erro ao pedir.", "erro");
        }
        _gcBeepSucesso(); _solatFlash("ok");
        _solatMsg(`✓ <strong>${_solatEsc(d.codigo)}</strong> na fila do galpão.`, "ok");
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

function _solatMsg(msg, tipo) {
    const el = document.getElementById("solat-msg");
    if (!msg) { el.style.display = "none"; el.innerHTML = ""; return; }
    const cores = { ok: "#22c55e", erro: "#f87171", aviso: "#eab308" };
    el.style.display = "";
    el.style.color = cores[tipo] || "#cbd5e1";
    el.style.fontSize = "13px";
    el.innerHTML = msg;
}

function _solatRenderizar() {
    const empty  = document.getElementById("solat-empty");
    const result = document.getElementById("solat-resultado");

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
               </span>`;
        return `<tr>
            <td data-label="Código"><strong>${_solatEsc(i.codigo)}</strong></td>
            <td data-label="Andamento">${andamento}</td>
            <td data-label="AT">${i.at ? `<strong>${_solatEsc(i.at)}</strong>` : "—"}</td>
        </tr>`;
    }).join("");

    _solatPintarBarras();
    _solatAjustarRelogios();
}
