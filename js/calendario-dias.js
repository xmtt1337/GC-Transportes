// ───── CALENDÁRIO DE DIAS ─────
//
// Um seletor de data para as telas que trabalham por dia. Nasceu no Line Haul e
// virou compartilhado quando a tela de Entregadores pediu o mesmo — as duas
// tinham a mesma fita horizontal com os 8 dias mais recentes, e a fita quebrava
// igual nas duas: dia mais antigo que o oitavo era inalcançável, e ela gastava
// uma faixa inteira da tela pra mostrar pouco mais de uma semana.
//
// Quem usa passa os dias que EXISTEM. Dia sem dado fica apagado e não clica —
// assim clicar nunca leva a uma tela vazia, que é a regra que as duas telas já
// seguiam.
//
// O card mora no <body> e é position: fixed. O corpo das telas rola com
// overflow: um painel posicionado lá dentro sairia cortado pela borda, e no
// fluxo normal empurrava o conteúdo pra baixo toda vez que abria.

const _GC_CAL_MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                       "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const _GC_CAL_DOW = ["D", "S", "T", "Q", "Q", "S", "S"];

// Só um calendário aberto por vez — são telas diferentes, nunca visíveis juntas.
let _gcCalCfg = null;      // configuração de quem está montado agora
let _gcCalMes = "";        // "YYYY-MM" que o card está mostrando
let _gcCalAberto = false;

function _gcCalEsc(t) {
    return String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/** "2026-08-30" → "30/08/2026". */
function gcCalBr(s) {
    return s ? s.split("-").reverse().join("/") : "";
}

/** "YYYY-MM" do dia escolhido; o de hoje quando não há dia escolhido. */
function gcCalMesDe(dia, hoje) {
    const base = /^\d{4}-\d{2}-\d{2}$/.test(dia || "") ? dia : (hoje || "");
    return /^\d{4}-\d{2}/.test(base) ? base.slice(0, 7) : "";
}

/** Mês vizinho. Feito na mão pra virar o ano sozinho e não depender de fuso. */
function gcCalMesVizinho(mes, passo) {
    const partes = String(mes || "").split("-").map(Number);
    const ano = partes[0], m = partes[1];
    if (!ano || !m) return mes;
    const total = (ano * 12) + (m - 1) + passo;
    return String(Math.floor(total / 12)).padStart(4, "0") + "-"
         + String((total % 12) + 1).padStart(2, "0");
}

/**
 * As células do mês, na ordem em que entram na grade.
 *
 * Devolve dados, não HTML: é o pedaço que dá pra testar sem navegador, e é onde
 * mora o erro chato de calendário — o dia cair na coluna errada do dia da
 * semana, que ninguém percebe olhando de relance.
 *
 * @param {string} mes "YYYY-MM"
 * @param {Array<{dia: string, sub?: string, resumo?: string}>} dias Dias que têm dado.
 * @param {string} hoje
 * @param {string} selecionado
 * @return {Array<Object>} Vazias no começo ({vazio:true}) e depois uma por dia.
 */
function gcCalGrade(mes, dias, hoje, selecionado) {
    if (!/^\d{4}-\d{2}$/.test(mes || "")) return [];
    const partes = mes.split("-").map(Number);
    const ano = partes[0], m = partes[1];

    const porDia = {};
    (dias || []).forEach(d => { if (d && d.dia) porDia[d.dia] = d; });

    // new Date(ano, mes, dia) é horário local — não passa por UTC, então não
    // escorrega um dia como new Date("2026-08-01") faria.
    const primeiroDow = new Date(ano, m - 1, 1).getDay();
    const totalDias   = new Date(ano, m, 0).getDate();

    const celulas = [];
    for (let i = 0; i < primeiroDow; i++) celulas.push({ vazio: true });
    for (let n = 1; n <= totalDias; n++) {
        const dia = mes + "-" + String(n).padStart(2, "0");
        const achado = porDia[dia];
        celulas.push({
            dia,
            numero: n,
            // `sub` é o miúdo DENTRO da célula e precisa ser curto — cabe um
            // número, não uma frase. `resumo` é o texto do botão e da dica, onde
            // sobra espaço pra "19 entregadores".
            sub: achado ? String(achado.sub ?? "") : "",
            resumo: achado ? String(achado.resumo ?? achado.sub ?? "") : "",
            tem: !!achado,
            hoje: dia === hoje,
            selecionado: dia === selecionado,
        });
    }
    return celulas;
}

/**
 * Desenha o botão que abre o calendário, dentro do contêiner de quem chamou.
 *
 * @param {Object} cfg
 * @param {string} cfg.alvo Id do contêiner (um <div> vazio na tela).
 * @param {Array<{dia: string, sub?: string, resumo?: string}>} cfg.dias Dias que existem.
 *        `sub` = miúdo na célula (curto); `resumo` = texto do botão e da dica.
 * @param {string} cfg.dia Dia escolhido.
 * @param {string} cfg.hoje
 * @param {Function} cfg.aoEscolher Chamado com o dia clicado.
 * @param {string=} cfg.legenda Texto do rodapé do card.
 */
function gcCalMontar(cfg) {
    const el = document.getElementById(cfg.alvo);
    if (!el) return;
    _gcCalCfg = cfg;

    if (!cfg.dias || !cfg.dias.length) { el.style.display = "none"; gcCalFechar(); return; }
    el.style.display = "";
    if (!_gcCalMes) _gcCalMes = gcCalMesDe(cfg.dia, cfg.hoje);

    const escolhido = (cfg.dias || []).find(d => d.dia === cfg.dia);
    const titulo = !cfg.dia ? "Escolher dia" : cfg.dia === cfg.hoje ? "Hoje" : gcCalBr(cfg.dia);
    const sub = escolhido ? String(escolhido.resumo ?? escolhido.sub ?? "") : "";

    el.innerHTML = `
        <div class="slh-cal-linha">
            <button type="button" class="slh-cal-btn${_gcCalAberto ? " aberto" : ""}" onclick="gcCalAlternar()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span class="slh-cal-btn-txt">${_gcCalEsc(titulo)}</span>
                ${sub ? `<span class="slh-cal-btn-sub">${_gcCalEsc(sub)}</span>` : ""}
                <span class="slh-cal-seta">▾</span>
            </button>
        </div>`;

    if (_gcCalAberto) _gcCalDesenharPop();
}

function _gcCalPainel() {
    const cfg = _gcCalCfg || {};
    const grade = gcCalGrade(_gcCalMes, cfg.dias, cfg.hoje, cfg.dia);
    const partes = String(_gcCalMes).split("-").map(Number);
    const titulo = (_GC_CAL_MESES[partes[1] - 1] || "") + " de " + (partes[0] || "");

    const celulas = grade.map(c => {
        if (c.vazio) return `<span class="slh-cal-dia vazio"></span>`;
        const classes = ["slh-cal-dia", c.tem ? "tem" : "sem"];
        if (c.hoje) classes.push("hoje");
        if (c.selecionado) classes.push("sel");
        // Dia sem dado não vira botão: clicar levaria a uma tela vazia.
        if (!c.tem) return `<span class="${classes.join(" ")}">${c.numero}</span>`;
        return `<button type="button" class="${classes.join(" ")}" onclick="gcCalEscolher('${c.dia}')"
                        title="${_gcCalEsc(c.resumo)}">${c.numero}${c.sub ? `<small>${_gcCalEsc(c.sub)}</small>` : ""}</button>`;
    }).join("");

    const temHoje = (cfg.dias || []).some(d => d.dia === cfg.hoje);
    return `
        <div class="slh-cal-topo">
            <button type="button" class="slh-cal-nav" onclick="gcCalMover(-1)" aria-label="Mês anterior">‹</button>
            <span class="slh-cal-mes">${_gcCalEsc(titulo)}</span>
            <button type="button" class="slh-cal-nav" onclick="gcCalMover(1)" aria-label="Próximo mês">›</button>
        </div>
        <div class="slh-cal-grade">
            ${_GC_CAL_DOW.map(d => `<span class="slh-cal-dow">${d}</span>`).join("")}
            ${celulas}
        </div>
        <div class="slh-cal-rodape">
            <span class="slh-cal-legenda">${_gcCalEsc(cfg.legenda || "")}</span>
            ${temHoje ? `<button type="button" class="slh-cal-hoje" onclick="gcCalEscolher('${cfg.hoje}')">Hoje</button>` : ""}
        </div>`;
}

function _gcCalPop() {
    let pop = document.getElementById("gc-cal-pop");
    if (!pop) {
        pop = document.createElement("div");
        pop.id = "gc-cal-pop";
        pop.className = "slh-cal-pop";
        document.body.appendChild(pop);
    }
    return pop;
}

function _gcCalDesenharPop() {
    const pop = _gcCalPop();
    pop.innerHTML = _gcCalPainel();
    pop.style.display = "block";
    gcCalPosicionar();
}

/**
 * Encosta o card no botão que o abriu.
 *
 * position: fixed, então as contas são em coordenadas de viewport — é o que faz
 * o card ficar certo mesmo com a tela rolada. Vira pra cima quando não cabe
 * embaixo: no celular o botão costuma estar na metade de baixo da tela, e um
 * card de 380px abrindo pra baixo ficaria metade fora.
 */
function gcCalPosicionar() {
    const cfg = _gcCalCfg;
    const pop = document.getElementById("gc-cal-pop");
    if (!cfg || !pop || pop.style.display === "none") return;
    const btn = document.querySelector("#" + cfg.alvo + " .slh-cal-btn");
    if (!btn) return;

    const r = btn.getBoundingClientRect();
    const margem = 8;
    const largura = pop.offsetWidth;
    const altura = pop.offsetHeight;

    let left = Math.min(r.left, window.innerWidth - largura - margem);
    left = Math.max(left, margem);

    let top = r.bottom + 6;
    if (top + altura > window.innerHeight - margem) {
        const acima = r.top - altura - 6;
        top = acima >= margem ? acima : Math.max(margem, window.innerHeight - altura - margem);
    }

    pop.style.left = left + "px";
    pop.style.top = top + "px";
}

function gcCalFechar() {
    _gcCalAberto = false;
    const pop = document.getElementById("gc-cal-pop");
    if (pop) { pop.style.display = "none"; pop.innerHTML = ""; }
    document.querySelectorAll(".slh-cal-btn.aberto").forEach(b => b.classList.remove("aberto"));
}

function gcCalAlternar() {
    if (_gcCalAberto) { gcCalFechar(); return; }
    if (!_gcCalCfg) return;
    _gcCalAberto = true;
    // Reabrir sempre volta pro mês do dia escolhido: quem navegou até março e
    // fechou sem escolher não quer reabrir em março.
    _gcCalMes = gcCalMesDe(_gcCalCfg.dia, _gcCalCfg.hoje);
    gcCalMontar(_gcCalCfg);
}

function gcCalMover(passo) {
    _gcCalMes = gcCalMesVizinho(_gcCalMes, passo);
    _gcCalDesenharPop();
}

function gcCalEscolher(dia) {
    const cfg = _gcCalCfg;
    gcCalFechar();
    if (cfg && typeof cfg.aoEscolher === "function") cfg.aoEscolher(dia);
}

// Redes de segurança: qualquer coisa que mova o botão de lugar ou tire o foco da
// página fecha o card, em vez de deixá-lo pairando sobre outra tela.
document.addEventListener("pointerdown", e => {
    if (!_gcCalAberto) return;
    const pop = document.getElementById("gc-cal-pop");
    if (pop && pop.contains(e.target)) return;
    if (e.target.closest && e.target.closest(".slh-cal-btn")) return;
    gcCalFechar();
});
document.addEventListener("keydown", e => { if (e.key === "Escape") gcCalFechar(); });
// Captura porque quem rola é o corpo da tela, não a janela — sem o true o
// evento nunca chegaria aqui.
window.addEventListener("scroll", () => { if (_gcCalAberto) gcCalFechar(); }, true);
window.addEventListener("resize", gcCalPosicionar);
window.addEventListener("blur", () => gcCalFechar());
