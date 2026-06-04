let _bipTimeout = null;

function abrirBipagens() {
    mostrarTela('tela-bipagens');
    document.getElementById('titulo-pagina').innerText = 'Bipagens';
    document.getElementById('bip-resultado').innerHTML = '';
    document.getElementById('bip-input').value = '';
    document.getElementById('bip-clear').style.display = 'none';
    setTimeout(() => document.getElementById('bip-input').focus(), 250);
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

async function _bipBuscar() {
    clearTimeout(_bipTimeout);
    const codigo = document.getElementById('bip-input').value.trim();
    if (!codigo) return;

    const el = document.getElementById('bip-resultado');
    el.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;color:#64748b;font-size:14px;padding:16px 0">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.36-3.36L23 10M1 14l5.13 4.36A9 9 0 0 0 20.49 15"/></svg>
            Buscando...
        </div>`;

    try {
        const res = await fetch(API + '/bipagem/buscar?codigo=' + encodeURIComponent(codigo), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!res.ok) {
            el.innerHTML = `
                <div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:12px">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <span style="color:#ef4444;font-size:14px;font-weight:500">${data.error || 'Código não encontrado'}</span>
                </div>`;
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
                    ${_bipLinha('Transportadora', transpNome,              '#3a86ff')}
                    ${_bipLinha('Entregador',     data.entregador || '—',  '#f1f5f9')}
                    ${_bipLinha('Cidade',         data.cidade     || '—',  '#e2e8f0')}
                    ${data.bairro  ? _bipLinha('Bairro',       data.bairro,             '#94a3b8') : ''}
                    ${data.sigla   ? _bipLinha('Sigla / Rota', data.sigla,              '#fb923c') : ''}
                    ${data.cep     ? _bipLinha('CEP',          _bipFormatCep(data.cep), '#64748b') : ''}
                    ${data.destinatario ? _bipLinha('Destinatário', data.destinatario,  '#64748b') : ''}
                </div>
            </div>`;
    } catch {
        el.innerHTML = `<div style="color:#ef4444;font-size:14px;padding:12px 0">Erro ao conectar ao servidor.</div>`;
    }
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
