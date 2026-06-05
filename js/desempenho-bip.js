function abrirDesempenhoBip(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-desempenho-bip');
    document.getElementById('titulo-pagina').innerText = 'Desempenho';
    _desempCarregar();
}

function _desempLimparFiltro() {
    document.getElementById('desemp-de').value  = '';
    document.getElementById('desemp-ate').value = '';
    _desempCarregar();
}

async function _desempCarregar() {
    const de  = document.getElementById('desemp-de').value;
    const ate = document.getElementById('desemp-ate').value;
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');

    emptyEl.innerText = 'Carregando...';
    emptyEl.style.display = '';
    contentEl.style.display = 'none';

    try {
        let url = API + '/bipagem/desempenho';
        if (de && ate) url += `?de=${de}&ate=${ate}`;
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!data.length) { emptyEl.innerText = 'Nenhuma bipagem no período.'; return; }
        _desempRenderizar(data);
    } catch (err) {
        emptyEl.innerText = 'Erro: ' + err.message;
    }
}

function _desempRenderizar(rows) {
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');
    const rankEl    = document.getElementById('desemp-ranking');

    const maximo = rows[0].total;
    const cores  = { loggi:'#12A5E8', anjun:'#22C55E', jt:'#EF4444', imile:'#9333EA', shopee:'#F97316' };
    const nomes  = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };
    const transp = ['loggi','anjun','jt','imile','shopee'];

    const medalhas = ['🥇','🥈','🥉'];

    rankEl.innerHTML = rows.map((u, i) => {
        const pct   = maximo > 0 ? (u.total / maximo * 100).toFixed(1) : 0;
        const medal = medalhas[i] || `${i+1}º`;

        const barras = transp.filter(t => u[t] > 0).map(t => `
            <div style="display:flex;align-items:center;gap:8px;margin-top:5px">
                <span style="width:7px;height:7px;border-radius:50%;background:${cores[t]};flex-shrink:0"></span>
                <span style="font-size:11px;color:#64748b;width:44px">${nomes[t]}</span>
                <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:3px;height:5px;overflow:hidden">
                    <div style="width:${u.total>0?(u[t]/u.total*100).toFixed(1):0}%;height:100%;background:${cores[t]};border-radius:3px"></div>
                </div>
                <span style="font-size:11px;color:${cores[t]};font-weight:600;min-width:28px;text-align:right">${u[t].toLocaleString('pt-BR')}</span>
            </div>`).join('');

        return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:12px">
                <span style="font-size:22px;width:32px;text-align:center">${medal}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.usuario_nome}</div>
                    <div style="font-size:11px;color:#4a6a8a;margin-top:2px">${u.total.toLocaleString('pt-BR')} pacote${u.total !== 1 ? 's' : ''} bipado${u.total !== 1 ? 's' : ''}</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:24px;font-weight:700;color:#f1f5f9">${u.total.toLocaleString('pt-BR')}</div>
                    <div style="font-size:11px;color:#4a6a8a">${pct}% do líder</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:6px;overflow:hidden;margin-bottom:${barras ? '10px' : '0'}">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#3a86ff,#60a5fa);border-radius:4px;transition:width 0.5s ease"></div>
            </div>
            ${barras}
        </div>`;
    }).join('');

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
