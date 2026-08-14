// ───── FISCAL: Tributação IBS/CBS ─────
// Seção do formulário do CT-e + tela de configuração da empresa.
//
// Regra da tela: campo obrigatório NÃO é escondido nem preenchido sozinho.
// Se a empresa não tem configuração tributária, a tela diz o que falta e não
// deixa emitir — é preferível bloquear a emitir CT-e fiscalmente errado.

// Percentuais têm até 4 casas e valores 2, como o leiaute RTC define.
function _fmtPerc(v) {
    if (v === null || v === undefined || v === "") return "—";
    return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) + "%";
}
function _fmtMoeda(v) {
    if (v === null || v === undefined || v === "") return "—";
    return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ─────────────────────────── seção do formulário do CT-e ───────────────────
/**
 * Monta a seção "Tributação / IBS e CBS".
 * @param {object} situacao  resposta de GET /fiscal/empresas/:id/tributacao/situacao
 * @param {object} valores   valores já preenchidos (rascunho)
 */
function fiscalSecaoTributacao(situacao, valores = {}) {
    // Sem configuração, a seção vira um aviso com o caminho pra resolver —
    // mostrar campos vazios aqui só empurraria o erro pra hora da emissão.
    if (!situacao || !situacao.configurada) {
        const faltando = (situacao && situacao.faltando) || [];
        return `
        <div class="secao-form" id="secao-tributacao">
            <h3>Tributação — IBS e CBS</h3>
            <div class="aviso-bloqueio">
                <strong>${situacao?.motivo || "Configuração fiscal IBS/CBS não cadastrada para esta empresa."}</strong>
                <p>A emissão está bloqueada até que estes itens sejam configurados:</p>
                <ul>
                    ${faltando.map(f => `<li><code>${f.campo}</code> — ${f.por_que}</li>`).join("")}
                </ul>
                <p class="dica">
                    Esses valores dependem de definição do contador da transportadora.
                    Configure em <a href="#" onclick="abrirFiscalConfigTributaria(event)">Fiscal → Configurações fiscais</a>.
                </p>
            </div>
        </div>`;
    }

    const v = valores.ibscbs || {};
    return `
    <div class="secao-form" id="secao-tributacao">
        <h3>Tributação — IBS e CBS</h3>
        <p class="secao-nota">
            Valores vindos da configuração da empresa (vigência desde
            ${situacao.vigencia_inicio ? new Date(situacao.vigencia_inicio).toLocaleDateString("pt-BR") : "—"}).
            Alterar aqui vale só para este CT-e.
        </p>

        <div class="linha-form">
            <label>CST do IBS/CBS *
                <input id="trib-cst" maxlength="3" pattern="\\d{3}" required
                       value="${v.cst ?? situacao.cst ?? ""}" placeholder="3 dígitos">
            </label>
            <label>Classificação tributária (cClassTrib) *
                <input id="trib-classtrib" maxlength="6" pattern="\\d{6}" required
                       value="${v.c_class_trib ?? situacao.c_class_trib ?? ""}" placeholder="6 dígitos">
            </label>
        </div>

        <div class="linha-form">
            <label>Base de cálculo *
                <input id="trib-vbc" type="number" step="0.01" min="0" required
                       value="${v.vBC ?? ""}">
            </label>
        </div>

        <fieldset class="grupo-trib">
            <legend>IBS — competência estadual</legend>
            <label>Alíquota (%) *
                <input id="trib-p-ibs-uf" type="number" step="0.0001" min="0" max="100" required
                       value="${v.aliquota_ibs_uf ?? situacao.aliquota_ibs_uf ?? ""}">
            </label>
            <span class="calculado">Valor: <b id="trib-v-ibs-uf">—</b></span>
        </fieldset>

        <fieldset class="grupo-trib">
            <legend>IBS — competência municipal</legend>
            <label>Alíquota (%) *
                <input id="trib-p-ibs-mun" type="number" step="0.0001" min="0" max="100" required
                       value="${v.aliquota_ibs_mun ?? situacao.aliquota_ibs_mun ?? ""}">
            </label>
            <span class="calculado">Valor: <b id="trib-v-ibs-mun">—</b></span>
        </fieldset>

        <fieldset class="grupo-trib">
            <legend>CBS</legend>
            <label>Alíquota (%) *
                <input id="trib-p-cbs" type="number" step="0.0001" min="0" max="100" required
                       value="${v.aliquota_cbs ?? situacao.aliquota_cbs ?? ""}">
            </label>
            <span class="calculado">Valor: <b id="trib-v-cbs">—</b></span>
        </fieldset>

        <details class="grupo-opcional">
            <summary>Grupos opcionais (diferimento, redução, devolução, estorno)</summary>
            <p class="dica">
                Preencha apenas se a operação exigir. Cada grupo tem campos obrigatórios
                próprios — informar pela metade faz a SEFAZ rejeitar.
            </p>
            <div class="linha-form">
                <label>Redução — % de redução
                    <input id="trib-pred" type="number" step="0.0001" min="0" max="100">
                </label>
                <label>Redução — alíquota efetiva (%)
                    <input id="trib-paliqefet" type="number" step="0.0001" min="0" max="100">
                </label>
            </div>
            <div class="linha-form">
                <label>Diferimento — %
                    <input id="trib-pdif" type="number" step="0.0001" min="0" max="100">
                </label>
                <label>Diferimento — valor
                    <input id="trib-vdif" type="number" step="0.01" min="0">
                </label>
            </div>
            <div class="linha-form">
                <label>Devolução de tributo (cashback)
                    <input id="trib-vdevtrib" type="number" step="0.01" min="0">
                </label>
            </div>
        </details>

        <div class="totais-trib">
            <div>Total IBS: <b id="trib-total-ibs">—</b></div>
            <div>Total CBS: <b id="trib-total-cbs">—</b></div>
            <div>Total do documento (vTotDFe): <b id="trib-vtotdfe">—</b></div>
        </div>
    </div>`;
}

/**
 * Prévia do cálculo na tela.
 *
 * É só uma prévia: quem calcula o que vai no XML é o backend, com a
 * configuração vigente. Duplicar a regra aqui abriria espaço para a tela
 * mostrar um valor e o documento sair com outro.
 */
function fiscalCalcularPreviaTributacao() {
    const num = (id) => {
        const el = document.getElementById(id);
        const v = el ? parseFloat(el.value) : NaN;
        return isNaN(v) ? null : v;
    };
    const base = num("trib-vbc");
    const efetiva = num("trib-paliqefet");   // redução, quando informada, manda

    const calc = (aliq) => (base === null || aliq === null)
        ? null : Math.round(base * (efetiva ?? aliq) / 100 * 100) / 100;

    const vUF = calc(num("trib-p-ibs-uf"));
    const vMun = calc(num("trib-p-ibs-mun"));
    const vCBS = calc(num("trib-p-cbs"));

    const escrever = (id, valor) => {
        const el = document.getElementById(id);
        if (el) el.textContent = valor === null ? "—" : _fmtMoeda(valor);
    };
    escrever("trib-v-ibs-uf", vUF);
    escrever("trib-v-ibs-mun", vMun);
    escrever("trib-v-cbs", vCBS);

    const totalIBS = (vUF !== null && vMun !== null) ? Math.round((vUF + vMun) * 100) / 100 : null;
    escrever("trib-total-ibs", totalIBS);
    escrever("trib-total-cbs", vCBS);

    const vTPrest = num("cte-vtprest");
    escrever("trib-vtotdfe",
        (vTPrest !== null && totalIBS !== null && vCBS !== null)
            ? Math.round((vTPrest + totalIBS + vCBS) * 100) / 100 : null);
}

/** Coleta o que a seção preencheu, para enviar ao backend. */
function fiscalColetarTributacao() {
    const val = (id) => {
        const el = document.getElementById(id);
        return el && el.value !== "" ? el.value : null;
    };
    const dados = {
        cst: val("trib-cst"),
        c_class_trib: val("trib-classtrib"),
        vBC: val("trib-vbc"),
        aliquota_ibs_uf: val("trib-p-ibs-uf"),
        aliquota_ibs_mun: val("trib-p-ibs-mun"),
        aliquota_cbs: val("trib-p-cbs"),
    };
    // Grupos opcionais só viajam se estiverem completos — meio preenchido é
    // rejeição garantida na SEFAZ, e é melhor avisar aqui.
    const pRed = val("trib-pred"), pEfet = val("trib-paliqefet");
    if (pRed || pEfet) {
        if (!pRed || !pEfet) throw new Error("Redução: informe os dois campos (% de redução e alíquota efetiva).");
        dados.reducao = { pRedAliq: pRed, pAliqEfet: pEfet };
    }
    const pDif = val("trib-pdif"), vDif = val("trib-vdif");
    if (pDif || vDif) {
        if (!pDif || !vDif) throw new Error("Diferimento: informe o percentual e o valor.");
        dados.diferimento = { pDif, vDif };
    }
    const vDev = val("trib-vdevtrib");
    if (vDev) dados.devolucao = { vDevTrib: vDev };
    return dados;
}

// ──────────────────────────── tela de configuração ─────────────────────────
async function abrirFiscalConfigTributaria(event) {
    if (event) event.preventDefault();
    const empresaId = window._fiscalEmpresaAtual;
    if (!empresaId) return alert("Selecione a empresa fiscal primeiro.");

    const area = document.getElementById("conteudo");
    area.innerHTML = "<p>Carregando configuração fiscal…</p>";

    try {
        const r = await fetch(`${API}/fiscal/empresas/${empresaId}/tributacao`, {
            headers: { Authorization: "Bearer " + token },
        });
        if (r.status === 403) {
            area.innerHTML = `<div class="aviso-bloqueio">
                <strong>Sem permissão.</strong>
                <p>Alterar configuração fiscal exige a permissão "configurar" nesta empresa.</p>
            </div>`;
            return;
        }
        const dados = await r.json();
        area.innerHTML = _telaConfigTributaria(dados);
    } catch (e) {
        area.innerHTML = `<p class="erro">Erro ao carregar: ${e.message}</p>`;
    }
}

function _telaConfigTributaria(dados) {
    const c = (dados && dados.config) || {};
    const somenteLeitura = dados && dados.pode_configurar === false;
    const trava = somenteLeitura ? "disabled" : "";

    return `
    <h2>Configurações fiscais — IBS e CBS</h2>
    <div class="aviso-info">
        Estes valores vêm da legislação e da orientação do contador da transportadora.
        O sistema <b>não preenche nada sozinho</b>: sem configuração, a emissão fica bloqueada.
    </div>
    ${somenteLeitura ? '<div class="aviso-bloqueio">Você pode consultar, mas não alterar.</div>' : ""}

    <form id="form-config-trib" onsubmit="salvarFiscalConfigTributaria(event)">
        <fieldset>
            <legend>Situação tributária</legend>
            <div class="linha-form">
                <label>CST do IBS/CBS
                    <input name="cst" maxlength="3" pattern="\\d{3}" ${trava}
                           value="${c.cst || ""}" placeholder="3 dígitos">
                </label>
                <label>cClassTrib
                    <input name="c_class_trib" maxlength="6" pattern="\\d{6}" ${trava}
                           value="${c.c_class_trib || ""}" placeholder="6 dígitos">
                </label>
            </div>
        </fieldset>

        <fieldset>
            <legend>Alíquotas (%)</legend>
            <div class="linha-form">
                <label>IBS estadual
                    <input name="aliquota_ibs_uf" type="number" step="0.0001" min="0" max="100" ${trava}
                           value="${c.aliquota_ibs_uf ?? ""}">
                </label>
                <label>IBS municipal
                    <input name="aliquota_ibs_mun" type="number" step="0.0001" min="0" max="100" ${trava}
                           value="${c.aliquota_ibs_mun ?? ""}">
                </label>
                <label>CBS
                    <input name="aliquota_cbs" type="number" step="0.0001" min="0" max="100" ${trava}
                           value="${c.aliquota_cbs ?? ""}">
                </label>
            </div>
            <p class="dica">
                Deixar em branco bloqueia a emissão. Alíquota <b>zero</b> é diferente de vazio:
                use zero só quando a operação for de fato desonerada.
            </p>
        </fieldset>

        <fieldset>
            <legend>Vigência e exigência</legend>
            <div class="linha-form">
                <label>Vigente a partir de
                    <input name="vigencia_inicio" type="date" ${trava}
                           value="${c.vigencia_inicio ? String(c.vigencia_inicio).slice(0, 10) : new Date().toISOString().slice(0, 10)}">
                </label>
                <label>Versão da NT usada
                    <input name="versao_nt" ${trava} value="${c.versao_nt || ""}" placeholder="ex: 2026.002">
                </label>
            </div>
            <label class="check">
                <input type="checkbox" name="exigir_ibscbs" ${c.exigir_ibscbs !== false ? "checked" : ""} ${trava}>
                Exigir o grupo IBS/CBS na emissão
            </label>
            <p class="dica">
                O schema aceita CT-e sem o grupo, mas a NT 2026.002 passou a exigir o
                preenchimento. Só desmarque se o contador confirmar que a operação é dispensada.
            </p>
        </fieldset>

        <fieldset>
            <legend>Observações</legend>
            <textarea name="observacoes" rows="3" ${trava}
                      placeholder="Ex.: base legal, orientação do contador, data da consulta">${c.observacoes || ""}</textarea>
        </fieldset>

        ${somenteLeitura ? "" : '<button type="submit" class="btn-primario">Salvar configuração</button>'}
    </form>

    <p class="rodape-versao">
        Leiaute ${dados?.versao_leiaute || "4.00"} · pacote de schemas ${dados?.pacote_schemas || "—"}
    </p>`;
}

async function salvarFiscalConfigTributaria(event) {
    event.preventDefault();
    const form = event.target;
    const empresaId = window._fiscalEmpresaAtual;
    const corpo = Object.fromEntries(new FormData(form).entries());
    corpo.exigir_ibscbs = form.exigir_ibscbs.checked;

    // Campo vazio vai como null de propósito: string vazia no banco viraria
    // "configurado com nada", que é justamente o que não pode acontecer.
    for (const k of ["cst", "c_class_trib", "aliquota_ibs_uf", "aliquota_ibs_mun", "aliquota_cbs"]) {
        if (corpo[k] === "") corpo[k] = null;
    }

    try {
        const r = await fetch(`${API}/fiscal/empresas/${empresaId}/tributacao`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify(corpo),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Falha ao salvar.");
        alert("Configuração salva. Ela vale para os CT-e emitidos a partir da data de vigência.");
        abrirFiscalConfigTributaria();
    } catch (e) {
        alert("Erro: " + e.message);
    }
}
