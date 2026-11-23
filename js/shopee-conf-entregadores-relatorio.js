// ───── SHOPEE → CONFERÊNCIA → ENTREGADORES → RELATÓRIO DO PERÍODO ─────
// A tela do dia mostra um dia por vez; pra cobrar uma quinzena a operação precisa do
// período inteiro: tudo que cada entregador deveria ter bipado (inclusive quem nem abriu a
// conferência), o que bipou de outra rota e o que bipou a mais. Sai em planilha e em uma
// página impressa por entregador por dia.
//
// Usa _sceEsc e _scePct de shopee-conf-entregadores.js.

let _sceRel = null; // resposta do /relatorio

const SCE_REL_SITUACAO = {
    encerrada:   "Encerrada",
    andamento:   "Não encerrada",
    nao_comecou: "Não abriu a conferência",
};
const SCE_REL_RESULTADO = {
    sem_pedido: "Não encontrado", sem_cluster: "Sem cluster", sem_cep: "Sem CEP", sem_cidade: "CEP sem cidade",
};

function _sceRelDiaBR(dia) { return String(dia || "").split("-").reverse().join("/"); }

// Quinzena anterior à de hoje: no dia 23 é 01–15 do mês; no dia 10 é 16–fim do mês passado.
function _sceRelQuinzenaAnterior() {
    const hoje = new Date();
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (hoje.getDate() > 15) {
        return [ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 15))];
    }
    return [ymd(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 16)), ymd(new Date(hoje.getFullYear(), hoje.getMonth(), 0))];
}

function _sceRelAbrir() {
    const de = document.getElementById("sce-rel-de"), ate = document.getElementById("sce-rel-ate");
    if (!de.value || !ate.value) { const [a, b] = _sceRelQuinzenaAnterior(); de.value = a; ate.value = b; }
    _sceMostrarVista("sce-relatorio");
}

function _sceRelVoltar() { _sceMostrarLista(); }

function _sceRelGerar() {
    const de = document.getElementById("sce-rel-de").value;
    const ate = document.getElementById("sce-rel-ate").value;
    const empty = document.getElementById("sce-rel-empty");
    const res = document.getElementById("sce-rel-resultado");
    if (!de || !ate) { empty.style.display = ""; empty.innerText = "Escolha o período."; res.style.display = "none"; return; }
    res.style.display = "none";
    empty.style.display = "";
    empty.innerHTML = `<div class="xm-carregando xm-carregando-p" role="status"><span>Montando o relatório — pode levar um minuto</span></div>`;

    fetch(`${API}/shopee/conferencia/entregadores/relatorio?de=${de}&ate=${ate}`, { headers: { "Authorization": "Bearer " + token } })
    .then(r => r.json())
    .then(d => {
        if (!d || d.error) { empty.innerText = (d && d.error) || "Erro ao montar o relatório."; return; }
        _sceRel = d;
        document.getElementById("sce-rel-base").innerText = `${d.polo_label} · ${d.xpt}`;
        if (!(d.rotas || []).length) { empty.innerText = "Nenhum entregador com cluster atribuído nesse período."; return; }

        const sel = document.getElementById("sce-rel-ent");
        const atual = sel.value;
        const nomes = [...new Set(d.rotas.map(r => r.nome))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        sel.innerHTML = `<option value="">Todos</option>` + nomes.map(n => `<option value="${_sceEsc(n)}">${_sceEsc(n)}</option>`).join("");
        if (nomes.includes(atual)) sel.value = atual;

        empty.style.display = "none";
        res.style.display = "";
        _sceRelRender();
    })
    .catch(() => { empty.innerText = "Erro ao conectar com o servidor."; });
}

function _sceRelRotas() {
    if (!_sceRel) return [];
    const ent = document.getElementById("sce-rel-ent").value;
    return (_sceRel.rotas || []).filter(r => !ent || r.nome === ent);
}

function _sceRelRender() {
    const rotas = _sceRelRotas();
    const soma = (lista, f) => lista.reduce((s, r) => s + f(r), 0);
    const total = soma(rotas, r => r.total), bip = soma(rotas, r => r.bipados);
    const fora = soma(rotas, r => r.fora_rota.length), amais = soma(rotas, r => r.a_mais.length);

    document.getElementById("sce-rel-resumo").innerHTML = `
        <div class="paj-card"><div class="paj-label">Deveria bipar</div><div class="paj-value">${total}</div></div>
        <div class="paj-card"><div class="paj-label">Bipou da rota</div><div class="paj-value" style="color:#22c55e">${bip}</div></div>
        <div class="paj-card"><div class="paj-label">Não bipou</div><div class="paj-value" style="color:${total - bip ? "#eab308" : "#8494a9"}">${total - bip}</div></div>
        <div class="paj-card"><div class="paj-label">Outra rota</div><div class="paj-value" style="color:${fora ? "#ef4444" : "#8494a9"}">${fora}</div></div>
        <div class="paj-card"><div class="paj-label">A mais</div><div class="paj-value" style="color:${amais ? "#ef4444" : "#8494a9"}">${amais}</div></div>`;

    const semAt = rotas.filter(r => r.sem_at).length;
    const semRet = rotas.filter(r => r.sem_retrato).length;
    const avisos = [];
    if (semAt) avisos.push(`${semAt} rota${semAt !== 1 ? "s" : ""} sem AT guardada do dia (a lista de pacotes não pode ser montada — importe a AT daquele dia em Shopee › AT exportada)`);
    if (semRet) avisos.push(`${semRet} conferência${semRet !== 1 ? "s" : ""} encerrada${semRet !== 1 ? "s" : ""} sem retrato dos pacotes`);
    document.getElementById("sce-rel-obs").innerText = avisos.join(" · ");

    const porNome = new Map();
    for (const r of rotas) {
        if (!porNome.has(r.nome)) porNome.set(r.nome, []);
        porNome.get(r.nome).push(r);
    }
    const linhas = [...porNome.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")).map(([nome, rs]) => {
        const t = soma(rs, r => r.total), b = soma(rs, r => r.bipados);
        const f = soma(rs, r => r.fora_rota.length), m = soma(rs, r => r.a_mais.length);
        const semConf = rs.filter(r => r.situacao === "nao_comecou").length;
        const pct = t ? Math.floor(b * 10000 / t) / 100 : null;
        return `<tr>
            <td data-label="Entregador" style="color:#e2e8f0;font-weight:600">${_sceEsc(nome)}</td>
            <td data-label="Dias">${rs.length}${semConf ? ` <span style="color:#8494a9;font-size:11.5px">(${semConf} sem abrir)</span>` : ""}</td>
            <td data-label="Deveria bipar">${t}</td>
            <td data-label="Bipou da rota" style="color:#22c55e">${b}</td>
            <td data-label="Não bipou" style="color:${t - b ? "#eab308" : "#8494a9"}">${t - b}</td>
            <td data-label="Outra rota" style="color:${f ? "#ef4444" : "#8494a9"}">${f}</td>
            <td data-label="A mais" style="color:${m ? "#ef4444" : "#8494a9"}">${m}</td>
            <td data-label="Conclusão">${pct === null ? "—" : pct.toFixed(2).replace(".", ",") + "%"}</td>
        </tr>`;
    });
    document.getElementById("sce-rel-tbody").innerHTML = linhas.join("") ||
        `<tr><td colspan="8" style="text-align:center;color:#8494a9;padding:20px">Nada aqui.</td></tr>`;
}

function _sceRelNomeArquivo(ext) {
    const ent = document.getElementById("sce-rel-ent").value;
    const base = `conferencia-entregadores_${_sceRel.de}_a_${_sceRel.ate}`;
    return (ent ? `${base}_${ent.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-")}` : base) + "." + ext;
}

function _sceRelPlanilha() {
    if (!_sceRel || typeof XLSX === "undefined") { gcAlert("Não deu pra montar a planilha agora."); return; }
    const rotas = _sceRelRotas();
    const resumo = [["Dia", "Entregador", "Clusters", "Situação", "Deveria bipar", "Bipou da rota", "Não bipou", "Outra rota", "A mais", "Observação"]];
    const geral  = [["Dia", "Entregador", "Clusters da rota", "Código", "Cluster do pacote", "Cidade", "Bairro", "Bipou?", "Hora do bipe"]];
    const outra  = [["Dia", "Entregador", "Clusters da rota", "Código", "Cluster do pacote (de quem é)", "Hora do bipe"]];
    const amais  = [["Dia", "Entregador", "Clusters da rota", "Código", "Resultado", "Hora do bipe"]];
    for (const r of rotas) {
        const dia = _sceRelDiaBR(r.dia), cl = r.clusters.join(", ");
        const obs = [r.sem_at ? "sem AT do dia" : "", r.sem_retrato ? "sem retrato" : "", r.sem_vinculo ? "conferiu sem cluster atribuído" : ""].filter(Boolean).join("; ");
        resumo.push([dia, r.nome, cl, SCE_REL_SITUACAO[r.situacao] || r.situacao, r.total, r.bipados, r.nao_bipados, r.fora_rota.length, r.a_mais.length, obs]);
        for (const p of r.pacotes) geral.push([dia, r.nome, cl, p.codigo, p.cluster, p.cidade, p.bairro, p.bipado ? "Sim" : "Não", p.hora]);
        for (const p of r.fora_rota) outra.push([dia, r.nome, cl, p.codigo, p.cluster, p.hora]);
        for (const p of r.a_mais) amais.push([dia, r.nome, cl, p.codigo, SCE_REL_RESULTADO[p.resultado] || p.resultado, p.hora]);
    }
    const wb = XLSX.utils.book_new();
    const aba = (dados, nome, larguras) => {
        const ws = XLSX.utils.aoa_to_sheet(dados);
        ws["!cols"] = larguras.map(w => ({ wch: w }));
        ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, dados.length - 1), c: dados[0].length - 1 } }) };
        XLSX.utils.book_append_sheet(wb, ws, nome);
    };
    aba(resumo, "Resumo", [11, 30, 26, 22, 13, 13, 11, 11, 9, 30]);
    aba(geral, "Geral", [11, 30, 26, 18, 20, 18, 20, 8, 11]);
    aba(outra, "Outra rota", [11, 30, 26, 18, 28, 11]);
    aba(amais, "A mais", [11, 30, 26, 18, 16, 11]);
    XLSX.writeFile(wb, _sceRelNomeArquivo("xlsx"));
}

// Uma página por entregador por dia — é o "print" da conferência daquele dia, inclusive de
// quem não abriu. Janela própria, fundo branco, pra imprimir ou salvar em PDF.
function _sceRelImprimir() {
    if (!_sceRel) return;
    const rotas = _sceRelRotas();
    if (!rotas.length) { gcAlert("Nada pra imprimir."); return; }
    const e = _sceEsc;
    const semana = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const diaLongo = dia => `${_sceRelDiaBR(dia)} (${semana[new Date(dia + "T12:00:00").getDay()]})`;
    const grade = (itens, f, cls = "") => itens.length
        ? `<div class="grade ${cls}">${itens.map(f).join("")}</div>`
        : `<div class="vazio">Nenhum.</div>`;

    const paginas = rotas.map(r => {
        const nao = r.pacotes.filter(p => !p.bipado), sim = r.pacotes.filter(p => p.bipado);
        const pct = r.total ? (Math.floor(r.bipados * 10000 / r.total) / 100).toFixed(2).replace(".", ",") + "%" : "—";
        const aviso = r.sem_at ? `<div class="aviso">Sem AT guardada desse dia: a lista de pacotes da rota não pôde ser montada.</div>`
                    : r.sem_retrato ? `<div class="aviso">Conferência encerrada sem retrato dos pacotes.</div>` : "";
        return `<section class="pag">
            <header>
                <div class="t1">Conferência do entregador</div>
                <div class="nome">${e(r.nome)}</div>
                <div class="sub">${diaLongo(r.dia)} · ${e(r.clusters.join(", ") || "—")} · <b class="sit-${r.situacao}">${SCE_REL_SITUACAO[r.situacao] || r.situacao}</b></div>
            </header>
            ${aviso}
            <div class="cards">
                <div><span>Deveria bipar</span><b>${r.total}</b></div>
                <div><span>Bipou da rota</span><b class="v">${r.bipados}</b></div>
                <div><span>Não bipou</span><b class="${r.nao_bipados ? "a" : ""}">${r.nao_bipados}</b></div>
                <div><span>Outra rota</span><b class="${r.fora_rota.length ? "r" : ""}">${r.fora_rota.length}</b></div>
                <div><span>A mais</span><b class="${r.a_mais.length ? "r" : ""}">${r.a_mais.length}</b></div>
                <div><span>Conclusão</span><b>${pct}</b></div>
            </div>
            <h3>Não bipou (${nao.length})</h3>
            ${grade(nao, p => `<div class="c">${e(p.codigo)}<i>${e(p.cluster)}</i></div>`)}
            <h3>Bipou de outra rota (${r.fora_rota.length})</h3>
            ${grade(r.fora_rota, p => `<div class="c">${e(p.codigo)}<i>${e(p.cluster || "—")} · ${e(p.hora)}</i></div>`, "g3")}
            <h3>Bipou a mais (${r.a_mais.length})</h3>
            ${grade(r.a_mais, p => `<div class="c">${e(p.codigo)}<i>${e(SCE_REL_RESULTADO[p.resultado] || p.resultado)} · ${e(p.hora)}</i></div>`, "g3")}
            <h3>Bipou da rota (${sim.length})</h3>
            ${grade(sim, p => `<div class="c">${e(p.codigo)}<i>${e(p.hora)}</i></div>`)}
            <footer>${e(_sceRel.polo_label)} · ${e(_sceRel.xpt)} · período ${_sceRelDiaBR(_sceRel.de)} a ${_sceRelDiaBR(_sceRel.ate)}</footer>
        </section>`;
    }).join("");

    const w = window.open("", "_blank");
    if (!w) { gcAlert("O navegador bloqueou a janela de impressão. Libere pop-ups pra este site."); return; }
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${e(_sceRelNomeArquivo("pdf").replace(/\.pdf$/, ""))}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111827; background: #fff; margin: 0; }
  .pag { page-break-after: always; padding: 4px 0; }
  .pag:last-child { page-break-after: auto; }
  header { border-bottom: 2px solid #111827; padding-bottom: 8px; margin-bottom: 10px; }
  .t1 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; }
  .nome { font-size: 20px; font-weight: 700; margin: 2px 0; }
  .sub { font-size: 12.5px; color: #374151; }
  .sit-nao_comecou { color: #b91c1c; } .sit-andamento { color: #b45309; } .sit-encerrada { color: #15803d; }
  .aviso { font-size: 12px; color: #b45309; border-left: 3px solid #b45309; padding: 4px 8px; margin-bottom: 8px; }
  .cards { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 10px; }
  .cards div { border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; }
  .cards span { display: block; font-size: 10.5px; color: #6b7280; }
  .cards b { font-size: 18px; font-variant-numeric: tabular-nums; }
  .v { color: #15803d; } .a { color: #b45309; } .r { color: #b91c1c; }
  h3 { font-size: 12.5px; margin: 10px 0 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; }
  .grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px 10px; }
  .grade.g3 { grid-template-columns: repeat(3, 1fr); }
  .c { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .c i { font-style: normal; color: #6b7280; margin-left: 5px; font-family: system-ui, sans-serif; font-size: 9.5px; }
  .vazio { font-size: 11px; color: #9ca3af; }
  footer { margin-top: 12px; font-size: 10px; color: #9ca3af; }
</style></head><body>${paginas}
<script>window.onload = () => setTimeout(() => window.print(), 300);<\/script></body></html>`);
    w.document.close();
}
