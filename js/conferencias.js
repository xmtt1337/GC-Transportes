// ───── CONFERÊNCIAS POR TRANSPORTADORA ─────

let _confTransp        = null;
let _confChartInstance = null;
let _confPacotesNaRua  = null;  // null = não carregado; array após carregado
let _confPacotesNaBase = null;
let _confTipoAtual     = null;  // tipo sendo processado no seletor de colunas
let _confGridTemp      = null;  // grid temporário para seletor manual

const _CONF_NOMES = { loggi: 'Loggi', jt: 'J&T', anjun: 'Anjun', imile: 'Imile', shopee: 'Shopee' };
const _CONF_CORES = { loggi: '#12A5E8', jt: '#EF4444', anjun: '#22C55E', imile: '#9333EA', shopee: '#F97316' };

function abrirConferencias(event, transportadora) {
    if (event) event.preventDefault();
    _confTransp        = transportadora;
    _confPacotesNaRua  = null;
    _confPacotesNaBase = null;
    _confTipoAtual     = null;
    _confGridTemp      = null;

    const label = _CONF_NOMES[transportadora] || transportadora;
    document.getElementById('titulo-pagina').innerText      = 'Conferências — ' + label;
    document.getElementById('conf-transp-titulo').innerText = label;
    document.getElementById('conf-file-na-rua').value       = '';
    document.getElementById('conf-file-na-base').value      = '';
    document.getElementById('conf-status').innerHTML        = '';
    document.getElementById('conf-resultado').style.display = 'none';
    document.getElementById('conf-empty-msg').style.display = '';

    if (_confChartInstance) { _confChartInstance.destroy(); _confChartInstance = null; }
    mostrarTela('tela-conferencias');
}

// ── Leitura do arquivo ──────────────────────────────────────────────────────

function _confAnexarTipo(input, tipo) {
    _confAnexar(input, tipo);
}

async function _confAnexar(input, tipo) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('conf-status');
    status.innerHTML = '<div style="color:#64748b;font-size:13px">Lendo arquivo...</div>';

    try {
        const grid = await _confLerGrid(file);
        if (!grid || grid.length < 2) throw new Error('Arquivo vazio ou inválido.');

        const headers = grid[0].map(c => String(c || '').trim());
        const lower   = headers.map(h =>
            h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        );

        const defBar = lower.findIndex(h =>
            h.includes('barras') || h.includes('barcode') || h.includes('waybill') ||
            h.includes('codigo') || h.includes('tracking') || h.includes('rastreio') ||
            h.includes('jms')    || h.includes('pedido')   || h.includes('numero')
        );
        const defCid = lower.findIndex(h => h.includes('cidade') || h.includes('city'));
        const defSts = lower.findIndex(h => h.includes('status'));
        const defEnt = lower.findIndex(h =>
            h.includes('entregador') || h.includes('motorista') || h.includes('courier') ||
            h.includes('responsavel') || h.includes('assigned') || h.includes('motoboy')
        );

        if (defBar >= 0) {
            status.innerHTML = '';
            _confProcessarGrid(grid, defBar, defCid, defSts, defEnt, tipo);
        } else {
            _confMostrarSeletor(headers, lower, tipo, grid);
        }
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
        input.value = '';
    }
}

async function _confLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                let wb;
                if (file.name.toLowerCase().endsWith('.csv')) {
                    // Tenta UTF-8 (com ou sem BOM); se inválido, usa windows-1252
                    let text;
                    try {
                        text = new TextDecoder('utf-8', { fatal: true }).decode(data);
                    } catch (_) {
                        text = new TextDecoder('windows-1252').decode(data);
                    }
                    // Remove BOM se presente
                    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                    wb = XLSX.read(text, { type: 'string' });
                } else {
                    wb = XLSX.read(data, { type: 'array', raw: false });
                }
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }));
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ── Seletor de colunas (fallback) ───────────────────────────────────────────

function _confMostrarSeletor(headers, lower, tipo, grid) {
    _confTipoAtual = tipo;
    _confGridTemp  = grid;

    const defBar = lower.findIndex(h =>
        h.includes('barras') || h.includes('barcode') || h.includes('waybill') ||
        h.includes('codigo') || h.includes('tracking')
    );
    const defCid = lower.findIndex(h => h.includes('cidade') || h.includes('city'));
    const defSts = lower.findIndex(h => h.includes('status'));
    const defEnt = lower.findIndex(h =>
        h.includes('entregador') || h.includes('motorista') || h.includes('courier') ||
        h.includes('responsavel')
    );

    const mkOpts = (defIdx, opcional) => {
        const nenhuma = opcional
            ? `<option value="-1"${defIdx < 0 ? ' selected' : ''}>— não usar —</option>` : '';
        return nenhuma + headers.map((h, i) =>
            `<option value="${i}"${i === defIdx ? ' selected' : ''}>${h}</option>`
        ).join('');
    };

    const tipoLabel = tipo === 'na_rua' ? 'Na Rua' : 'Na Base';
    document.getElementById('conf-status').innerHTML = `
        <div style="background:rgba(58,134,255,0.07);border:1px solid rgba(58,134,255,0.18);border-radius:12px;padding:16px 18px;margin-top:8px">
            <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:4px">Selecione as colunas — ${tipoLabel}</div>
            <div style="font-size:12px;color:#64748b;margin-bottom:12px">Não conseguimos detectar automaticamente as colunas deste arquivo.</div>
            <div style="display:grid;gap:10px">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <label style="font-size:12px;color:#94a3b8;width:130px;flex-shrink:0">Código *</label>
                    <select id="conf-col-bar" style="flex:1;min-width:150px;background:#0f1923;border:1px solid rgba(58,134,255,0.2);border-radius:7px;color:#e2e8f0;padding:6px 10px;font-size:13px;font-family:inherit">
                        ${mkOpts(defBar, false)}
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <label style="font-size:12px;color:#94a3b8;width:130px;flex-shrink:0">Cidade</label>
                    <select id="conf-col-cid" style="flex:1;min-width:150px;background:#0f1923;border:1px solid rgba(58,134,255,0.2);border-radius:7px;color:#e2e8f0;padding:6px 10px;font-size:13px;font-family:inherit">
                        ${mkOpts(defCid, true)}
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <label style="font-size:12px;color:#94a3b8;width:130px;flex-shrink:0">Status</label>
                    <select id="conf-col-sts" style="flex:1;min-width:150px;background:#0f1923;border:1px solid rgba(58,134,255,0.2);border-radius:7px;color:#e2e8f0;padding:6px 10px;font-size:13px;font-family:inherit">
                        ${mkOpts(defSts, true)}
                    </select>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <label style="font-size:12px;color:#94a3b8;width:130px;flex-shrink:0">Entregador</label>
                    <select id="conf-col-ent" style="flex:1;min-width:150px;background:#0f1923;border:1px solid rgba(58,134,255,0.2);border-radius:7px;color:#e2e8f0;padding:6px 10px;font-size:13px;font-family:inherit">
                        ${mkOpts(defEnt, true)}
                    </select>
                </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
                <button onclick="_confConfirmarSeletor()" style="padding:9px 20px;border-radius:9px;border:none;background:#3a86ff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Analisar</button>
                <button onclick="_confCancelarSeletor()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#64748b;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Cancelar</button>
            </div>
            <div id="conf-seletor-erro" style="color:#ef4444;font-size:12px;margin-top:8px"></div>
        </div>`;
}

function _confConfirmarSeletor() {
    const barIdx = parseInt(document.getElementById('conf-col-bar').value);
    const cidIdx = parseInt(document.getElementById('conf-col-cid')?.value ?? -1);
    const stsIdx = parseInt(document.getElementById('conf-col-sts')?.value ?? -1);
    const entIdx = parseInt(document.getElementById('conf-col-ent')?.value ?? -1);
    const erroEl = document.getElementById('conf-seletor-erro');
    if (isNaN(barIdx) || barIdx < 0) { erroEl.innerText = 'Selecione a coluna do código.'; return; }
    document.getElementById('conf-status').innerHTML = '';
    _confProcessarGrid(_confGridTemp, barIdx, cidIdx, stsIdx, entIdx, _confTipoAtual);
    _confGridTemp  = null;
    _confTipoAtual = null;
}

function _confCancelarSeletor() {
    _confGridTemp  = null;
    _confTipoAtual = null;
    document.getElementById('conf-status').innerHTML     = '';
    document.getElementById('conf-file-na-rua').value    = '';
    document.getElementById('conf-file-na-base').value   = '';
}

// ── Processamento do grid ────────────────────────────────────────────────────

function _confNormalizarCidade(raw) {
    const s = String(raw || '').trim();
    if (!s) return 'Não informada';
    // Title case: cada palavra com inicial maiúscula, resto minúsculo
    return s.toLowerCase().replace(/(?:^|\s)\S/g, c => c.toUpperCase());
}

function _confProcessarGrid(grid, barIdx, cidIdx, stsIdx, entIdx, tipo) {
    const pacotes = [];
    for (let i = 1; i < grid.length; i++) {
        const row    = grid[i];
        const codigo = String(row[barIdx] || '').trim();
        if (!codigo) continue;
        pacotes.push({
            codigo,
            cidade:     cidIdx >= 0 ? _confNormalizarCidade(row[cidIdx]) : 'Não informada',
            status:     stsIdx >= 0 ? String(row[stsIdx] || '').trim() : '',
            entregador: entIdx >= 0 ? String(row[entIdx] || '').trim() : '',
        });
    }

    if (!pacotes.length) {
        document.getElementById('conf-status').innerHTML =
            '<div style="color:#ef4444;font-size:13px">Nenhum código encontrado no arquivo.</div>';
        return;
    }

    if (tipo === 'na_rua')  _confPacotesNaRua  = pacotes;
    if (tipo === 'na_base') _confPacotesNaBase = pacotes;

    document.getElementById('conf-empty-msg').style.display = 'none';
    document.getElementById('conf-status').innerHTML =
        `<div style="color:#64748b;font-size:13px">${pacotes.length.toLocaleString('pt-BR')} pacotes carregados (${tipo === 'na_rua' ? 'Na Rua' : 'Na Base'}).</div>`;

    _confAnalisarLocal();
}

// ── Análise local ─────────────────────────────────────────────────────────────

function _confAnalisarLocal() {
    const naRua  = _confPacotesNaRua  || [];
    const naBase = _confPacotesNaBase || [];

    if (!naRua.length && !naBase.length) return;

    // Resumo Na Rua por cidade
    const naRuaPorCidade = {};
    for (const p of naRua) {
        naRuaPorCidade[p.cidade] = (naRuaPorCidade[p.cidade] || 0) + 1;
    }

    // Pendentes: pacotes Na Rua com "sem tentativa" no status
    const pendentesPorCidade = {};
    let totalPendentes = 0;
    for (const p of naRua) {
        if (p.status.toLowerCase().includes('sem tentativa')) {
            pendentesPorCidade[p.cidade] = (pendentesPorCidade[p.cidade] || 0) + 1;
            totalPendentes++;
        }
    }

    // Entregadores: só se algum pacote Na Rua tiver coluna entregador preenchida
    const temEntregador = naRua.some(p => p.entregador);
    const naRuaPorEntregador = {};
    if (temEntregador) {
        for (const p of naRua) {
            const ent = p.entregador || '(sem entregador)';
            if (!naRuaPorEntregador[ent]) naRuaPorEntregador[ent] = [];
            naRuaPorEntregador[ent].push(p);
        }
    }

    // Divergências: pacotes que aparecem em Na Rua E Na Base ao mesmo tempo
    let divergencias = [];
    if (naRua.length && naBase.length) {
        const codigosBase = new Set(naBase.map(p => p.codigo.toUpperCase()));
        divergencias = naRua.filter(p => codigosBase.has(p.codigo.toUpperCase()));
    }

    _confRenderResultado({
        totalNaRua:  naRua.length,
        totalNaBase: naBase.length,
        naRuaPorCidade,
        pendentesPorCidade,
        totalPendentes,
        temEntregador,
        naRuaPorEntregador,
        divergencias,
    });
}

// ── Renderização ──────────────────────────────────────────────────────────────

function _confRenderResultado({
    totalNaRua, totalNaBase,
    naRuaPorCidade, pendentesPorCidade, totalPendentes,
    temEntregador, naRuaPorEntregador,
    divergencias,
}) {
    const cor   = _CONF_CORES[_confTransp] || '#3a86ff';
    const total = totalNaRua + totalNaBase;
    const pctRua = total > 0 ? Math.round((totalNaRua / total) * 100) : 0;

    // ── Donut: Na Rua vs Na Base ─────────────────────────────────────────────
    document.getElementById('conf-pizza-labels').innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:${cor};flex-shrink:0"></div>
                <span style="font-size:13px;color:#e2e8f0">Na Rua: <strong>${totalNaRua.toLocaleString('pt-BR')}</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:rgba(251,146,60,0.75);flex-shrink:0"></div>
                <span style="font-size:13px;color:#e2e8f0">Na Base: <strong>${totalNaBase.toLocaleString('pt-BR')}</strong></span>
            </div>
            ${total > 0 ? `
            <div style="margin-top:4px;padding-top:10px;border-top:1px solid rgba(58,134,255,0.12)">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">Total</div>
                <div style="font-size:20px;font-weight:700;color:#e2e8f0">${total.toLocaleString('pt-BR')}</div>
            </div>
            <div style="font-size:28px;font-weight:800;color:${cor};line-height:1">${pctRua}%</div>
            <div style="font-size:12px;color:#64748b">na rua</div>
            ` : ''}
        </div>`;

    if (_confChartInstance) { _confChartInstance.destroy(); _confChartInstance = null; }
    const ctx = document.getElementById('conf-chart').getContext('2d');
    _confChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [totalNaRua || 0, totalNaBase || 0],
                backgroundColor: [cor, 'rgba(251,146,60,0.65)'],
                borderColor:     ['transparent', 'transparent'],
                borderWidth: 0,
                hoverOffset: 6,
            }]
        },
        options: {
            cutout: '72%',
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            animation: { duration: 700 }
        }
    });

    // ── Botões de exportação ─────────────────────────────────────────────────
    document.getElementById('conf-export-row').innerHTML = `
        ${_confPacotesNaRua ? `
        <button onclick="_confExportarLista(_confPacotesNaRua,'Na_Rua')" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;border:1px solid rgba(52,211,153,0.35);background:rgba(52,211,153,0.08);color:#34d399;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:0.2s" onmouseover="this.style.background='rgba(52,211,153,0.18)'" onmouseout="this.style.background='rgba(52,211,153,0.08)'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar Na Rua
        </button>` : ''}
        ${_confPacotesNaBase ? `
        <button onclick="_confExportarLista(_confPacotesNaBase,'Na_Base')" style="display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:10px;border:1px solid rgba(251,146,60,0.35);background:rgba(251,146,60,0.08);color:#fb923c;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:0.2s" onmouseover="this.style.background='rgba(251,146,60,0.18)'" onmouseout="this.style.background='rgba(251,146,60,0.08)'">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Exportar Na Base
        </button>` : ''}`;

    // ── Seções de detalhes ───────────────────────────────────────────────────
    let html = '';

    // 1. Divergências (pacotes presentes em Na Rua E Na Base)
    if (divergencias.length) {
        html += `
        <div class="painel-section-title" style="color:#ef4444">
            ⚠ Divergências — pacote em Na Rua e Na Base
            <span style="margin-left:8px;font-size:12px;font-weight:400;background:rgba(239,68,68,0.12);padding:2px 10px;border-radius:999px">${divergencias.length}</span>
        </div>
        <div style="background:rgba(15,25,35,0.5);border:1px solid rgba(239,68,68,0.25);border-radius:14px;padding:16px 18px;margin-bottom:22px">
            <div style="display:flex;flex-wrap:wrap;gap:6px">
                ${divergencias.map(p =>
                    `<span style="font-family:monospace;font-size:11.5px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:3px 8px;border-radius:6px">${p.codigo}</span>`
                ).join('')}
            </div>
        </div>`;
    }

    // 2. Na Rua por entregador (com destaque para pacotes sem entregador)
    if (temEntregador) {
        const entradas        = Object.entries(naRuaPorEntregador).sort((a, b) => b[1].length - a[1].length);
        const qtdSemEntregador = (naRuaPorEntregador['(sem entregador)'] || []).length;
        html += `
        <div class="painel-section-title">
            Entregadores — Na Rua
            ${qtdSemEntregador ? `<span style="margin-left:8px;font-size:12px;font-weight:400;color:#ef4444;background:rgba(239,68,68,0.12);padding:2px 10px;border-radius:999px">⚠ ${qtdSemEntregador} sem entregador</span>` : ''}
        </div>
        <div style="background:rgba(15,25,35,0.5);border:1px solid rgba(58,134,255,0.12);border-radius:14px;padding:8px 12px;margin-bottom:22px">
            ${entradas.map(([ent, pkgs]) => {
                const semEnt = ent === '(sem entregador)';
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 8px;border-radius:8px;margin:2px 0;
                    background:${semEnt ? 'rgba(239,68,68,0.07)' : 'transparent'};
                    border:1px solid ${semEnt ? 'rgba(239,68,68,0.2)' : 'transparent'}">
                    <span style="font-size:13px;color:${semEnt ? '#ef4444' : '#e2e8f0'};font-weight:${semEnt ? '600' : '400'}">${ent}</span>
                    <span style="font-size:13px;font-weight:700;color:${semEnt ? '#ef4444' : cor}">${pkgs.length.toLocaleString('pt-BR')} pacotes</span>
                </div>`;
            }).join('')}
        </div>`;
    }

    // 3. Na Rua por cidade
    if (_confPacotesNaRua !== null) {
        const cidadesRua = Object.entries(naRuaPorCidade).sort((a, b) => b[1] - a[1]);
        html += `
        <div class="painel-section-title">Na Rua — por cidade</div>
        <div style="background:rgba(15,25,35,0.5);border:1px solid rgba(58,134,255,0.12);border-radius:14px;padding:8px 12px;margin-bottom:22px">
            ${cidadesRua.length ? cidadesRua.map(([cidade, qtd]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 8px;border-bottom:1px solid rgba(58,134,255,0.07)">
                <span style="font-size:13px;color:#e2e8f0">${cidade}</span>
                <span style="font-size:13px;font-weight:700;color:${cor}">${qtd.toLocaleString('pt-BR')}</span>
            </div>`).join('')
            : '<div style="color:#64748b;font-size:13px;padding:8px">Nenhum dado disponível.</div>'}
        </div>`;
    }

    // 4. Pendentes — Sem Tentativa
    if (_confPacotesNaRua !== null) {
        const cidadesPend = Object.entries(pendentesPorCidade).sort((a, b) => b[1] - a[1]);
        const badgePend   = totalPendentes > 0
            ? `<span style="margin-left:8px;font-size:12px;font-weight:400;color:#fb923c;background:rgba(251,146,60,0.12);padding:2px 10px;border-radius:999px">${totalPendentes.toLocaleString('pt-BR')} total</span>`
            : '';
        html += `
        <div class="painel-section-title">Pendentes — Sem Tentativa ${badgePend}</div>
        <div style="background:rgba(15,25,35,0.5);border:1px solid rgba(251,146,60,0.18);border-radius:14px;padding:8px 12px;margin-bottom:22px">
            ${cidadesPend.length ? cidadesPend.map(([cidade, qtd]) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 8px;border-bottom:1px solid rgba(251,146,60,0.07)">
                <span style="font-size:13px;color:#e2e8f0">${cidade}</span>
                <span style="font-size:13px;font-weight:700;color:#fb923c">${qtd.toLocaleString('pt-BR')} pendentes</span>
            </div>`).join('')
            : '<div style="font-size:13px;color:#22c55e;font-weight:600;padding:8px">✓ Nenhum pendente sem tentativa</div>'}
        </div>`;
    }

    document.getElementById('conf-cidades').innerHTML = html;
    document.getElementById('conf-resultado').style.display = '';
}

// ── Exportação ────────────────────────────────────────────────────────────────

function _confExportarLista(lista, tipo) {
    if (!lista || !lista.length) { gcAlert('Nenhum pacote para exportar.'); return; }
    const transp    = _CONF_NOMES[_confTransp] || _confTransp;
    const temStatus = lista.some(p => p.status);
    const temEnt    = lista.some(p => p.entregador);
    const data      = lista.map(p => {
        const row = { 'Código': p.codigo, 'Cidade': p.cidade };
        if (temStatus) row['Status']     = p.status;
        if (temEnt)    row['Entregador'] = p.entregador;
        return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo);
    XLSX.writeFile(wb, `${transp}_${tipo}.xlsx`);
}
