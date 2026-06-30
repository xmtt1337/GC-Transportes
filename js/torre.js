const _TORRE_ALIMENTAR = {
    anjun: {
        nome: "Anjun Express",
        cor:  "#22C55E",
        key:  "anjun",
        passos: [
            {
                titulo: "Acesse o portal da Anjun",
                desc:   "Abra o link abaixo no navegador e faça login com suas credenciais.",
                link:   { href: "https://newsupplier.anjunexpress.com/#/views/packageCenter/packageQuery", label: "Abrir portal Anjun" },
            },
            {
                titulo: "Vá em 'Tempo de Criação'",
                desc:   "No painel de filtros, localize e clique na opção 'Tempo de Criação'.",
            },
            {
                titulo: "Selecione 'Tempo de entrada no ponto'",
                desc:   "No menu que abrir, escolha a opção 'Tempo de entrada no ponto'.",
            },
            {
                titulo: "Defina o período",
                desc:   "No campo de data, selecione o intervalo de um mês atrás até hoje.",
            },
            {
                titulo: "Busque e exporte",
                desc:   "Clique em 'Buscar' para carregar os resultados. Em seguida, clique em 'Exportar Tudo' e aguarde o download.",
            },
            {
                titulo: "Anexe o arquivo abaixo",
                desc:   "Arraste o arquivo baixado para a área abaixo, ou clique para selecionar.",
            },
        ],
    },
};

let _taArquivo = null;

function abrirTorreAlimentar(event, key) {
    if (event) event.preventDefault();
    const cfg = _TORRE_ALIMENTAR[key];
    if (!cfg) { _emBreve(event); return; }

    _taArquivo = null;
    mostrarTela("tela-torre-alimentar");
    if (document.getElementById("titulo-pagina"))
        document.getElementById("titulo-pagina").innerText = cfg.nome;

    _taRenderizar(cfg);
}

function _taRenderizar(cfg) {
    const el = document.getElementById("ta-conteudo");
    if (!el) return;

    const passos = cfg.passos.map((p, i) => `
        <div style="display:flex;gap:16px;align-items:flex-start;background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.055);border-radius:12px;padding:14px 16px">
            <div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:rgba(58,134,255,0.15);border:1.5px solid rgba(58,134,255,0.3);color:#5d9aff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${i + 1}</div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13.5px;font-weight:700;color:#e2e8f0;margin-bottom:3px">${p.titulo}</div>
                <div style="font-size:12.5px;color:#4a6a8a;line-height:1.5">${p.desc}</div>
                ${p.link ? `<a href="${p.link.href}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 12px;border-radius:8px;background:rgba(58,134,255,0.1);border:1px solid rgba(58,134,255,0.25);color:#5d9aff;font-size:12px;font-weight:600;text-decoration:none">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    ${p.link.label}
                </a>` : ""}
            </div>
        </div>`).join("");

    el.innerHTML = `
        <div style="max-width:680px;margin:0 auto;padding:4px 0 40px">
            <div style="font-size:24px;font-weight:800;color:#f1f5f9;letter-spacing:-0.4px;margin-bottom:6px">${cfg.nome}</div>
            <div style="font-size:13.5px;color:#4a6a8a;margin-bottom:28px;line-height:1.5">Siga os passos abaixo para baixar o relatório e enviá-lo para a base.</div>

            <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:28px">${passos}</div>

            <div id="ta-zone" onclick="document.getElementById('ta-input').click()"
                ondragover="_taDragOver(event)" ondragleave="_taDragLeave(event)" ondrop="_taDrop(event)"
                style="border:2px dashed rgba(58,134,255,0.3);border-radius:16px;background:rgba(58,134,255,0.04);padding:40px 24px;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#3a86ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.45;display:block;margin:0 auto 14px">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div style="font-size:15px;font-weight:600;color:#cbd5e1;margin-bottom:5px">Arraste o arquivo aqui</div>
                <div style="font-size:12.5px;color:#334155">ou clique para selecionar do computador</div>
                <div style="font-size:11px;color:#1e2e40;margin-top:6px">Aceita: .xlsx · .xls · .csv</div>
                <input type="file" id="ta-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="_taArquivoSelecionado(this.files[0])">
            </div>

            <div id="ta-file-info" style="display:none"></div>

            <button id="ta-btn-enviar" onclick="_taEnviar('${cfg.key}')" disabled
                style="width:100%;margin-top:16px;padding:14px;background:#3a86ff;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;opacity:0.45;transition:opacity 0.2s,transform 0.1s">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Enviar relatório
            </button>

            <div id="ta-msg-ok" style="display:none;align-items:center;gap:10px;margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.2);color:#34d399;font-size:13px;font-weight:500">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span id="ta-msg-ok-txt">Relatório enviado com sucesso!</span>
            </div>
            <div id="ta-msg-err" style="display:none;align-items:center;gap:10px;margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.18);color:#f87171;font-size:13px;font-weight:500">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span id="ta-msg-err-txt">Erro ao enviar.</span>
            </div>
        </div>`;
}

function _taDragOver(e) {
    e.preventDefault();
    document.getElementById("ta-zone").classList.add("drag-over");
}
function _taDragLeave(e) {
    document.getElementById("ta-zone").classList.remove("drag-over");
}
function _taDrop(e) {
    e.preventDefault();
    document.getElementById("ta-zone").classList.remove("drag-over");
    const f = e.dataTransfer.files[0];
    if (f) _taArquivoSelecionado(f);
}

function _taArquivoSelecionado(f) {
    if (!f) return;
    _taArquivo = f;
    const kb = (f.size / 1024).toFixed(1);
    const info = document.getElementById("ta-file-info");
    info.style.display = "";
    info.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:12px 16px;margin-top:16px">
            <div style="flex-shrink:0;width:36px;height:36px;border-radius:9px;background:rgba(58,134,255,0.12);display:flex;align-items:center;justify-content:center">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5d9aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
                <div style="font-size:11.5px;color:#4a6a8a;margin-top:2px">${kb} KB</div>
            </div>
            <button onclick="_taRemoverArquivo()" style="background:none;border:none;color:#4a6a8a;cursor:pointer;font-size:18px;line-height:1;padding:0 4px">✕</button>
        </div>`;
    const btn = document.getElementById("ta-btn-enviar");
    btn.disabled = false;
    btn.style.opacity = "1";
    document.getElementById("ta-msg-ok").style.display = "none";
    document.getElementById("ta-msg-err").style.display = "none";
}

function _taRemoverArquivo() {
    _taArquivo = null;
    document.getElementById("ta-file-info").style.display = "none";
    document.getElementById("ta-input").value = "";
    const btn = document.getElementById("ta-btn-enviar");
    btn.disabled = true;
    btn.style.opacity = "0.45";
}

async function _taEnviar(key) {
    if (!_taArquivo) return;
    const btn = document.getElementById("ta-btn-enviar");
    const txtOrig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite"></div> Enviando...`;
    document.getElementById("ta-msg-ok").style.display = "none";
    document.getElementById("ta-msg-err").style.display = "none";

    try {
        const base64 = await _taLerBase64(_taArquivo);
        const res = await fetch(API + "/torre-controle/alimentar", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({ transportadora: key, nome_arquivo: _taArquivo.name, dados_base64: base64 }),
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById("ta-msg-ok-txt").innerText =
                `Relatório enviado! ${data.linhas} linha${data.linhas !== 1 ? "s" : ""} importada${data.linhas !== 1 ? "s" : ""}.`;
            document.getElementById("ta-msg-ok").style.display = "flex";
            _taRemoverArquivo();
        } else {
            document.getElementById("ta-msg-err-txt").innerText = data.error || "Erro ao enviar.";
            document.getElementById("ta-msg-err").style.display = "flex";
        }
    } catch (err) {
        document.getElementById("ta-msg-err-txt").innerText = "Erro ao conectar com o servidor.";
        document.getElementById("ta-msg-err").style.display = "flex";
    }

    btn.disabled = true;
    btn.innerHTML = txtOrig;
}

function _taLerBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
