// ───── TELA GERADOR DE FATURAS (Financeiro) ─────
// Lote: PO + planilha (operação | prefeitura nfse | cnpj tomador | Total).
// Sai uma fatura por linha com prefeitura nfse = "Fatura"; o backend lê a
// planilha e acha o endereço de cada CNPJ, aqui só mostramos a prévia.
//
// A planilha da PO tem ~100 filiais da SHPX. Por isso tudo que demora é
// feito em pedaços com progresso na tela: os CNPJs sem CT-e vão à Receita um
// por um (3 de cada vez) e a geração vai em blocos de FAT_BLOCO faturas.

let _fatGrid = null;      // planilha crua, reenviada na geração
let _fatPrevia = null;    // resposta de /faturas/lote/previa (itens vão sendo completados)
let _fatSeq = 0;          // trocou de planilha no meio da busca → descarta a busca antiga
let _fatGerando = false;

const FAT_BLOCO = 5;
const FAT_RECEITA_PARALELO = 3;

function abrirGeradorFaturas(event) {
    if (event) event.preventDefault();
    _fatLimparMsg();
    _fatLimparPlanilha();
    document.getElementById("fat-referencia").value = "";
    document.getElementById("fat-emissao").value = _fatHojeISO();
    document.getElementById("fat-numero").value = "";
    mostrarTela("tela-faturas");
    _fatCarregarHistorico();
    _fatCarregarPOs();
    _fatSugerirNumero();

    const area = document.getElementById("fat-upload-area");
    area.ondragover  = e => { e.preventDefault(); area.classList.add("drag-over"); };
    area.ondragleave = () => area.classList.remove("drag-over");
    area.ondrop      = e => {
        e.preventDefault();
        area.classList.remove("drag-over");
        if (e.dataTransfer.files[0]) _fatLerArquivo(e.dataTransfer.files[0]);
    };
}

// Local do navegador, de propósito — evita o desvio de "toISOString()", que
// converte pra UTC e pode devolver o dia de ontem/amanhã dependendo do fuso.
function _fatHojeISO() {
    const hoje = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}`;
}

function _fatFormatarDataBR(iso) {
    if (!iso) return "—";
    const [y, m, d] = String(iso).slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
}

function _fatEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _fatCnpj(d) {
    d = String(d || "");
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
}

function _fatLimparMsg() {
    const el = document.getElementById("fat-form-msg");
    el.style.display = "none"; el.innerHTML = "";
}

function _fatMostrarMsg(msg, tipo) {
    const el = document.getElementById("fat-form-msg");
    const cor = tipo === "erro" ? "#ef4444" : tipo === "aviso" ? "#eab308" : "#22c55e";
    el.style.cssText = `display:block;padding:10px 14px;border-radius:9px;background:${cor}14;border:1px solid ${cor}33;color:${cor};font-size:13px;margin-bottom:14px`;
    el.innerHTML = msg;
}

function _fatProgresso(texto, feito, total) {
    const wrap = document.getElementById("fat-progresso");
    if (texto === null) { wrap.style.display = "none"; return; }
    wrap.style.display = "";
    document.getElementById("fat-progresso-txt").innerText = texto;
    const pct = total ? Math.round((feito / total) * 100) : 0;
    document.getElementById("fat-progresso-barra").style.width = pct + "%";
}

function _fatSugerirNumero() {
    fetch(`${API}/faturas/proximo-numero`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        const campo = document.getElementById("fat-numero");
        if (d.numero && !campo.value) {
            campo.value = d.numero;
            if (_fatPrevia) _fatRenderPrevia();
        }
    })
    .catch(() => {});
}

// ── Planilha ──

function _fatLimparPlanilha() {
    _fatSeq++;
    _fatGrid = null;
    _fatPrevia = null;
    document.getElementById("fat-previa").style.display = "none";
    document.getElementById("fat-previa-tbody").innerHTML = "";
    document.getElementById("fat-sub").innerText =
        "Colunas: operação · prefeitura nfse · cnpj tomador · Total — só entram as linhas com prefeitura nfse = Fatura";
    _fatProgresso(null);
    const btn = document.getElementById("fat-gerar-btn");
    btn.disabled = true;
    btn.innerText = "Gerar faturas";
}

function _fatArquivo(input) {
    if (input.files[0]) _fatLerArquivo(input.files[0]);
    input.value = "";
}

async function _fatLerArquivo(file) {
    if (_fatGerando) return;
    _fatLimparMsg();
    _fatLimparPlanilha();
    document.getElementById("fat-sub").innerText = `Lendo ${file.name}...`;
    try {
        _fatGrid = await _fatLerGrid(file);
        document.getElementById("fat-sub").innerText = file.name;
        await _fatRefazerPrevia();
    } catch (err) {
        _fatLimparPlanilha();
        _fatMostrarMsg("Não foi possível ler o arquivo: " + _fatEsc(err.message), "erro");
    }
}

// raw:true de propósito: com raw:false o Excel devolve o CNPJ como "4,24463E+13"
// quando a célula está em formato Geral — os dígitos se perdem.
function _fatLerGrid(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const data = new Uint8Array(e.target.result);
                const wb = file.name.toLowerCase().endsWith(".csv")
                    ? XLSX.read(new TextDecoder("utf-8").decode(data), { type: "string", raw: true })
                    : XLSX.read(data, { type: "array" });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error("falha ao abrir o arquivo"));
        reader.readAsArrayBuffer(file);
    });
}

async function _fatRefazerPrevia() {
    if (!_fatGrid || _fatGerando) return;
    const seq = ++_fatSeq;
    document.getElementById("fat-gerar-btn").disabled = true;
    document.getElementById("fat-previa").style.display = "none";
    _fatProgresso("Lendo a planilha e buscando os endereços nos CT-e...", 0, 1);
    try {
        const r = await fetch(`${API}/faturas/lote/previa`, {
            method: "POST",
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ grid: _fatGrid, referencia: document.getElementById("fat-referencia").value.trim() })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erro ao ler a planilha.");
        if (seq !== _fatSeq) return;
        _fatPrevia = d;
        document.getElementById("fat-previa").style.display = "";
        _fatRenderPrevia();
        await _fatBuscarPendentes(seq);
    } catch (err) {
        if (seq !== _fatSeq) return;
        _fatProgresso(null);
        document.getElementById("fat-previa").style.display = "none";
        _fatMostrarMsg(_fatEsc(err.message), "erro");
    }
}

// CNPJs sem CT-e: um por um na Receita, preenchendo a tabela conforme chegam.
async function _fatBuscarPendentes(seq) {
    const pendentes = [...new Set(_fatPrevia.itens.filter(it => it.pendente).map(it => it.cnpj))];
    const doCte = new Set(_fatPrevia.itens.filter(it => it.origem === "cte").map(it => it.cnpj)).size;
    if (!pendentes.length) { _fatProgresso(null); _fatRenderPrevia(); return; }

    let feitos = 0;
    const atualizar = () => _fatProgresso(
        `${doCte} endereço(s) achados nos CT-e · consultando a Receita: ${feitos} de ${pendentes.length}`,
        feitos, pendentes.length
    );
    atualizar();

    const fila = pendentes.slice();
    const trabalhador = async () => {
        while (fila.length) {
            const cnpj = fila.shift();
            let res = await _fatConsultarReceita(cnpj);
            if (res.erro) {   // a BrasilAPI às vezes recusa por excesso de pedidos — tenta mais uma vez
                await new Promise(ok => setTimeout(ok, 1500));
                res = await _fatConsultarReceita(cnpj);
            }
            if (seq !== _fatSeq) return;
            for (const it of _fatPrevia.itens) {
                if (it.cnpj !== cnpj) continue;
                it.pendente = false;
                it.sacado = res.sacado || null;
                it.origem = res.origem || null;
                it.erro = res.erro || null;
            }
            feitos++;
            atualizar();
            _fatRenderPrevia();
        }
    };
    await Promise.all(Array.from({ length: FAT_RECEITA_PARALELO }, trabalhador));
    if (seq !== _fatSeq) return;
    _fatProgresso(null);
    _fatRenderPrevia();
}

function _fatConsultarReceita(cnpj) {
    return fetch(`${API}/faturas/sacado/${cnpj}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json())
        .then(d => d.error ? { erro: d.error } : d)
        .catch(() => ({ erro: "sem resposta do servidor" }));
}

function _fatRenderPrevia() {
    const { itens, ignoradas, erros } = _fatPrevia;
    const numeroInicial = document.getElementById("fat-numero").value.trim();

    document.getElementById("fat-previa-tbody").innerHTML = itens.map((it, i) => {
        const s = it.sacado;
        const avisos = [];
        if (it.origem === "receita") avisos.push("sem CT-e — endereço da Receita, confira");
        if (it.ja_gerada) avisos.push("já tem fatura desta PO pra esse CNPJ");
        const aviso = avisos.length ? `<div style="color:#eab308;font-size:11px;margin-top:2px">${_fatEsc(avisos.join(" · "))}</div>` : "";
        let endereco;
        if (s) endereco = `${_fatEsc(s.enderecoCobranca)} — ${_fatEsc(s.bairro)}, ${_fatEsc(s.cidade)}/${_fatEsc(s.estado)} — CEP ${_fatEsc(s.cep)}`;
        else if (it.pendente) endereco = `<span style="color:#8494a9">sem CT-e — consultando a Receita...</span>`;
        else endereco = `<span style="color:#ef4444">${_fatEsc(it.erro)}</span>`;
        return `<tr>
            <td>${_fatEsc(_fatNumeroDaLinha(numeroInicial, i))}</td>
            <td>${_fatEsc(it.operacao || "—")}</td>
            <td>${s ? _fatEsc(s.nome) : "—"}<div style="color:#8494a9;font-size:11px">${_fatEsc(_fatCnpj(it.cnpj))}</div></td>
            <td>${endereco}${aviso}</td>
            <td class="pag-valor">${moedaJS(it.valor)}</td>
        </tr>`;
    }).join("") || `<tr><td colspan="5" style="color:#8494a9">Nenhuma linha com prefeitura nfse = Fatura.</td></tr>`;

    const total = itens.reduce((s, it) => s + it.valor, 0);
    const partes = [`${itens.length} fatura(s) · total ${moedaJS(total)}`];
    if (ignoradas) partes.push(`${ignoradas} linha(s) de outra prefeitura ignorada(s)`);
    document.getElementById("fat-previa-rodape").innerText = partes.join(" · ");

    const pendentes = itens.filter(it => it.pendente).length;
    const semEndereco = itens.filter(it => !it.sacado && !it.pendente).length;
    if (erros.length) {
        _fatMostrarMsg("Corrija a planilha: " + erros.map(e => `linha ${e.linha} — ${_fatEsc(e.motivo)}`).join("; "), "erro");
    } else if (semEndereco) {
        _fatMostrarMsg(`${semEndereco} CNPJ(s) sem endereço — não dá pra gerar enquanto faltar. Anexe a planilha de novo pra tentar outra vez.`, "erro");
    } else {
        _fatLimparMsg();
    }

    const btn = document.getElementById("fat-gerar-btn");
    if (_fatGerando) return;
    btn.disabled = !itens.length || erros.length > 0 || semEndereco > 0 || pendentes > 0;
    btn.innerText = itens.length ? `Gerar ${itens.length} fatura(s)` : "Gerar faturas";
}

// Espelha numeroSequencial do backend (modules/faturas/lote.js) só pra prévia.
function _fatNumeroDaLinha(inicial, i) {
    const m = /^(.*?)(\d+)$/.exec(inicial);
    if (!m) return i === 0 ? inicial : "—";
    return m[1] + String(Number(m[2]) + i).padStart(m[2].length, "0");
}

// ── Geração (em blocos, com progresso) ──

async function _fatGerar() {
    const referencia = document.getElementById("fat-referencia").value.trim();
    const emissaoISO = document.getElementById("fat-emissao").value;
    const numero     = document.getElementById("fat-numero").value.trim();

    if (!referencia) return _fatMostrarMsg("Informe a PO.", "erro");
    if (!emissaoISO) return _fatMostrarMsg("Informe a data de emissão.", "erro");
    if (!numero)     return _fatMostrarMsg("Informe o nº da primeira fatura.", "erro");
    if (!_fatGrid || !_fatPrevia) return _fatMostrarMsg("Anexe a planilha.", "erro");

    const btn = document.getElementById("fat-gerar-btn");
    const total = _fatPrevia.itens.length;
    _fatGerando = true;
    btn.disabled = true;
    btn.innerText = "Gerando...";
    _fatLimparMsg();

    let geradas = 0;
    try {
        for (let de = 0; de < total; de += FAT_BLOCO) {
            _fatProgresso(`Gerando faturas: ${geradas} de ${total}`, geradas, total);
            const r = await fetch(`${API}/faturas/lote/gerar`, {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ referencia, data_emissao: emissaoISO, numero_inicial: numero, grid: _fatGrid, de, ate: de + FAT_BLOCO })
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || "Erro ao gerar as faturas.");
            geradas += d.faturas.length;
        }
        _fatProgresso(null);
        _fatGerando = false;
        _fatLimparPlanilha();
        document.getElementById("fat-numero").value = "";
        _fatMostrarMsg(
            `${geradas} fatura(s) gerada(s) da PO ${_fatEsc(referencia)}. ` +
            `<a href="#" onclick="_fatBaixarPO(${_fatEsc(JSON.stringify(referencia))});return false" style="color:inherit;text-decoration:underline">Baixar todas</a>`,
            "sucesso"
        );
        _fatCarregarHistorico();
        _fatCarregarPOs(referencia);
        _fatSugerirNumero();
    } catch (err) {
        _fatGerando = false;
        _fatProgresso(null);
        const parcial = geradas ? ` ${geradas} de ${total} já foram geradas e estão no histórico.` : "";
        _fatMostrarMsg(_fatEsc(err.message || "Erro ao gerar as faturas.") + parcial, "erro");
        btn.disabled = false;
        btn.innerText = `Gerar ${total} fatura(s)`;
    }
}

// ── Baixar PO (todas as faturas numa pasta com o nome da PO) ──

function _fatCarregarPOs(selecionar) {
    fetch(`${API}/faturas/pos`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(pos => {
        if (!Array.isArray(pos)) return;
        const sel = document.getElementById("fat-po-sel");
        const atual = selecionar || sel.value;
        sel.innerHTML = pos.map(p =>
            `<option value="${_fatEsc(p.referencia)}">${_fatEsc(p.referencia)} — ${p.qtd} fatura(s)</option>`
        ).join("") || `<option value="">Nenhuma PO</option>`;
        if (atual && pos.some(p => p.referencia === atual)) sel.value = atual;
    })
    .catch(() => {});
}

function _fatNomePasta(s) {
    return String(s).replace(/[\\/:*?"<>|]/g, "-").trim() || "faturas";
}

// Chrome/Edge: a pessoa escolhe onde salvar e a pasta da PO é criada lá
// dentro. Outros navegadores: um .zip com a pasta da PO dentro.
// O seletor de pasta precisa ser aberto ANTES de qualquer await de rede — o
// navegador só permite em resposta direta ao clique.
async function _fatBaixarPO(referencia) {
    referencia = referencia || document.getElementById("fat-po-sel").value;
    if (!referencia) return gcAlert("Escolha a PO.");
    const pasta = _fatNomePasta(referencia);

    let destino = null;
    if (window.showDirectoryPicker) {
        try {
            destino = await window.showDirectoryPicker({ id: "faturas-po", mode: "readwrite" });
        } catch (err) {
            if (err && err.name === "AbortError") return; // cancelou a escolha
            destino = null;
        }
    }

    const btn = document.getElementById("fat-po-btn");
    const textoOriginal = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Baixando...";
    try {
        const r = await fetch(`${API}/faturas/po/pdfs?referencia=${encodeURIComponent(referencia)}`,
            { headers: { "Authorization": "Bearer " + token } });
        const arquivos = await r.json();
        if (!r.ok) throw new Error(arquivos.error || "Erro ao buscar as faturas.");
        if (!arquivos.length) throw new Error("Nenhuma fatura nessa PO.");

        if (destino) {
            const dir = await destino.getDirectoryHandle(pasta, { create: true });
            for (const a of arquivos) {
                const fh = await dir.getFileHandle(a.nome_arquivo, { create: true });
                const w = await fh.createWritable();
                await w.write(_fatBase64ParaBytes(a.pdf));
                await w.close();
            }
            gcAlert(`${arquivos.length} fatura(s) salvas na pasta "${pasta}".`);
        } else {
            await _fatCarregarJSZip();
            const zip = new JSZip();
            const dir = zip.folder(pasta);
            for (const a of arquivos) dir.file(a.nome_arquivo, a.pdf, { base64: true });
            const blob = await zip.generateAsync({ type: "blob" });
            _fatSalvarBlob(blob, `${pasta}.zip`);
        }
    } catch (err) {
        gcAlert(err.message || "Não foi possível baixar as faturas da PO.");
    } finally {
        btn.disabled = false;
        btn.innerText = textoOriginal;
    }
}

function _fatBase64ParaBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

function _fatCarregarJSZip() {
    if (window.JSZip) return Promise.resolve();
    return new Promise((ok, falha) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
        s.onload = ok;
        s.onerror = () => falha(new Error("Não consegui carregar o compactador."));
        document.head.appendChild(s);
    });
}

function _fatSalvarBlob(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Histórico ──

function _fatCarregarHistorico() {
    const empty     = document.getElementById("fat-empty");
    const resultado = document.getElementById("fat-resultado");
    skMostrar(empty);
    empty.style.display = "";
    resultado.style.display = "none";

    fetch(`${API}/faturas`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(data => {
        if (data.error) { skFim(empty, data.error); return; }
        if (!data.length) { skFim(empty, "Nenhuma fatura gerada ainda."); return; }
        empty.style.display = "none";
        resultado.style.display = "";

        document.getElementById("fat-tbody").innerHTML = data.map(f => `<tr>
            <td>${_fatEsc(f.numero_fatura)}</td>
            <td>${_fatEsc(f.referencia)}${f.operacao ? `<div style="color:#8494a9;font-size:11px">${_fatEsc(f.operacao)}</div>` : ""}</td>
            <td>${f.sacado_nome ? _fatEsc(f.sacado_nome) : "Shpx Logistica Ltda."}${f.sacado_cidade ? `<div style="color:#8494a9;font-size:11px">${_fatEsc(f.sacado_cidade)}</div>` : ""}</td>
            <td class="pag-valor">${moedaJS(parseFloat(f.valor))}</td>
            <td>${_fatFormatarDataBR(f.data_emissao)}</td>
            <td>${_fatFormatarDataBR(f.vencimento)}</td>
            <td>${_fatEsc(f.gerado_por || "—")}</td>
            <td>
                <button class="adm-nf-pdf-btn" onclick="_fatBaixar(${f.id}, '${String(f.nome_arquivo).replace(/[^\wÀ-ÿ .-]/g, "")}')" title="Baixar o PDF desta fatura">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    PDF
                </button>
            </td>
        </tr>`).join("");
    })
    .catch(() => skFim(empty, "Erro ao carregar faturas."));
}

function _fatBaixar(id, nome) {
    return fetch(`${API}/faturas/${id}/pdf`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
    .then(blob => _fatSalvarBlob(blob, nome || `fatura-${id}.pdf`))
    .catch(() => gcAlert("Não foi possível baixar o PDF desta fatura."));
}
