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
        const rows = await res.json();
        if (!res.ok) throw new Error(rows.error);

        if (!rows.length) {
            emptyEl.innerText = 'Nenhuma bipagem nesta data.';
            return;
        }
        _desempHoraRenderizar(rows, data);
    } catch (err) {
        emptyEl.innerText = 'Erro: ' + err.message;
    }
}

function _desempHoraRenderizar(rows, data) {
    const emptyEl   = document.getElementById('desemp-hora-empty');
    const contentEl = document.getElementById('desemp-hora-content');
    const listaEl   = document.getElementById('desemp-hora-lista');

    // Agrupa por usuário -> { hora: total }
    const usuarios = {};
    rows.forEach(r => {
        if (!usuarios[r.usuario_nome]) usuarios[r.usuario_nome] = {};
        usuarios[r.usuario_nome][r.hora] = r.total;
    });

    const nomes = Object.keys(usuarios).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    // Janela de horas exibida: da primeira à última hora com bipagem no dia (mín. 6h-22h)
    const horasComDado = rows.map(r => r.hora);
    const horaInicio = Math.min(6, ...horasComDado);
    const horaFim    = Math.max(22, ...horasComDado);

    const dataFmt = new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

    listaEl.innerHTML = `
        <div style="font-size:12px;color:#4a6a8a;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px">
            ${dataFmt} · ${nomes.length} operador${nomes.length !== 1 ? 'es' : ''}
        </div>
        ${nomes.map(nome => {
            const horas    = usuarios[nome];
            const totalDia = Object.values(horas).reduce((a, b) => a + b, 0);
            const maxHora  = Math.max(...Object.values(horas), 1);

            let horasHtml = '';
            for (let h = horaInicio; h <= horaFim; h++) {
                const qtd = horas[h] || 0;
                const pct = qtd > 0 ? Math.max((qtd / maxHora * 100), 8) : 0;
                horasHtml += `
                <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;min-width:0">
                    <div style="font-size:10px;color:${qtd > 0 ? '#cbd5e1' : '#3a4a5e'};font-weight:600">${qtd || ''}</div>
                    <div style="width:100%;height:64px;display:flex;align-items:flex-end;background:rgba(255,255,255,0.03);border-radius:4px;overflow:hidden">
                        <div style="width:100%;height:${pct}%;background:${qtd > 0 ? 'linear-gradient(180deg,#60a5fa,#3a86ff)' : 'transparent'};border-radius:4px 4px 0 0"></div>
                    </div>
                    <div style="font-size:9px;color:#4a6a8a">${String(h).padStart(2, '0')}h</div>
                </div>`;
            }

            return `
            <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:16px 20px;margin-bottom:10px">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
                    <div style="font-size:14px;font-weight:700;color:#e2e8f0">${nome}</div>
                    <div style="text-align:right">
                        <div style="font-size:20px;font-weight:700;color:#f1f5f9;line-height:1">${totalDia.toLocaleString('pt-BR')}</div>
                        <div style="font-size:11px;color:#4a6a8a">no dia</div>
                    </div>
                </div>
                <div style="display:flex;gap:4px">${horasHtml}</div>
            </div>`;
        }).join('')}`;

    emptyEl.style.display = 'none';
    contentEl.style.display = '';
}
