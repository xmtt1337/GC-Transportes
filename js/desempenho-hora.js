function abrirDesempenhoHora(event) {
    if (event) event.preventDefault();
    mostrarTela('tela-desempenho-hora');
    document.getElementById('titulo-pagina').innerText = 'Desempenho';
    const dataInput = document.getElementById('desemp-hora-data');
    if (!dataInput.value) {
        const hoje = new Date();
        const tz   = new Date(hoje.getTime() - hoje.getTimezoneOffset() * 60000);
        dataInput.value = tz.toISOString().slice(0, 10);
    }
    _desempHoraCarregar();
}

async function _desempHoraCarregar() {
    const data = document.getElementById('desemp-hora-data').value;
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');

    emptyEl.innerText = 'Carregando...';
    emptyEl.style.display = '';
    contentEl.style.display = 'none';

    if (!data) { emptyEl.innerText = 'Selecione uma data.'; return; }

    try {
        const url  = API + '/bipagem/desempenho-hora?data=' + data;
        const res  = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);

        if (!body.horas || !body.horas.length) {
            emptyEl.innerText = 'Nenhuma bipagem nesta data.';
            return;
        }
        _desempHoraRenderizar(body.horas, body.comparativo || [], data);
    } catch (err) {
        emptyEl.innerText = 'Erro: ' + err.message;
    }
}

// Compara um valor atual com uma base (ontem ou média histórica): verde se avançou, vermelho se não
function _desempHoraComparar(atual, base) {
    if (!base) return atual > 0 ? { texto: 'novo', cor: '#22c55e' } : { texto: '—', cor: '#4a6a8a' };
    const pct  = ((atual - base) / base) * 100;
    const cor  = pct >= 0 ? '#22c55e' : '#ef4444';
    const seta = pct >= 0 ? '▲' : '▼';
    return { texto: `${seta} ${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, cor };
}

function _desempHoraRenderizar(rows, comparativo, data) {
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');
    const listaEl   = document.getElementById('desemp-hora-lista');

    const compMap = {};
    comparativo.forEach(c => { compMap[c.usuario_nome] = c; });

    // Agrupa por usuário -> { hora: total }
    const usuarios = {};
    rows.forEach(r => {
        if (!usuarios[r.usuario_nome]) usuarios[r.usuario_nome] = {};
        usuarios[r.usuario_nome][r.hora] = r.total;
    });

    const nomes = Object.keys(usuarios).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

    listaEl.innerHTML = `
        <div style="font-size:12px;color:#4a6a8a;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
            ${dataFmt} · ${nomes.length} operador${nomes.length !== 1 ? 'es' : ''}
        </div>
        ${nomes.map(nome => {
            const horas    = usuarios[nome];
            // Só mostra as horas que de fato tiveram bipagem, sem preencher horas vazias
            const horasOrd = Object.keys(horas).map(Number).sort((a, b) => a - b);
            const totalDia = Object.values(horas).reduce((a, b) => a + b, 0);
            const maxHora  = Math.max(...Object.values(horas), 1);

            const c = compMap[nome] || {};
            // Média por hora considera apenas o intervalo entre a primeira e a última bipagem do dia
            const mediaHora      = c.hoje_horas  > 0 ? totalDia      / c.hoje_horas  : 0;
            const ontemMediaHora = c.ontem_horas > 0 ? c.ontem_total / c.ontem_horas : null;
            const histMediaDia   = c.hist_dias   > 0 ? c.hist_total  / c.hist_dias   : null;
            const histMediaHora  = c.hist_horas  > 0 ? c.hist_total  / c.hist_horas  : null;

            const cmpOntemQtd   = _desempHoraComparar(totalDia,  c.ontem_total);
            const cmpOntemMedia = _desempHoraComparar(mediaHora, ontemMediaHora);
            const cmpHistQtd    = _desempHoraComparar(totalDia,  histMediaDia);
            const cmpHistMedia  = _desempHoraComparar(mediaHora, histMediaHora);

            const horasHtml = horasOrd.map(h => {
                const qtd = horas[h];
                const pct = Math.max((qtd / maxHora * 100), 8);
                return `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0">
                    <div style="font-size:10px;color:#cbd5e1;font-weight:600">${qtd}</div>
                    <div style="width:100%;height:64px;display:flex;align-items:flex-end;background:rgba(255,255,255,0.03);border-radius:4px;overflow:hidden">
                        <div style="width:100%;height:${pct}%;background:linear-gradient(180deg,#60a5fa,#3a86ff);border-radius:4px 4px 0 0"></div>
                    </div>
                    <div style="font-size:9px;color:#4a6a8a">${String(h).padStart(2, '0')}h</div>
                </div>`;
            }).join('');

            return `
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;margin-bottom:10px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:16px;flex-wrap:wrap">
                    <div style="font-size:14px;font-weight:700;color:#e2e8f0">${nome}</div>
                    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
                        <div style="text-align:right">
                            <div style="font-size:20px;font-weight:700;color:#f1f5f9;line-height:1">${totalDia.toLocaleString('pt-BR')}</div>
                            <div style="font-size:11px;color:#4a6a8a">no dia</div>
                        </div>
                        <div style="text-align:right">
                            <div style="font-size:20px;font-weight:700;color:#f1f5f9;line-height:1">${mediaHora.toFixed(1)}</div>
                            <div style="font-size:11px;color:#4a6a8a">média/h</div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:4px;font-size:11px;font-weight:600">
                            <div style="white-space:nowrap">
                                <span style="color:#4a6a8a;font-weight:500">vs ontem:</span>
                                <span style="color:${cmpOntemQtd.cor};margin-left:4px">${cmpOntemQtd.texto} qtd</span>
                                <span style="color:${cmpOntemMedia.cor};margin-left:6px">${cmpOntemMedia.texto} méd</span>
                            </div>
                            <div style="white-space:nowrap">
                                <span style="color:#4a6a8a;font-weight:500">vs histórico:</span>
                                <span style="color:${cmpHistQtd.cor};margin-left:4px">${cmpHistQtd.texto} qtd</span>
                                <span style="color:${cmpHistMedia.cor};margin-left:6px">${cmpHistMedia.texto} méd</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:4px">${horasHtml}</div>
            </div>`;
        }).join('')}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
