// ───── LÓGICA PURA DA CONFERÊNCIA ─────
// Tudo aqui é sem tela e sem rede: o que a mensagem do bipe diz, como o percentual aparece,
// qual código da etiqueta vale. Separado pra rodar no node:test — e porque é exatamente o
// que tem que continuar igual ao site (meusite/js/entregador-conferencia.js).

(function (raiz) {
    const RESULTADOS = {
        ok:          { rotulo: "Confere",        cor: "#22c55e" },
        divergente:  { rotulo: "Outra rota",     cor: "#ef4444" },
        sem_pedido:  { rotulo: "Não encontrado", cor: "#eab308" },
        sem_cluster: { rotulo: "Sem cluster",    cor: "#eab308" },
        sem_cep:     { rotulo: "Sem CEP",        cor: "#eab308" },
        sem_cidade:  { rotulo: "CEP sem cidade", cor: "#eab308" },
    };

    function esc(t) {
        return String(t ?? "").replace(/[&<>"']/g, c =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    // 0,00% — 100% e 0% sem casas, como o resto do sistema mostra.
    function pctTexto(pct) {
        if (pct === null || pct === undefined || isNaN(pct)) return "—";
        if (pct >= 100) return "100%";
        if (pct <= 0) return "0%";
        return pct.toFixed(2).replace(".", ",") + "%";
    }

    // Barra com 1% mínimo quando já tem bipe: 0,4% some na tela e parece que nada andou.
    function larguraBarra(feitos, pct) {
        if (!pct || pct <= 0) return 0;
        return feitos && pct < 1 ? 1 : Math.min(100, pct);
    }

    function dataBr(dia) {
        return dia ? String(dia).split("-").reverse().join("/") : "—";
    }

    // "Hoje" e "Ontem" por extenso: são os dois que ele procura de fato.
    function diaTexto(dia, hoje) {
        if (!dia) return "Sem data";
        const br = dataBr(dia);
        if (!hoje) return br;
        if (dia === hoje) return `Hoje · ${br}`;
        const ontem = new Date(hoje + "T12:00:00Z");
        ontem.setUTCDate(ontem.getUTCDate() - 1);
        if (dia === ontem.toISOString().slice(0, 10)) return `Ontem · ${br}`;
        return br;
    }

    function plural(n, um, varios) {
        return `${n} ${n === 1 ? um : varios}`;
    }

    // O que a mensagem do bipe diz — mesma regra do site. Pacote de outro cluster tem que
    // dizer DE QUAL: é o número que decide se ele volta pro responsável ou vai pro colega.
    function textoResultado(d) {
        const rotulo = (RESULTADOS[d.resultado] || {}).rotulo || "";
        const rep = d.repetido ? " (bipado de novo)" : "";
        if (d.interceptar) return "NÃO LEVE — " + (d.detalhe || "este pacote está voltando") + " Entregue ao responsável." + rep;
        if (d.resultado === "ok") {
            if (d.status_ok === false) {
                return `Confere, mas o status é ${d.status_pedido || "—"} — não consta recebido no hub${rep}`;
            }
            return (d.detalhe || (d.repetido ? "Já estava conferido" : "Confere")) + (d.detalhe ? rep : "");
        }
        if (d.resultado === "divergente" && d.encontrado) {
            return `Esse pacote é do ${d.encontrado} — não é da sua rota${rep}`;
        }
        return `${d.detalhe || rotulo} — conferir manualmente se a rota é de ${d.esperado || "um dos seus clusters"}${rep}`;
    }

    // Que som/cor o bipe leva. Interceptar vence tudo: o pacote não pode subir no carro,
    // então verde ali seria o sinal oposto do que precisa acontecer.
    function tipoResposta(d) {
        if (!d) return "erro";
        if (d.interceptar) return "erro";
        if (d.resultado === "ok") return "ok";
        if (d.resultado === "divergente") return "outra_rota";
        return "erro";
    }

    function resumo(bipagens, faltantes) {
        const ok    = bipagens.filter(b => b.resultado === "ok").length;
        const outra = bipagens.filter(b => b.resultado === "divergente").length;
        const semDado = bipagens.filter(b => !["ok", "divergente"].includes(b.resultado)).length;
        return { ok, outra, semDado, aMais: outra + semDado, faltam: faltantes.length };
    }

    function textoFaltantes(lista) {
        return "Pedidos faltantes:\n" + (lista || []).map(f => f.codigo).join("\n");
    }

    // Entre os códigos do mesmo frame vale o mais perto do centro da tela, onde está a mira.
    // A etiqueta tem mais de um código; sem isso o que ganha é o que o ML Kit listou primeiro.
    // Os cantos chegam em pixels físicos da tela (o plugin já normaliza), daí o centro também.
    function maisCentral(barcodes, larguraTela, alturaTela) {
        const cx = larguraTela / 2, cy = alturaTela / 2;
        let melhor = null, melhorDist = Infinity;
        for (const b of barcodes || []) {
            const texto = String((b && (b.rawValue || b.displayValue)) || "").trim();
            if (!texto) continue;
            const pts = b.cornerPoints || [];
            let x = cx, y = cy;
            if (pts.length) {
                x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
                y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
            }
            const dist = (x - cx) ** 2 + (y - cy) ** 2;
            if (dist < melhorDist) { melhorDist = dist; melhor = texto; }
        }
        return melhor;
    }

    // O mesmo código continua na frente da câmera por vários frames. Só vale de novo depois
    // da janela — abaixo dela é o mesmo pacote parado na mão, não o próximo.
    function criarFiltroRepeticao(janelaMs) {
        let ultimo = "", ultimoEm = -Infinity;
        return function aceitar(codigo, agora) {
            if (!codigo) return false;
            if (codigo === ultimo && agora - ultimoEm < janelaMs) {
                ultimoEm = agora;   // segue parado na frente: estica a janela
                return false;
            }
            ultimo = codigo;
            ultimoEm = agora;
            return true;
        };
    }

    const api = {
        RESULTADOS, esc, pctTexto, larguraBarra, dataBr, diaTexto, plural,
        textoResultado, tipoResposta, resumo, textoFaltantes, maisCentral, criarFiltroRepeticao,
    };
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else raiz.XM = api;
})(typeof window !== "undefined" ? window : globalThis);
