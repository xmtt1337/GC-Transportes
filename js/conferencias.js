// ───── CONFERÊNCIAS POR TRANSPORTADORA ─────

let _confTransp        = null;
let _confChartInstance = null;
let _confGridPendente  = null;

const _CONF_NOMES = { loggi: 'Loggi', jt: 'J&T', anjun: 'Anjun', imile: 'Imile', shopee: 'Shopee' };
const _CONF_CORES = { loggi: '#12A5E8', jt: '#EF4444', anjun: '#22C55E', imile: '#9333EA', shopee: '#F97316' };

function abrirConferencias(event, transportadora) {
    if (event) event.preventDefault();
    _confTransp       = transportadora;
    _confGridPendente = null;

    const label = _CONF_NOMES[transportadora] || transportadora;
    document.getElementById('titulo-pagina').innerText    = 'Conferências — ' + label;
    document.getElementById('conf-transp-titulo').innerText = label;
    document.getElementById('conf-file-input').value       = '';
    document.getElementById('conf-status').innerHTML        = '';
    document.getElementById('conf-resultado').style.display = 'none';
    document.getElementById('conf-empty-msg').style.display = '';

    if (_confChartInstance) { _confChartInstance.destroy(); _confChartInstance = null; }

    mostrarTela('tela-conferencias');
}

// ── Leitura do arquivo ──────────────────────────────────────────────────────

async function _confAnexar(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('conf-status');
    status.innerHTML = '<div style="color:#64748b;font-size:13px">Lendo arquivo...</div>';

    try {
        const grid = await _confLerGrid(file);
        if (!grid || grid.length < 2) throw new Error('Arquivo vazio ou inválido.');

        _confGridPendente = grid;

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

        if (defBar >= 0) {
            status.innerHTML = '';
            await _confAnalisar(grid, defBar, defCid);
        } else {
            _confMostrarSeletor(headers, lower);
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
                    const text = new TextDecoder('utf-8').decode(data);
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

function _confMostrarSeletor(headers, lower) {
    const defBar = lower.findIndex(h =>
        h.includes('barras') || h.includes('barcode') || h.includes('waybill') ||
        h.includes('codigo') || h.includes('tracking')
    );
    const defCid = lower.findIndex(h => h.includes('cidade') || h.includes('city'));

    const mkOpts = (defIdx, opcional) => {
        const nenhuma = opcional
            ? `<option value="-1"${defIdx < 0 ? ' selected' : ''}>— não usar —</option>` : '';
        return nenhuma + headers.map((h, i) =>
            `<option value="${i}"${i === defIdx ? ' selected' : ''}>${h}</option>`
        ).join('');
    };

    document.getElementById('conf-status').innerHTML = `
        <div style="background:rgba(58,134,255,0.07);border:1px solid rgba(58,134,255,0.18);border-radius:12px;padding:16px 18px;margin-top:8px">
            <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Selecione as colunas do arquivo</div>
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
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
                <button onclick="_confConfirmarSeletor()" style="padding:9px 20px;border-radius:9px;border:none;background:#3a86ff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Analisar</button>
                <button onclick="_confCancelarSeletor()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#64748b;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Cancelar</button>
            </div>
            <div id="conf-seletor-erro" style="color:#ef4444;font-size:12px;margin-top:8px"></div>
        </div>`;
}

async function _confConfirmarSeletor() {
    const barIdx = parseInt(document.getElementById('conf-col-bar').value);
    const cidIdx = parseInt(document.getElementById('conf-col-cid')?.value ?? -1);
    const erroEl = document.getElementById('conf-seletor-erro');
    if (isNaN(barIdx) || barIdx < 0) { erroEl.innerText = 'Selecione a coluna do código.'; return; }
    document.getElementById('conf-status').innerHTML = '';
    await _confAnalisar(_confGridPendente, barIdx, cidIdx);
}

function _confCancelarSeletor() {
    _confGridPendente = null;
    document.getElementById('conf-status').innerHTML = '';
    document.getElementById('conf-file-input').value = '';
}

// ── Análise ─────────────────────────────────────────────────────────────────

async function _confAnalisar(grid, barIdx, cidIdx) {
    const status = document.getElementById('conf-status');

    const pacotes = [];
    for (let i = 1; i < grid.length; i++) {
        const row    = grid[i];
        const codigo = String(row[barIdx] || '').trim();
        if (!codigo) continue;
        const cidade = cidIdx >= 0 ? String(row[cidIdx] || '').trim() || 'Não informada' : 'Não informada';
        pacotes.push({ codigo, cidade });
    }

    if (!pacotes.length) {
        status.innerHTML = '<div style="color:#ef4444;font-size:13px">Nenhum código encontrado no arquivo.</div>';
        return;
    }

    status.innerHTML = `<div style="color:#64748b;font-size:13px">Analisando ${pacotes.length.toLocaleString('pt-BR')} pacotes...</div>`;
    document.getElementById('conf-empty-msg').style.display = 'none';

    try {
        const tok = localStorage.getItem('token');
        const res = await fetch(API + '/conferencia/analisar', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
            body: JSON.stringify({ transportadora: _confTransp, pacotes })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao analisar');
        status.innerHTML = '';
        _confRenderResultado(data);
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
    }
}

// ── Renderização ─────────────────────────────────────────────────────────────

function _confRenderResultado(data) {
    const { total_chegaram, total_expedido, por_cidade } = data;
    const nao_exp = total_chegaram - total_expedido;
    const pct     = total_chegaram > 0 ? Math.round((total_expedido / total_chegaram) * 100) : 0;
    const cor     = _CONF_CORES[_confTransp] || '#3a86ff';

    // Labels do gráfico
    document.getElementById('conf-pizza-labels').innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:${cor};flex-shrink:0"></div>
                <span style="font-size:13px;color:#e2e8f0">Expedido: <strong>${total_expedido.toLocaleString('pt-BR')}</strong></span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
                <div style="width:12px;height:12px;border-radius:3px;background:rgba(100,116,139,0.4);flex-shrink:0"></div>
                <span style="font-size:13px;color:#e2e8f0">Não expedido: <strong>${nao_exp.toLocaleString('pt-BR')}</strong></span>
            </div>
            <div style="margin-top:4px;padding-top:10px;border-top:1px solid rgba(58,134,255,0.12)">
                <div style="font-size:12px;color:#94a3b8;margin-bottom:2px">Total chegaram</div>
                <div style="font-size:20px;font-weight:700;color:#e2e8f0">${total_chegaram.toLocaleString('pt-BR')}</div>
            </div>
            <div style="font-size:28px;font-weight:800;color:${cor};line-height:1">${pct}%</div>
            <div style="font-size:12px;color:#64748b">expedido</div>
        </div>`;

    // Gráfico donut
    if (_confChartInstance) { _confChartInstance.destroy(); _confChartInstance = null; }
    const ctx = document.getElementById('conf-chart').getContext('2d');
    _confChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [total_expedido, nao_exp],
                backgroundColor: [cor, 'rgba(100,116,139,0.25)'],
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

    // Barras por cidade
    document.getElementById('conf-cidades').innerHTML = por_cidade.length
        ? por_cidade.map(c => {
            const p = c.chegaram > 0 ? Math.round((c.expedido / c.chegaram) * 100) : 0;
            return `
            <div style="margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                    <span style="font-size:13px;font-weight:600;color:#e2e8f0">${c.cidade}</span>
                    <span style="font-size:12px;color:#64748b">${c.expedido.toLocaleString('pt-BR')} / ${c.chegaram.toLocaleString('pt-BR')} &nbsp;·&nbsp; <span style="color:${cor};font-weight:700">${p}%</span></span>
                </div>
                <div style="height:8px;background:rgba(100,116,139,0.18);border-radius:999px;overflow:hidden">
                    <div style="height:100%;width:${p}%;background:${cor};border-radius:999px;transition:width 0.6s ease"></div>
                </div>
            </div>`;
        }).join('')
        : '<div style="color:#64748b;font-size:13px">Nenhuma cidade disponível.</div>';

    document.getElementById('conf-resultado').style.display = '';
}
