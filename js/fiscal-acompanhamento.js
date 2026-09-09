// ───── FISCAL: Acompanhamento (dashboard do pipeline de CT-e) ─────
//
// Importação, validação e emissão agora rodam sozinhas, em segundo plano,
// para qualquer volume — sem depender de aba aberta nem de clique. Essa
// automação criou uma pergunta nova: "como estão indo?". Antes dava pra
// acompanhar abrindo a lista e olhando os primeiros CT-e; com 50 mil de uma
// vez, isso não serve mais.
//
// Esta tela junta três coisas num só lugar, e se atualiza sozinha (a cada 8s)
// enquanto estiver aberta:
//   1. o funil — quantos estão em cada etapa da esteira feliz
//   2. a grade completa de status — inclusive os que pedem atenção
//   3. as duas filas automáticas — rodando ou não, e quem está pausado
//
// Não faz nada além de LER. Clicar num cartão só leva pra lista já filtrada
// por aquele status — nenhuma ação daqui muda o pipeline.

const _ACOMP_FUNIL = [
    { label: "Rascunho",        statuses: ["RASCUNHO"] },
    { label: "Validando",       statuses: ["VALIDANDO"] },
    { label: "Pronto p/ emitir",statuses: ["PRONTO_PARA_EMISSAO"] },
    { label: "Emitindo",        statuses: ["ASSINANDO", "TRANSMITINDO"] },
    { label: "Autorizado",      statuses: ["AUTORIZADO"] },
];
const _ACOMP_ATENCAO = ["ERRO_VALIDACAO", "REJEITADO", "DENEGADO", "ERRO_COMUNICACAO"];

let _acompIntervalo = null;

async function abrirFiscalAcompanhamento(event) {
    if (event) event.preventDefault();
    mostrarTela("tela-fiscal-acompanhamento");
    const area = document.getElementById("fiscal-acompanhamento-conteudo");
    area.innerHTML = "<p class='carregando'>Carregando…</p>";

    try {
        if (!_cteContexto) _cteContexto = await _cteApi("/fiscal/cte/contexto");
    } catch (e) {
        area.innerHTML = typeof _htmlSemAcesso === "function"
            ? _htmlSemAcesso(e.message)
            : `<div class="aviso-bloqueio"><p>${_esc(e.message)}</p></div>`;
        return;
    }

    await _acompAtualizar();
    if (_acompIntervalo) clearInterval(_acompIntervalo);
    _acompIntervalo = setInterval(_acompAtualizar, 8000);
}

/** Roda a cada 8s. Se a tela não está mais aberta, para sozinho o polling. */
async function _acompAtualizar() {
    const tela = document.getElementById("tela-fiscal-acompanhamento");
    if (!tela || !tela.classList.contains("active-view")) {
        if (_acompIntervalo) { clearInterval(_acompIntervalo); _acompIntervalo = null; }
        return;
    }

    const area = document.getElementById("fiscal-acompanhamento-conteudo");
    try {
        const [resumo, validacao, emissao] = await Promise.all([
            _cteApi("/fiscal/cte/resumo-status"),
            _cteApi("/fiscal/validacao/fila/situacao"),
            _cteApi("/fiscal/emissao/fila/situacao"),
        ]);
        const porStatus = {};
        for (const l of resumo.por_status) porStatus[l.status] = l.total;
        area.innerHTML = _acompHtml(porStatus, resumo.total_geral, validacao, emissao);
    } catch (e) {
        // Falha de rede não deve derrubar um dashboard que fica aberto sozinho
        // por horas — mantém o que já estava na tela e tenta de novo em 8s.
        console.error("[acompanhamento]", e.message);
    }
}

function _acompNum(n) { return (n || 0).toLocaleString("pt-BR"); }

function _acompHtml(porStatus, total, validacao, emissao) {
    const soma = (chaves) => chaves.reduce((acc, k) => acc + (porStatus[k] || 0), 0);
    const autorizados = porStatus.AUTORIZADO || 0;
    const pendencia = soma(_ACOMP_ATENCAO);
    const emAndamento = soma(["RASCUNHO", "VALIDANDO", "PRONTO_PARA_EMISSAO", "ASSINANDO", "TRANSMITINDO"]);
    const pct = total ? Math.round((autorizados / total) * 100) : 0;

    return `
    <div class="acomp-topo">
        <div>
            <h2>Acompanhamento</h2>
            <div class="acomp-subtitulo">
                ${_esc(_cteContexto.empresa.razao_social)} ·
                Ambiente: ${_esc(_cteContexto.empresa.ambiente)}
            </div>
        </div>
        <div class="acomp-atualizacao">
            <span class="acomp-dot-viva"></span>
            Atualiza sozinho a cada 8s — última em ${new Date().toLocaleTimeString("pt-BR")}
        </div>
    </div>

    <div class="acomp-resumo">
        <div class="acomp-resumo-card">
            <div class="acomp-resumo-num">${_acompNum(total)}</div>
            <div class="acomp-resumo-label">Total de CT-e</div>
        </div>
        <div class="acomp-resumo-card acomp-cor-ok">
            <div class="acomp-resumo-num">${_acompNum(autorizados)}</div>
            <div class="acomp-resumo-label">Autorizados (${pct}%)</div>
        </div>
        <div class="acomp-resumo-card acomp-cor-alerta">
            <div class="acomp-resumo-num">${_acompNum(emAndamento)}</div>
            <div class="acomp-resumo-label">Em andamento no pipeline</div>
        </div>
        <div class="acomp-resumo-card ${pendencia ? "acomp-cor-erro" : ""}">
            <div class="acomp-resumo-num">${_acompNum(pendencia)}</div>
            <div class="acomp-resumo-label">Com pendência ou recusa</div>
        </div>
    </div>

    <div class="acomp-funil">
        ${_ACOMP_FUNIL.map((etapa, i) => `
            ${i > 0 ? '<div class="acomp-funil-seta">→</div>' : ""}
            <div class="acomp-funil-etapa" style="--etapa-c:${_CTE_ESTADOS[etapa.statuses[0]].cor}"
                 onclick="_acompVerStatus('${etapa.statuses[0]}')">
                <div class="acomp-funil-num">${_acompNum(soma(etapa.statuses))}</div>
                <div class="acomp-funil-label">${_esc(etapa.label)}</div>
            </div>`).join("")}
    </div>

    <div class="secao-form">
        <h3>Todos os status</h3>
        <div class="acomp-grade-status">
            ${Object.entries(_CTE_ESTADOS).map(([chave, meta]) => `
                <div class="acomp-card-status" style="--status-c:${meta.cor}"
                     onclick="_acompVerStatus('${chave}')">
                    <span class="acomp-card-status-label">${_esc(meta.rotulo)}</span>
                    <span class="acomp-card-status-num">${_acompNum(porStatus[chave])}</span>
                </div>`).join("")}
        </div>
    </div>

    <div class="acomp-filas">
        ${_acompFilaHtml("Fila de validação", "🔎", validacao, v =>
            `<div class="acomp-fila-metrica-num">${_acompNum(v.pendentes_de_validar)}</div>
             <div class="acomp-fila-metrica-label">pendente(s)</div>`)}
        ${_acompFilaHtml("Fila de emissão", "📨", emissao, e => `
             <div><div class="acomp-fila-metrica-num">${_acompNum(e.prontos_para_emitir)}</div>
                  <div class="acomp-fila-metrica-label">aguardando</div></div>
             <div><div class="acomp-fila-metrica-num">${_acompNum(e.em_andamento)}</div>
                  <div class="acomp-fila-metrica-label">em transmissão</div></div>`)}
    </div>`;
}

/** Cartão de uma fila automática — validação e emissão têm o mesmo formato. */
function _acompFilaHtml(titulo, emoji, fila, metricasHtml) {
    const pausadas = fila.empresas_pausadas || [];
    return `
    <div class="acomp-fila-card">
        <div class="acomp-fila-topo">
            <span class="acomp-fila-status-dot ${fila.rodando ? "rodando" : "parada"}"></span>
            <span class="acomp-fila-titulo">${emoji} ${_esc(titulo)}</span>
        </div>
        <div class="acomp-fila-metricas">
            ${metricasHtml(fila)}
            <div>
                <div class="acomp-fila-metrica-num">${fila.concorrencia}</div>
                <div class="acomp-fila-metrica-label">simultâneas (máx.)</div>
            </div>
        </div>
        ${pausadas.length ? `
        <div class="acomp-fila-pausada">
            ${pausadas.map(p => `
                <div class="acomp-fila-pausada-item">
                    <span>⚠ Empresa ${_esc(p.fiscal_empresa_id)} pausada</span>
                    <span>${Math.ceil(p.segundos_restantes / 60)} min restante(s)</span>
                </div>`).join("")}
        </div>` : `<div class="acomp-fila-ok">Nenhuma empresa pausada.</div>`}
    </div>`;
}

/** Leva pra lista de CT-e já filtrada por este status. */
async function _acompVerStatus(chaveStatus) {
    await abrirCTes();
    const sel = document.getElementById("f-status");
    if (sel) sel.value = chaveStatus || "";
    await _carregarListaCTe(0);
}
