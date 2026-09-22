// ───── TELEFONES DOS ENTREGADORES (SÓ DEV) ─────
// Tela de LEITURA: o telefone vem ao vivo da planilha "Dados entregadores/CLT's" (a mesma
// que valida fechamento), casado pelo NOME PADRÃO DO SISTEMA (o mesmo já corrigido pela
// Conversão de nomes) — não por login/usuário, então um entregador com 5 grafias
// diferentes espalhadas pelos relatórios cai no mesmo telefone.
//
// Não tem edição aqui: telefone errado se corrige NA PLANILHA, nome errado se corrige na
// Conversão de nomes. Essa tela só mostra o que o sistema vai encontrar sozinho, e por
// qual coluna leu — pra dar pra desconfiar rápido se a planilha mudou de formato.

let _etfBuscaTimeout = null;

function abrirEntregadorTelefone(event) {
    if (event) event.preventDefault();
    const role = window._gcUser && window._gcUser.role;
    if (role !== "dev") {
        gcAlert("Só dev vê os telefones dos entregadores.");
        return;
    }
    mostrarTela("tela-entregador-telefone");
    document.getElementById("etf-busca").value = "";
    document.getElementById("etf-so-falta").checked = false;
    _etfCarregar();
}

function _etfEsc(txt) {
    return String(txt ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function _etfBuscar() {
    clearTimeout(_etfBuscaTimeout);
    _etfBuscaTimeout = setTimeout(_etfCarregar, 300);
}

// 5549999276131 → +55 49 9 9927-6131 — só pra exibir o que a planilha já trouxe validado.
function _etfFormatarNumero(numero) {
    const n = String(numero || "").replace(/\D/g, "");
    const m11 = n.match(/^55(\d{2})9(\d{4})(\d{4})$/);
    if (m11) return `+55 ${m11[1]} 9 ${m11[2]}-${m11[3]}`;
    const m10 = n.match(/^55(\d{2})(\d{4})(\d{4})$/);
    if (m10) return `+55 ${m10[1]} ${m10[2]}-${m10[3]}`;
    return numero ? `+${n}` : "—";
}

function _etfCarregar() {
    const empty = document.getElementById("etf-empty");
    const result = document.getElementById("etf-resultado");
    document.getElementById("etf-diagnostico").innerText = "";
    skMostrar(empty, "tabela");
    empty.style.display = "";
    result.style.display = "none";

    const q = document.getElementById("etf-busca").value.trim();
    const soFalta = document.getElementById("etf-so-falta").checked;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (soFalta) params.set("falta", "1");

    fetch(`${API}/admin/entregadores-telefone?${params}`, { headers: { "Authorization": "Bearer " + token } })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
            if (!ok) {
                // 502 com amostra: a planilha mudou de cabeçalho e ninguém corrigiu a lista de
                // grafias aceitas ainda no servidor. Mostrar a amostra crua é o que dá pra
                // colar de volta pra quem for corrigir — sem isso é só "deu erro".
                let msg = _etfEsc(d.error) || "Erro ao consultar a planilha.";
                if (d.amostra_planilha) {
                    msg += `<br><br><span style="font-size:11.5px;color:#8494a9">Primeiras linhas que a planilha trouxe:<br>` +
                        d.amostra_planilha.map(l => _etfEsc(JSON.stringify(l))).join("<br>") + `</span>`;
                }
                skFim(empty, msg);
                return;
            }
            if (!d.linhas || !d.linhas.length) {
                skFim(empty, q || soFalta ? "Nenhum nome encontrado." : "Nenhum entregador na Conversão de nomes ainda.");
                _etfPintarResumo(d);
                return;
            }
            empty.style.display = "none";
            result.style.display = "";
            document.getElementById("etf-truncado").style.display = d.truncado ? "" : "none";
            document.getElementById("etf-tbody").innerHTML = d.linhas.map(l => {
                let telCel;
                if (l.telefone) telCel = _etfEsc(_etfFormatarNumero(l.telefone));
                else if (l.telefone_invalido) telCel = `<span style="color:#eab308" title="A planilha tem algo nessa linha, mas não parece um telefone válido">${_etfEsc(l.telefone_bruto)} ⚠</span>`;
                else telCel = '<span style="color:#66829c">não encontrado na planilha</span>';
                return `
                <tr>
                    <td data-label="Entregador">${_etfEsc(l.nome_sistema)}</td>
                    <td data-label="Telefone">${telCel}</td>
                </tr>`;
            }).join("");
            _etfPintarResumo(d);
        })
        .catch(() => skFim(empty, "Erro ao conectar com o servidor."));
}

function _etfPintarResumo(d) {
    const resumo = document.getElementById("etf-resumo");
    const diag = document.getElementById("etf-diagnostico");
    if (!d || !d.total) { resumo.innerText = ""; diag.innerText = ""; return; }
    resumo.innerText = `${d.total.toLocaleString("pt-BR")} entregador${d.total !== 1 ? "es" : ""} · ${d.com_telefone.toLocaleString("pt-BR")} com telefone · ${d.sem_telefone.toLocaleString("pt-BR")} faltando`;
    // O cabeçalho que a planilha usou, pra conferir de relance se casou a coluna certa —
    // sem isso "todo mundo sem telefone" e "planilha com cabeçalho trocado" pareceriam
    // exatamente a mesma tela.
    if (d.diagnostico && d.diagnostico.cabecalho) {
        diag.innerText = `Lendo "${d.diagnostico.cabecalho.join('" / "')}" — ${d.diagnostico.linhas_planilha.toLocaleString("pt-BR")} linhas na planilha.`;
    } else {
        diag.innerText = "";
    }
}
