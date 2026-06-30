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
        <div class="ta-step">
            <div class="ta-step-num">${i + 1}</div>
            <div class="ta-step-body">
                <div class="ta-step-titulo">${p.titulo}</div>
                <div class="ta-step-desc">${p.desc}</div>
                ${p.link ? `<a class="ta-step-link" href="${p.link.href}" target="_blank" rel="noopener">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    ${p.link.label}
                </a>` : ""}
            </div>
        </div>`).join("");

    el.innerHTML = `
        <div class="ta-wrap">
            <div class="ta-transp-badge" style="color:${cfg.cor};border-color:${cfg.cor}40;background:${cfg.cor}12">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Torre de Controle · Alimentar
            </div>
            <div class="ta-titulo">${cfg.nome}</div>
            <div class="ta-sub">Siga os passos abaixo para baixar o relatório e enviá-lo para a planilha.</div>

            <div class="ta-steps">${passos}</div>

            <div class="ta-upload-zone" id="ta-zone" onclick="document.getElementById('ta-input').click()"
                ondragover="_taDragOver(event)" ondragleave="_taDragLeave(event)" ondrop="_taDrop(event)">
                <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#3a86ff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div class="ta-upload-title">Arraste o arquivo aqui</div>
                <div class="ta-upload-sub">ou clique para selecionar do computador</div>
                <div class="ta-upload-tipos">Aceita: .xlsx · .xls · .csv</div>
                <input type="file" id="ta-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="_taArquivoSelecionado(this.files[0])">
            </div>

            <div id="ta-file-info" style="display:none"></div>

            <button class="ta-btn-enviar" id="ta-btn-enviar" onclick="_taEnviar('${cfg.key}')" disabled>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Enviar para planilha
            </button>

            <div class="ta-msg ta-msg-ok"  id="ta-msg-ok">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span id="ta-msg-ok-txt">Planilha atualizada com sucesso!</span>
            </div>
            <div class="ta-msg ta-msg-err" id="ta-msg-err">
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
        <div class="ta-file-sel">
            <div class="ta-file-icon">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5d9aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style="flex:1;min-width:0">
                <div class="ta-file-nome">${f.name}</div>
                <div class="ta-file-size">${kb} KB</div>
            </div>
            <button class="ta-file-remover" onclick="_taRemoverArquivo()">✕</button>
        </div>`;
    document.getElementById("ta-btn-enviar").disabled = false;
    document.getElementById("ta-msg-ok").classList.remove("show");
    document.getElementById("ta-msg-err").classList.remove("show");
}

function _taRemoverArquivo() {
    _taArquivo = null;
    document.getElementById("ta-file-info").style.display = "none";
    document.getElementById("ta-input").value = "";
    document.getElementById("ta-btn-enviar").disabled = true;
}

async function _taEnviar(key) {
    if (!_taArquivo) return;
    const btn = document.getElementById("ta-btn-enviar");
    const txtOrig = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.25);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite"></div> Enviando...`;
    document.getElementById("ta-msg-ok").classList.remove("show");
    document.getElementById("ta-msg-err").classList.remove("show");

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
                `Planilha atualizada! ${data.linhas} linha${data.linhas !== 1 ? "s" : ""} importada${data.linhas !== 1 ? "s" : ""}.`;
            document.getElementById("ta-msg-ok").classList.add("show");
            _taRemoverArquivo();
        } else {
            document.getElementById("ta-msg-err-txt").innerText = data.error || "Erro ao enviar.";
            document.getElementById("ta-msg-err").classList.add("show");
        }
    } catch (err) {
        document.getElementById("ta-msg-err-txt").innerText = "Erro ao conectar com o servidor.";
        document.getElementById("ta-msg-err").classList.add("show");
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
