function abrirPesquisarPedidos(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-pesquisar-pedidos');
    document.getElementById('titulo-pagina').innerText = 'Pedidos';
    document.getElementById('ped-resultado').innerHTML = '';
    document.getElementById('ped-busca-input').value = '';
    document.getElementById('ped-busca-clear').style.display = 'none';
    setTimeout(() => document.getElementById('ped-busca-input').focus(), 200);
}

function _pedLimpar() {
    document.getElementById('ped-busca-input').value = '';
    document.getElementById('ped-busca-clear').style.display = 'none';
    document.getElementById('ped-resultado').innerHTML = '';
    document.getElementById('ped-busca-input').focus();
}

document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('ped-busca-input');
    if (input) input.addEventListener('input', () => {
        document.getElementById('ped-busca-clear').style.display = input.value ? '' : 'none';
    });
});

async function _pedBuscar() {
    const codigo = document.getElementById('ped-busca-input').value.trim();
    if (!codigo) return;

    const el = document.getElementById('ped-resultado');
    el.innerHTML = `<div style="color:#64748b;font-size:14px;padding:12px 0">Buscando...</div>`;

    try {
        const res  = await fetch(API + '/pedidos/buscar?codigo=' + encodeURIComponent(codigo), {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();

        if (!res.ok) {
            el.innerHTML = `
                <div style="background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.2);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:12px">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <span style="color:#ef4444;font-size:14px">${data.error}</span>
                </div>`;
            return;
        }

        const transpNomes = { loggi:'Loggi', anjun:'Anjun', jt:'J&T Express', imile:'Imile', shopee:'Shopee', cep:'CEP' };
        const transpCores = { loggi:'#12A5E8', anjun:'#22C55E', imile:'#9333EA', jt:'#EF4444', shopee:'#F97316', cep:'#94a3b8' };

        el.innerHTML = data.map((r, i) => {
            const cor       = transpCores[r.transportadora] || '#64748b';
            const transpNome= transpNomes[r.transportadora] || r.transportadora || '—';
            const dataHora  = r.bipado_em ? new Date(r.bipado_em).toLocaleString('pt-BR') : '—';
            const cepFmt    = r.cep ? r.cep.slice(0,5) + '-' + r.cep.slice(5) : '—';
            return `
            <div style="background:${cor}12;border:1px solid ${cor}30;border-radius:12px;padding:16px 18px;margin-bottom:10px">
                ${data.length > 1 ? `<div style="font-size:11px;color:#4a6a8a;margin-bottom:10px">Bipagem ${i+1} de ${data.length}</div>` : ''}
                <div style="display:grid;gap:3px">
                    ${_pedLinha('Código',        r.codigo        || '—', '#e2e8f0')}
                    ${_pedLinha('Transportadora', transpNome,              cor)}
                    ${_pedLinha('Entregador',     r.entregador    || '—', '#f1f5f9')}
                    ${_pedLinha('Cidade',         r.cidade        || '—', '#e2e8f0')}
                    ${_pedLinha('CEP',            cepFmt,                 '#94a3b8')}
                    ${_pedLinha('Bipado em',      dataHora,               '#64748b')}
                    ${_pedLinha('Bipado por',     r.usuario_nome  || '—', '#64748b')}
                </div>
            </div>`;
        }).join('');
    } catch {
        el.innerHTML = `<div style="color:#ef4444;font-size:14px;padding:12px 0">Erro ao conectar ao servidor.</div>`;
    }
}

function _pedLinha(label, valor, cor) {
    return `
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
            <span style="font-size:12px;color:#4a6a8a;font-weight:500;white-space:nowrap">${label}</span>
            <span style="font-size:13px;font-weight:600;color:${cor};text-align:right">${valor}</span>
        </div>`;
}
