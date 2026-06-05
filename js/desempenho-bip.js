function abrirDesempenhoBip(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-desempenho-bip');
    document.getElementById('titulo-pagina').innerText = 'Desempenho';
    _desempInicializarAnos();
    _desempCarregar();
}

function _desempInicializarAnos() {
    const sel = document.getElementById('desemp-ano');
    if (sel.options.length > 1) return;
    const ano = new Date().getFullYear();
    sel.innerHTML = '<option value="">Todos os anos</option>';
    for (let a = ano; a >= ano - 3; a--) {
        sel.innerHTML += `<option value="${a}"${a === ano ? ' selected' : ''}>${a}</option>`;
    }
    // Pré-seleciona mês atual
    document.getElementById('desemp-mes').value = String(new Date().getMonth() + 1);
}

async function _desempCarregar() {
    const mes = document.getElementById('desemp-mes').value;
    const ano = document.getElementById('desemp-ano').value;
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');

    emptyEl.innerText = 'Carregando...';
    emptyEl.style.display = '';
    contentEl.style.display = 'none';

    try {
        let url = API + '/bipagem/desempenho';
        if (mes && ano) url += `?mes=${mes}&ano=${ano}`;
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const meses = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const periodo = mes && ano ? `${meses[parseInt(mes)]} ${ano}` : 'Geral (todos os meses)';

        if (!data.length) {
            emptyEl.innerText = `Nenhuma bipagem em ${periodo}.`;
            return;
        }
        _desempRenderizar(data, periodo);
    } catch (err) {
        emptyEl.innerText = 'Erro: ' + err.message;
    }
}

function _desempRenderizar(rows, periodo) {
    const emptyEl   = document.getElementById('desemp-empty');
    const contentEl = document.getElementById('desemp-content');
    const rankEl    = document.getElementById('desemp-ranking');

    const maximo = rows[0].total;
    const cores  = { loggi:'#12A5E8', anjun:'#22C55E', jt:'#EF4444', imile:'#9333EA', shopee:'#F97316' };
    const nomes  = { loggi:'Loggi', anjun:'Anjun', jt:'J&T', imile:'Imile', shopee:'Shopee' };
    const transp = ['loggi','anjun','jt','imile','shopee'];
    const medalhas = ['🥇','🥈','🥉'];

    const totalGeral = rows.reduce((s, u) => s + u.total, 0);

    rankEl.innerHTML = `
        <div style="font-size:12px;color:#4a6a8a;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
            ${periodo} · ${totalGeral.toLocaleString('pt-BR')} bipagens no total · ${rows.length} operador${rows.length !== 1 ? 'es' : ''}
        </div>
        ${rows.map((u, i) => {
        const pct    = maximo > 0 ? (u.total / maximo * 100).toFixed(1) : 0;
        const pctTotal = totalGeral > 0 ? (u.total / totalGeral * 100).toFixed(0) : 0;
        const medal  = medalhas[i] || `${i+1}º`;

        const barras = transp.filter(t => u[t] > 0).map(t => `
            <div style="display:flex;align-items:center;gap:8px;margin-top:5px">
                <span style="width:7px;height:7px;border-radius:50%;background:${cores[t]};flex-shrink:0"></span>
                <span style="font-size:11px;color:#64748b;width:40px">${nomes[t]}</span>
                <div style="flex:1;background:rgba(255,255,255,0.04);border-radius:3px;height:5px;overflow:hidden">
                    <div style="width:${u.total>0?(u[t]/u.total*100).toFixed(1):0}%;height:100%;background:${cores[t]};border-radius:3px"></div>
                </div>
                <span style="font-size:11px;color:${cores[t]};font-weight:600;min-width:28px;text-align:right">${u[t].toLocaleString('pt-BR')}</span>
            </div>`).join('');

        return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;margin-bottom:10px">
            <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
                <span style="font-size:20px;width:30px;text-align:center">${medal}</span>
                <div style="flex:1;min-width:0">
                    <div style="font-size:14px;font-weight:700;color:#e2e8f0">${u.usuario_nome}</div>
                    <div style="font-size:11px;color:#4a6a8a;margin-top:1px">${pctTotal}% do total do período</div>
                </div>
                <div style="text-align:right">
                    <div style="font-size:26px;font-weight:700;color:#f1f5f9;line-height:1">${u.total.toLocaleString('pt-BR')}</div>
                    <div style="font-size:11px;color:#4a6a8a">pacotes</div>
                </div>
            </div>
            <div style="background:rgba(255,255,255,0.04);border-radius:4px;height:6px;overflow:hidden;margin-bottom:8px">
                <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#3a86ff,#60a5fa);border-radius:4px"></div>
            </div>
            ${barras}
        </div>`;
    }).join('')}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
