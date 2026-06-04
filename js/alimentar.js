let _alimentarTransp = null;

const _ALIMENTAR_NOMES = { loggi: 'Loggi', anjun: 'Anjun', jt: 'J&T Express', imile: 'Imile' };

function abrirAlimentar(event, transportadora) {
    if (event) event.preventDefault();
    _alimentarTransp = transportadora;
    document.getElementById('alimentar-titulo').innerText = 'Alimentar — ' + (_ALIMENTAR_NOMES[transportadora] || transportadora);
    document.getElementById('titulo-pagina').innerText = 'Alimentar';
    mostrarTela('tela-alimentar');
    _alimentarCarregar();
}

async function _alimentarCarregar() {
    const el = document.getElementById('alimentar-content');
    el.innerHTML = '<div style="color:#64748b;font-size:14px;padding:20px 0">Carregando...</div>';
    try {
        const res = await fetch(API + '/alimentar/arquivos?transportadora=' + _alimentarTransp, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error();
        const arquivos = await res.json();
        _alimentarRenderizar(arquivos);
    } catch {
        el.innerHTML = '<div style="color:#ef4444;font-size:14px;padding:20px 0">Erro ao carregar arquivos.</div>';
    }
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
            <div class="nota-upload-sub">Selecione um arquivo .xlsx ou .csv</div>
        </div>
        <div class="nota-upload-btn">Selecionar arquivo</div>
    </label>
    <div id="alimentar-upload-status" style="margin-top:10px"></div>`;

    if (arquivos.length) {
        html += `<div class="painel-section-title" style="margin-top:20px">Arquivos salvos</div>`;
        arquivos.forEach(arq => {
            const data = new Date(arq.uploaded_at).toLocaleString('pt-BR');
            const tamanho = arq.tamanho_bytes ? (arq.tamanho_bytes / 1024).toFixed(1) + ' KB' : '';
            const nomeEsc = arq.nome_arquivo.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += `
            <div style="background:rgba(58,134,255,0.06);border:1px solid rgba(58,134,255,0.15);border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
                <div style="min-width:0;flex:1">
                    <div style="font-size:14px;font-weight:600;color:#e2e8f0;word-break:break-all">${arq.nome_arquivo}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:3px">${data}${tamanho ? ' · ' + tamanho : ''}</div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0">
                    <button onclick="_alimentarBaixar(${arq.id},'${nomeEsc}')" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(52,211,153,0.35);background:rgba(52,211,153,0.08);color:#34d399;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:0.2s" onmouseover="this.style.background='rgba(52,211,153,0.18)'" onmouseout="this.style.background='rgba(52,211,153,0.08)'">Baixar</button>
                    <button onclick="_alimentarRemover(${arq.id})" style="padding:7px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.35);background:rgba(239,68,68,0.08);color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:0.2s" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'">Remover</button>
                </div>
            </div>`;
        });
    } else {
        html += `<div class="fechamento-empty" style="margin-top:20px">Nenhum arquivo salvo para ${transpNome}.</div>`;
    }

    el.innerHTML = html;
}

async function _alimentarAnexar(input) {
    const file = input.files[0];
    if (!file) return;
    const status = document.getElementById('alimentar-upload-status');
    status.innerHTML = '<div style="color:#64748b;font-size:13px">Enviando...</div>';

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
                mime_type:       file.type || 'application/octet-stream'
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao enviar');
        status.innerHTML = '';
        input.value = '';
        _alimentarCarregar();
    } catch (err) {
        status.innerHTML = `<div style="color:#ef4444;font-size:13px">${err.message}</div>`;
    }
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
        alert('Erro ao baixar: ' + err.message);
    }
}

async function _alimentarRemover(id) {
    if (!confirm('Remover este arquivo do banco de dados?')) return;
    try {
        const res = await fetch(API + '/alimentar/' + id, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) throw new Error('Erro ao remover');
        _alimentarCarregar();
    } catch (err) {
        alert('Erro ao remover: ' + err.message);
    }
}
