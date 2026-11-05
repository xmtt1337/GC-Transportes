// Separação > Alimentações: o arquivo de cada transportadora que a Separação usa pra achar
// a cidade do pacote bipado. Uma tela só, com uma aba por transportadora; o envio mais novo
// é o que vale na Separação e os anteriores ficam guardados pra baixar (o servidor guarda 10).
let _alimentarTransp = null;

const _ALIMENTAR_NOMES = { loggi: 'Loggi', anjun: 'Anjun', jt: 'J&T Express', imile: 'Imile', total_express: 'Total Express' };
// Abas da tela. J&T não é mais atendida: a rota antiga abre, mas sem aba.
const _ALIMENTAR_ABAS = [
    { k: 'loggi',         cor: '#12A5E8' },
    { k: 'anjun',         cor: '#22C55E' },
    { k: 'imile',         cor: '#9333EA' },
    { k: 'total_express', cor: '#F59E0B' },
];
const _ALIMENTAR_ROTAS = { loggi: 'Loggi', anjun: 'Anjun', jt: 'JT', imile: 'Imile', total_express: 'TotalExpress' };
const _ALIMENTAR_ULTIMA_CHAVE = 'gc_alimentacoes_transp';

function _alimEsc(t) {
    return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Menu Separação > Alimentações: abre na última transportadora vista. */
function abrirAlimentacoes(event) {
    let ultima = null;
    try { ultima = localStorage.getItem(_ALIMENTAR_ULTIMA_CHAVE); } catch {}
    const valida = _ALIMENTAR_ABAS.some(a => a.k === ultima);
    abrirAlimentar(event, valida ? ultima : _ALIMENTAR_ABAS[0].k);
}

function abrirAlimentar(event, transportadora) {
    if (event) event.preventDefault();
    _alimentarTransp = transportadora;
    try { localStorage.setItem(_ALIMENTAR_ULTIMA_CHAVE, transportadora); } catch {}
    document.getElementById('alimentar-titulo').innerText = 'Alimentações';
    document.getElementById('titulo-pagina').innerText = 'Alimentações';
    mostrarTela('tela-alimentar', 'Operacao/Alimentar' + (_ALIMENTAR_ROTAS[transportadora] || ''));
    _alimentarPintarAbas();
    _alimentarCarregar();
}

function _alimentarPintarAbas() {
    const el = document.getElementById('alimentar-abas');
    if (!el) return;
    el.innerHTML = _ALIMENTAR_ABAS.map(a => `<button type="button"
        class="wac-transp-tab${a.k === _alimentarTransp ? ' active' : ''}" style="--transp-cor:${a.cor}"
        onclick="abrirAlimentar(null,'${a.k}')">${_ALIMENTAR_NOMES[a.k]}</button>`).join('');
}

async function _alimentarCarregar() {
    const el = document.getElementById('alimentar-content');
    const pedido = _alimentarTransp;
    el.innerHTML = skCards(3);
    try {
        const res = await fetch(API + '/alimentar/arquivos?transportadora=' + pedido, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error();
        const arquivos = await res.json();
        // Trocou de aba enquanto carregava: a resposta é da anterior.
        if (pedido !== _alimentarTransp) return;
        _alimentarRenderizar(arquivos);
    } catch {
        if (pedido !== _alimentarTransp) return;
        el.innerHTML = '<div style="color:#ef4444;font-size:14px;padding:20px 0">Erro ao carregar arquivos.</div>';
    }
}

function _alimentarLinhaArquivo(arq, atual) {
    const data = new Date(arq.uploaded_at).toLocaleString('pt-BR');
    const tamanho = arq.tamanho_bytes ? (arq.tamanho_bytes / 1024).toFixed(1) + ' KB' : '';
    const quem = arq.enviado_por ? ' · ' + _alimEsc(arq.enviado_por) : '';
    const nomeEsc = arq.nome_arquivo.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `
        <div class="alim-arq${atual ? ' alim-arq-atual' : ''}">
            <div style="min-width:0;flex:1">
                <div class="alim-arq-nome">${_alimEsc(arq.nome_arquivo)}</div>
                <div class="alim-arq-info">${data}${tamanho ? ' · ' + tamanho : ''}${quem}</div>
            </div>
            <div class="alim-arq-acoes">
                <button type="button" class="alim-link" onclick="_alimentarBaixar(${arq.id},'${nomeEsc}')">Baixar</button>
            </div>
        </div>`;
}

function _alimentarRenderizar(arquivos) {
    const el = document.getElementById('alimentar-content');
    const transpNome = _ALIMENTAR_NOMES[_alimentarTransp] || _alimentarTransp;

    let html = `
    <label class="nota-upload-area" style="cursor:pointer">
        <input type="file" id="alimentar-file-input" accept=".xlsx,.csv" style="display:none" onchange="_alimentarAnexar(this)">
        <div class="nota-upload-icon">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#3a86ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <polyline points="9 15 12 12 15 15"/>
            </svg>
        </div>
        <div class="nota-upload-text">
            <div class="nota-upload-title">Anexar planilha ${transpNome}</div>
            <div class="nota-upload-sub">Selecione um arquivo .xlsx ou .csv. O novo passa a valer na Separação.</div>
        </div>
        <div class="nota-upload-btn">Selecionar arquivo</div>
    </label>
    <div id="alimentar-upload-status" style="margin-top:10px"></div>`;

    const atual = arquivos.find(a => a.atual) || arquivos[0];
    const anteriores = arquivos.filter(a => a !== atual);
    if (atual) {
        html += `<div class="painel-section-title" style="margin-top:20px">Em uso na Separação</div>`;
        html += _alimentarLinhaArquivo(atual, true);
        if (anteriores.length) {
            html += `<div class="painel-section-title" style="margin-top:20px">Envios anteriores</div>`;
            html += `<div class="alim-arq-nota">Guardados só pra baixar. A Separação usa apenas o envio de cima.</div>`;
            html += anteriores.map(a => _alimentarLinhaArquivo(a, false)).join('');
        }
    } else {
        html += `<div class="fechamento-empty" style="margin-top:20px">Nenhum arquivo enviado para ${transpNome}. Sem ele, a Separação não acha os pacotes da ${transpNome}.</div>`;
    }

    el.innerHTML = html;
}

let _alimentarFilePendente = null;
let _alimentarGridPendente = null;

async function _alimentarAnexar(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('alimentar-upload-status');
    status.innerHTML = '<div style="color:#8494a9;font-size:13px">Lendo arquivo...</div>';

    try {
        const grid = await _alimentarLerGrid(file);
        if (!grid || grid.length < 2) throw new Error('Arquivo vazio ou inválido.');

        _alimentarFilePendente = file;
        _alimentarGridPendente = grid;

        const headers = grid[0].map(c => String(c || '').trim()).filter(c => c);
        const lower   = headers.map(h => h.toLowerCase());
        const defBar  = lower.findIndex(h => h.includes('barras') || h.includes('barcode') || h.includes('waybill') || h.includes('código') || h.includes('codigo') || h.includes('tracking') || h.includes('rastreio') || h.includes('jms') || h.includes('pedido'));
        const defCep  = (() => {
            const destino = lower.findIndex(h => (h.includes('cep') || h.includes('zip') || h.includes('postal')) && (h.includes('dest') || h.includes('receb') || h.includes('entrega') || h.includes('consig')));
            if (destino >= 0) return destino;
            const semOrigem = lower.findIndex(h => (h.includes('cep') || h.includes('zip') || h.includes('postal')) && !h.includes('orig') && !h.includes('reme') && !h.includes('sender'));
            return semOrigem >= 0 ? semOrigem : lower.findIndex(h => h.includes('cep') || h.includes('zip') || h.includes('postal'));
        })();

        status.innerHTML = '';

        // Se as colunas obrigatórias foram detectadas com segurança, pula o seletor
        if (defBar >= 0 && defCep >= 0) {
            const defCid  = lower.findIndex(h => h.includes('cidade') || h.includes('city'));
            const defReg  = lower.findIndex(h => h.includes('região') || h.includes('regiao') || h.includes('saca') || h.includes('hub'));
            const defDest = lower.findIndex(h => h.includes('para') || h.includes('destinat') || h.includes('recipient'));
            await _alimentarEnviarComIndices(file, grid, defBar, defCep, defCid, defReg, defDest);
        } else if (_alimentarTransp === 'imile') {
            // Fallback iMile: colunas exatas do formato alternativo
            const rawHeaders = grid[0].map(c => String(c || '').trim());
            const imileBar = rawHeaders.findIndex(h => h === 'Waybill No');
            const imileCep = rawHeaders.findIndex(h => h === 'Destination Zipcode');
            if (imileBar >= 0 && imileCep >= 0) {
                await _alimentarEnviarComIndices(file, grid, imileBar, imileCep, -1, -1, -1);
            } else {
                _alimentarMostrarSeletorColunas(headers);
            }
        } else {
            _alimentarMostrarSeletorColunas(headers);
        }
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
        input.value = '';
    }
}

function _alimentarMostrarSeletorColunas(headers) {
    const lower   = headers.map(h => h.toLowerCase());
    const defBar  = lower.findIndex(h => h.includes('barras') || h.includes('barcode') || h.includes('waybill') || h.includes('código') || h.includes('codigo') || h.includes('tracking') || h.includes('rastreio') || h.includes('jms') || h.includes('pedido'));
    const defCep  = (() => {
        const destino = lower.findIndex(h => (h.includes('cep') || h.includes('zip') || h.includes('postal')) && (h.includes('dest') || h.includes('receb') || h.includes('entrega') || h.includes('consig')));
        if (destino >= 0) return destino;
        const semOrigem = lower.findIndex(h => (h.includes('cep') || h.includes('zip') || h.includes('postal')) && !h.includes('orig') && !h.includes('reme') && !h.includes('sender'));
        return semOrigem >= 0 ? semOrigem : lower.findIndex(h => h.includes('cep') || h.includes('zip') || h.includes('postal'));
    })();
    const defCid  = lower.findIndex(h => h.includes('cidade') || h.includes('city'));
    const defReg  = lower.findIndex(h => h.includes('região') || h.includes('regiao') || h.includes('saca') || h.includes('hub'));
    const defDest = lower.findIndex(h => h.includes('para') || h.includes('destinat') || h.includes('recipient'));

    document.getElementById('alimentar-upload-status').innerHTML = `
        <div style="background:rgba(58,134,255,0.07);border:1px solid rgba(58,134,255,0.18);border-radius:12px;padding:16px 18px;margin-top:8px">
            <div style="font-size:13px;font-weight:700;color:#e2e8f0;margin-bottom:12px">Selecione as colunas do arquivo</div>
            <div style="display:grid;gap:10px">
                ${_alimentarCampo('col-barcode', 'Código de barras *', headers, defBar,  false)}
                ${_alimentarCampo('col-cep',     'CEP *',              headers, defCep,  false)}
                ${_alimentarCampo('col-cidade',  'Cidade',             headers, defCid,  true)}
                ${_alimentarCampo('col-regiao',  'Região / Saca',      headers, defReg,  true)}
                ${_alimentarCampo('col-dest',    'Destinatário',       headers, defDest, true)}
            </div>
            <div style="display:flex;gap:8px;margin-top:14px">
                <button onclick="_alimentarConfirmarUpload()" style="padding:9px 20px;border-radius:9px;border:none;background:#3a86ff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Enviar</button>
                <button onclick="_alimentarCancelarUpload()" style="padding:9px 16px;border-radius:9px;border:1px solid rgba(255,255,255,0.1);background:transparent;color:#8494a9;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Cancelar</button>
            </div>
            <div id="alimentar-col-erro" style="color:#ef4444;font-size:12px;margin-top:8px"></div>
        </div>`;
}

function _alimentarCampo(id, label, headers, defIdx, opcional) {
    const opNenhuma = opcional
        ? `<option value="-1"${defIdx < 0 ? ' selected' : ''}>— não usar —</option>`
        : '';
    const opts = headers.map((h, i) =>
        `<option value="${i}"${i === defIdx ? ' selected' : ''}>${h}</option>`
    ).join('');
    return `
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <label style="font-size:12px;color:#94a3b8;width:130px;flex-shrink:0">${label}</label>
            <select id="${id}" style="flex:1;min-width:150px;background:#0f1923;border:1px solid rgba(58,134,255,0.2);border-radius:7px;color:#e2e8f0;padding:6px 10px;font-size:13px;font-family:inherit">
                ${opNenhuma}${opts}
            </select>
        </div>`;
}

function _alimentarCancelarUpload() {
    _alimentarFilePendente = null;
    _alimentarGridPendente = null;
    document.getElementById('alimentar-upload-status').innerHTML = '';
    document.getElementById('alimentar-file-input').value = '';
}

async function _alimentarConfirmarUpload() {
    const erroEl = document.getElementById('alimentar-col-erro');
    const barIdx = parseInt(document.getElementById('col-barcode').value);
    const cepIdx = parseInt(document.getElementById('col-cep').value);
    const cidIdx = parseInt(document.getElementById('col-cidade')?.value ?? -1);
    const regIdx = parseInt(document.getElementById('col-regiao')?.value ?? -1);
    const desIdx = parseInt(document.getElementById('col-dest')?.value   ?? -1);
    if (isNaN(barIdx) || barIdx < 0) { erroEl.innerText = 'Selecione a coluna do código de barras.'; return; }
    if (isNaN(cepIdx) || cepIdx < 0) { erroEl.innerText = 'Selecione a coluna do CEP.'; return; }
    await _alimentarEnviarComIndices(_alimentarFilePendente, _alimentarGridPendente, barIdx, cepIdx, cidIdx, regIdx, desIdx);
}

async function _alimentarEnviarComIndices(file, grid, barIdx, cepIdx, cidIdx, regIdx, desIdx) {
    const pacotes = [];
    for (let i = 1; i < grid.length; i++) {
        const row     = grid[i];
        const barcode = String(row[barIdx] || '').trim();
        const cep     = String(row[cepIdx] || '').replace(/\D/g, '');
        if (!barcode && !cep) continue;
        pacotes.push({
            codigo_barras: barcode || null,
            id_pacote:     null,
            cep:           cep    || null,
            cidade:        cidIdx >= 0 ? String(row[cidIdx] || '').trim() || null : null,
            regiao:        regIdx >= 0 ? String(row[regIdx] || '').trim() || null : null,
            destinatario:  desIdx >= 0 ? String(row[desIdx] || '').trim() || null : null,
        });
    }

    const status = document.getElementById('alimentar-upload-status');
    status.innerHTML = `<div style="color:#8494a9;font-size:13px">Enviando ${pacotes.length} pacotes...</div>`;

    try {
        const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const res = await fetch(API + '/alimentar/upload', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transportadora:  _alimentarTransp,
                nome_arquivo:    file.name,
                conteudo_base64: base64,
                mime_type:       file.type || 'application/octet-stream',
                pacotes
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
        status.innerHTML = '';
        document.getElementById('alimentar-file-input').value = '';
        _alimentarFilePendente = null;
        _alimentarGridPendente = null;
        _alimentarCarregar();
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
    }
}

async function _alimentarLerGrid(file) {
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

async function _alimentarBaixar(id, nomeArquivo) {
    try {
        const res = await fetch(API + '/alimentar/download/' + id, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Erro ao baixar');
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = nomeArquivo;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        gcAlert('Erro ao baixar: ' + err.message);
    }
}
