let _bipTimeout = null;

function abrirBipagens() {
    mostrarTela('tela-bipagens');
    document.getElementById('titulo-pagina').innerText = 'Bipagens';
    document.getElementById('bip-resultado').innerHTML = '';
    document.getElementById('bip-input').value = '';
    document.getElementById('bip-clear').style.display = 'none';
    setTimeout(() => document.getElementById('bip-input').focus(), 250);
    _bipCarregarStatusCeps();
}

async function _bipCarregarStatusCeps() {
    try {
        const res  = await fetch(API + '/bipagem/cep-status', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        const btn  = document.getElementById('bip-sync-btn');
        if (!btn) return;
        const n = data.total || 0;
        if (n === 0) {
            btn.title = 'Banco vazio — clique para sincronizar';
            btn.style.borderColor = 'rgba(239,68,68,0.5)';
            btn.style.color       = '#ef4444';
            btn.style.background  = 'rgba(239,68,68,0.08)';
        } else {
            btn.title = `${n.toLocaleString('pt-BR')} CEPs no banco`;
        }
    } catch { /* silencioso */ }
}

function _bipAuto(input) {
    document.getElementById('bip-clear').style.display = input.value ? '' : 'none';
    clearTimeout(_bipTimeout);
    if (input.value.trim().length >= 6) {
        _bipTimeout = setTimeout(_bipBuscar, 400);
    }
}

function _bipLimpar() {
    document.getElementById('bip-input').value = '';
    document.getElementById('bip-clear').style.display = 'none';
    document.getElementById('bip-resultado').innerHTML = '';
    document.getElementById('bip-input').focus();
}

function _bipEhCep(v) {
    return /^\d{5}-?\d{3}$/.test(v.trim()) || /^\d{8}$/.test(v.trim());
}

async function _bipBuscar() {
    clearTimeout(_bipTimeout);
    const codigo = document.getElementById('bip-input').value.trim();
    if (!codigo) return;

    if (_bipEhCep(codigo)) {
        await _bipBuscarCep(codigo);
    } else {
        await _bipBuscarCodigo(codigo);
    }
    _bipSelecionarInput();
}

async function _bipBuscarCep(cep) {
    const el = document.getElementById('bip-resultado');
    el.innerHTML = _bipLoadingHtml();
    try {
        const res  = await fetch(API + '/bipagem/buscar-cep?cep=' + encodeURIComponent(cep), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) { el.innerHTML = _bipErroHtml(data.error); return; }

        const linhas = Array.isArray(data) ? data : [data];
        el.innerHTML = _bipRenderCepCards(linhas);
    } catch {
        el.innerHTML = _bipErroHtml('Erro ao conectar ao servidor.');
    }
}

async function _bipBuscarCodigo(codigo) {
    const el = document.getElementById('bip-resultado');
    el.innerHTML = _bipLoadingHtml();
    try {
        const res  = await fetch(API + '/bipagem/buscar?codigo=' + encodeURIComponent(codigo), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) { el.innerHTML = _bipErroHtml(data.error || 'Código não encontrado'); return; }

        // Backend detectou que era CEP, não barcode
        if (data.tipo === 'cep') {
            el.innerHTML = _bipRenderCepCards(data.resultados);
            return;
        }

        const transpNomes = { loggi: 'Loggi', anjun: 'Anjun', jt: 'J&T Express', imile: 'Imile', shopee: 'Shopee' };
        const transpNome  = transpNomes[data.transportadora] || data.transportadora || '—';

        el.innerHTML = `
            <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:18px 20px">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span style="font-size:14px;font-weight:700;color:#22c55e">Pacote encontrado</span>
                </div>
                <div style="display:grid;gap:2px">
                    ${_bipLinha('Transportadora', transpNome, '#3a86ff')}
                    ${_bipLinha('Entregador', data.entregador || '⚠ Sem entregador atribuído', data.entregador ? '#f1f5f9' : '#fb923c')}
                    ${_bipLinha('Cidade',     data.cidade || '—', '#e2e8f0')}
                    ${data.bairro  ? _bipLinha('Bairro',       data.bairro,             '#94a3b8') : ''}
                    ${data.sigla   ? _bipLinha('Sigla / Rota', data.sigla,              '#fb923c') : ''}
                    ${data.cep     ? _bipLinha('CEP',          _bipFormatCep(data.cep), '#64748b') : ''}
                    ${data.destinatario ? _bipLinha('Destinatário', data.destinatario,  '#64748b') : ''}
                </div>
            </div>`;
    } catch {
        el.innerHTML = _bipErroHtml('Erro ao conectar ao servidor.');
    }
}

function _bipLoadingHtml() {
    return `<div style="display:flex;align-items:center;gap:10px;color:#64748b;font-size:14px;padding:16px 0">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0 0 20.49 15"/></svg>
        Buscando...</div>`;
}

function _bipErroHtml(msg) {
    return `<div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:12px">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        <span style="color:#ef4444;font-size:14px;font-weight:500">${msg}</span></div>`;
}

async function _bipSincronizarCeps() {
    const btn = document.getElementById('bip-sync-btn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0 0 20.49 15"/></svg> Sincronizando...`;
    try {
        const res  = await fetch(API + '/admin/sincronizar-ceps', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro');
        btn.innerHTML = `✓ ${data.total.toLocaleString('pt-BR')} CEPs sincronizados`;
        btn.style.borderColor = 'rgba(34,197,94,0.35)';
        btn.style.color       = '#22c55e';
        btn.style.background  = 'rgba(34,197,94,0.08)';
        setTimeout(() => { btn.innerHTML = orig; btn.style.borderColor=''; btn.style.color=''; btn.style.background=''; btn.disabled=false; }, 3000);
    } catch (err) {
        btn.innerHTML = `✗ ${err.message}`;
        btn.style.color = '#ef4444';
        setTimeout(() => { btn.innerHTML = orig; btn.style.color=''; btn.disabled=false; }, 3000);
    }
}

function _bipSelecionarInput() {
    const input = document.getElementById('bip-input');
    if (!input) return;
    input.focus();
    input.select();
}

const _TRANSP_NOMES = { loggi: 'Loggi', anjun: 'Anjun', jt: 'J&T Express', imile: 'Imile', shopee: 'Shopee' };

function _bipRenderCepCards(linhas) {
    return linhas.map(d => {
        const transpNome = _TRANSP_NOMES[d.transportadora] || d.transportadora || '—';
        return `
        <div style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:14px;padding:18px 20px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span style="font-size:13px;font-weight:700;color:#22c55e">CEP encontrado</span>
            </div>
            <div style="display:grid;gap:2px">
                ${_bipLinha('Transportadora', transpNome, '#3a86ff')}
                ${_bipLinha('Entregador', d.entregador || '⚠ Sem entregador atribuído', d.entregador ? '#f1f5f9' : '#fb923c')}
                ${_bipLinha('Cidade', d.cidade || '—', '#e2e8f0')}
                ${d.bairro ? _bipLinha('Bairro', d.bairro, '#94a3b8') : ''}
                ${d.sigla  ? _bipLinha('Sigla / Rota', d.sigla, '#fb923c') : ''}
            </div>
        </div>`;
    }).join('');
}

function _bipLinha(label, valor, corValor) {
    return `
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
            <span style="font-size:12px;color:#64748b;font-weight:500;white-space:nowrap">${label}</span>
            <span style="font-size:14px;font-weight:600;color:${corValor};text-align:right">${valor}</span>
        </div>`;
}

function _bipFormatCep(cep) {
    const c = String(cep).replace(/\D/g, '');
    return c.length === 8 ? c.slice(0,5) + '-' + c.slice(5) : cep;
}
