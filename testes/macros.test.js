// Testes de js/macros.js — a parte de estado do formulário de rodadas (adicionar, remover,
// trocar tipo) e a conversão chave->rota. O que se protege: trocar o tipo de uma rodada
// tem que resetar o parâmetro pro padrão do tipo novo (senão sobra um "90" configurado pra
// um critério que espera "quantos pacotes", sem fazer sentido nenhum), e remover uma
// rodada do meio não pode bagunçar as outras.
//
// Script carregado sozinho num contexto isolado, com DOM de mentira. Dados de TESTE.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const fonte = fs.readFileSync(path.join(__dirname, "..", "js", "macros.js"), "utf8");

const ACESSOR = `
;globalThis.__m = {
  get rodadas() { return _macRodadas; },
  set rodadas(v) { _macRodadas = v; },
  set tipos(v) { _macTipos = v; },
  rotaDaChave: (c) => _macRotaDaChave(c),
  rotuloParametro: (id) => _macRotuloParametro(id),
};`;

function criarElemento() {
  const o = { innerHTML: "", style: {}, value: "", checked: false, setAttribute() {} };
  Object.defineProperty(o, "innerText", { set(v) { o.innerHTML = String(v); }, get() { return o.innerHTML; } });
  return o;
}

function carregar() {
  const els = {};
  const el = (id) => els[id] || (els[id] = Object.assign(criarElemento(), { id }));
  const ctx = vm.createContext({
    console,
    document: { getElementById: el },
  });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  return { ctx, els, m: ctx.__m };
}

const TIPOS = [
  { id: "abaixo_limite", rotulo: "Abaixo de X% concluído", parametroRotulo: "% de conclusão", parametroPadrao: 90 },
  { id: "delivering_pendente", rotulo: "Mais de X pacotes em Delivering", parametroRotulo: "pacotes em Delivering", parametroPadrao: 1 },
];

// ── _macRotaDaChave ──────────────────────────────────────────────────────
test("troca underline por traco, pra bater com a rota do servidor", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave("avisos_entregador"), "avisos-entregador");
});

test("chave sem underline nenhum fica igual", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave("simples"), "simples");
});

test("chave vazia ou nula nao quebra", () => {
  const a = carregar();
  assert.strictEqual(a.m.rotaDaChave(""), "");
  assert.strictEqual(a.m.rotaDaChave(null), "");
});

// ── _macRotuloParametro ──────────────────────────────────────────────────
test("acha o rotulo do parametro pelo tipo", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.strictEqual(a.m.rotuloParametro("delivering_pendente"), "pacotes em Delivering");
});

test("tipo desconhecido cai num rotulo generico, nao quebra", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.strictEqual(a.m.rotuloParametro("nao_existe"), "Parâmetro");
});

// ── adicionar / remover / trocar tipo ─────────────────────────────────────
test("adicionar rodada usa o primeiro tipo do catalogo como padrao", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [];
  a.ctx._macAdicionarRodada();
  assert.strictEqual(a.m.rodadas.length, 1);
  assert.strictEqual(a.m.rodadas[0].tipo, "abaixo_limite");
  assert.strictEqual(a.m.rodadas[0].parametro, 90);
  assert.strictEqual(a.m.rodadas[0].hora, 12); // valor inicial razoavel, pro dev so ajustar
});

test("trocar o tipo de uma rodada reseta o parametro pro padrao do tipo novo", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarTipo(0, "delivering_pendente");
  assert.strictEqual(a.m.rodadas[0].tipo, "delivering_pendente");
  assert.strictEqual(a.m.rodadas[0].parametro, 1); // nao ficou com o 90 do tipo anterior
  assert.strictEqual(a.m.rodadas[0].hora, 19); // horario nao mexe
});

test("mudar campo grava na rodada certa pelo indice, sem afetar as outras", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [
    { hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 },
    { hora: 22, minuto: 5, tipo: "delivering_pendente", parametro: 1 },
  ];
  a.ctx._macMudarCampo(1, "parametro", "3");
  assert.strictEqual(a.m.rodadas[1].parametro, 3);
  assert.strictEqual(a.m.rodadas[0].parametro, 90, "a primeira rodada nao pode mudar");
});

test("campo vazio durante a digitacao fica string vazia, nao NaN", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarCampo(0, "hora", "");
  assert.strictEqual(a.m.rodadas[0].hora, "");
});

test("remover uma rodada do meio nao embaralha as outras", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  a.m.rodadas = [
    { hora: 8, minuto: 0, tipo: "abaixo_limite", parametro: 50 },
    { hora: 12, minuto: 0, tipo: "abaixo_limite", parametro: 70 },
    { hora: 20, minuto: 0, tipo: "delivering_pendente", parametro: 2 },
  ];
  a.ctx._macRemoverRodada(1); // tira a do meio (12h)
  assert.strictEqual(a.m.rodadas.length, 2);
  assert.strictEqual(a.m.rodadas[0].hora, 8);
  assert.strictEqual(a.m.rodadas[1].hora, 20);
});

test("remover todas as rodadas deixa a lista vazia, sem quebrar", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 8, minuto: 0, tipo: "abaixo_limite", parametro: 50 }];
  a.ctx._macRemoverRodada(0);
  assert.deepStrictEqual(a.m.rodadas, []);
});

// ── campo de horário e a lista de hora/minuto ───────────────────────────────
// O campo do navegador (type=time) tem uma lista própria que DÁ A VOLTA (depois do 59 vem o 00)
// e parecia rolar sem fim. O relógio do campo abre uma lista nossa: hora 00–23 e minuto 00–59
// lado a lado, com começo e fim. Digitar direto no campo continua funcionando.
const RODADA = { hora: 19, minuto: 3, tipo: "delivering_pendente", parametro: 0 };

test("o horario aparece sempre com dois digitos: 19:03, nunca 19:3", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 19, minuto: 3 }), "19:03");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 8, minuto: 0 }), "08:00");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 0, minuto: 0 }), "00:00", "meia-noite e valida, nao vazio");
});

test("hora ou minuto vazios ou fora da faixa viram campo vazio, nunca um horario inventado", () => {
  const a = carregar();
  for (const ruim of ["", null, undefined, "abc", -1, 1.5]) {
    assert.strictEqual(a.ctx._macHorarioTexto({ hora: ruim, minuto: 5 }), "", `hora ${String(ruim)}`);
    assert.strictEqual(a.ctx._macHorarioTexto({ hora: 5, minuto: ruim }), "", `minuto ${String(ruim)}`);
  }
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 24, minuto: 0 }), "", "nao existe hora 24");
  assert.strictEqual(a.ctx._macHorarioTexto({ hora: 0, minuto: 60 }), "", "nao existe minuto 60");
});

test("o valor digitado no campo vira hora e minuto NUMEROS, que e o que o servidor guarda", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "07:05");
  assert.strictEqual(a.m.rodadas[0].hora, 7);
  assert.strictEqual(a.m.rodadas[0].minuto, 5);
  a.ctx._macMudarHorario(0, "00:00");
  assert.strictEqual(a.m.rodadas[0].hora, 0, "00:00 nao pode virar vazio");
  assert.strictEqual(a.m.rodadas[0].minuto, 0);
});

test("campo apagado no meio da edicao fica vazio (o servidor recusa ao salvar, como antes)", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "");
  assert.strictEqual(a.m.rodadas[0].hora, "");
  assert.strictEqual(a.m.rodadas[0].minuto, "");
});

test("mudar o horario nao mexe no resto da rodada", () => {
  const a = carregar();
  a.m.rodadas = [{ hora: 19, minuto: 5, tipo: "abaixo_limite", parametro: 90 }];
  a.ctx._macMudarHorario(0, "20:15");
  assert.strictEqual(JSON.stringify(a.m.rodadas[0]),
    JSON.stringify({ hora: 20, minuto: 15, tipo: "abaixo_limite", parametro: 90 }));
});

// ── as colunas da lista ─────────────────────────────────────────────────────
const contar = (html) => html.split("mac-hm-item").length - 1;

test("a coluna da hora vai de 00 a 23 e termina no 23", () => {
  const a = carregar();
  const html = a.ctx._macColunaHtml(0, 23, 19, "hora", 0);
  assert.strictEqual(contar(html), 24);
  assert.ok(html.includes(">00</button>"));
  assert.ok(html.includes(">23</button>"));
  assert.ok(!html.includes(">24</button>"), "nao existe hora 24");
});

test("a coluna do minuto vai de 00 a 59 e termina no 59", () => {
  const a = carregar();
  const html = a.ctx._macColunaHtml(0, 59, 3, "minuto", 0);
  assert.strictEqual(contar(html), 60);
  assert.ok(html.includes(">00</button>"));
  assert.ok(html.includes(">59</button>"));
  assert.ok(!html.includes(">60</button>"), "nao existe minuto 60");
});

test("so o valor atual vem marcado, com zero na frente no rotulo", () => {
  const a = carregar();
  const html = a.ctx._macColunaHtml(0, 59, 3, "minuto", 0);
  assert.strictEqual(html.split(" sel").length - 1, 1, "um unico marcado");
  assert.ok(html.includes('class="mac-hm-item sel" tabindex="-1" data-n="3"'));
  assert.ok(html.includes(">03</button>"));
});

test("valor atual invalido nao marca nenhum item (nao escolhe 00 sozinho)", () => {
  const a = carregar();
  for (const ruim of ["", null, undefined, 24]) {
    assert.ok(!a.ctx._macColunaHtml(0, 23, ruim, "hora", 0).includes(" sel"), String(ruim));
  }
});

test("cada item grava na rodada e no campo certos", () => {
  const a = carregar();
  const html = a.ctx._macColunaHtml(0, 59, 3, "minuto", 2);
  assert.ok(html.includes("_macEscolherHm(2,'minuto',30)"));
});

test("a linha da rodada tem o campo de horario, o relogio que abre a lista e nao usa seletores", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada(RODADA, 4);
  assert.ok(html.includes('type="time"'));
  assert.ok(html.includes('value="19:03"'));
  assert.ok(html.includes("_macMudarHorario(4, this.value)"));
  assert.ok(html.includes("_macAbrirHorario(4, this)"), "o relogio abre a lista da rodada 4");
  assert.ok(!html.includes('aria-label="Hora"'), "hora e minuto nao sao mais dois seletores");
});

test("a linha da rodada leva o criterio marcado e o rotulo do numero em letra normal", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  const html = a.ctx._macLinhaRodada(RODADA, 0);
  assert.ok(html.includes('<option value="delivering_pendente" selected>'));
  assert.ok(html.includes(">Pacotes em Delivering<"));
  assert.ok(html.includes("_macRemoverRodada(0)"));
});

test("o criterio inteiro vai no title (o campo pode cortar o texto comprido)", () => {
  const a = carregar();
  a.m.tipos = TIPOS;
  assert.ok(a.ctx._macLinhaRodada(RODADA, 0).includes('title="Mais de X pacotes em Delivering"'));
});

test("rotulo de criterio com HTML nao vira HTML na linha da rodada", () => {
  const a = carregar();
  a.m.tipos = [{ id: "x", rotulo: "<b>x</b>", parametroRotulo: "<i>y</i>", parametroPadrao: 0 }];
  const html = a.ctx._macLinhaRodada({ hora: 1, minuto: 2, tipo: "x", parametro: 0 }, 0);
  assert.ok(!html.includes("<b>x</b>") && !html.includes("<i>y</i>"));
});

// ── abrir, posicionar e fechar a lista ──────────────────────────────────────
// DOM de mentira: o que se confere é o comportamento (onde abre, quando fecha, o que limpa), não
// o desenho — esse é do CSS.
function carregarComLista({ altura = 900, largura = 1300 } = {}) {
  const docOuvintes = [];
  const winOuvintes = [];
  const criados = [];

  const itens = (n) => Array.from({ length: n }, (_, k) => {
    const item = { dataset: { n: String(k) }, marcado: false };
    item.classList = { toggle(_, ligado) { item.marcado = ligado; } };
    return item;
  });
  const fazerElemento = () => {
    const lista = { hora: itens(24), minuto: itens(60) };
    const el = {
      className: "", innerHTML: "", style: {}, offsetHeight: 278, offsetWidth: 178, removido: false, lista,
      remove() { el.removido = true; },
      contains: (alvo) => !!alvo && alvo.dentroDaLista === true,
      querySelectorAll(seletor) {
        if (seletor === ".mac-hm-col") return [{ clientHeight: 236, scrollTop: 0, querySelector: () => null }];
        if (seletor.includes('data-campo="hora"')) return lista.hora;
        if (seletor.includes('data-campo="minuto"')) return lista.minuto;
        return [];
      },
    };
    criados.push(el);
    return el;
  };

  const els = {};
  const documento = {
    getElementById: (id) => els[id] || (els[id] = { id, style: {}, innerHTML: "" }),
    createElement: () => fazerElemento(),
    body: { appendChild() {} },
    addEventListener: (tipo, fn) => docOuvintes.push({ tipo, fn }),
    removeEventListener: (tipo, fn) => {
      const i = docOuvintes.findIndex((o) => o.tipo === tipo && o.fn === fn);
      if (i >= 0) docOuvintes.splice(i, 1);
    },
  };
  const janela = {
    innerHeight: altura, innerWidth: largura,
    addEventListener: (tipo, fn) => winOuvintes.push({ tipo, fn }),
    removeEventListener: (tipo, fn) => {
      const i = winOuvintes.findIndex((o) => o.tipo === tipo && o.fn === fn);
      if (i >= 0) winOuvintes.splice(i, 1);
    },
  };

  const ctx = vm.createContext({ console, document: documento, window: janela });
  vm.runInContext(fonte + ACESSOR, ctx, { filename: "macros.js" });
  ctx.__m.tipos = TIPOS;

  /** Um relógio de mentira: onde ele está na tela e o campo de horário ao lado dele. */
  const relogio = (caixa = { left: 170, top: 330, bottom: 371 }) => {
    const campo = { value: "19:03" };
    const botao = {
      campo,
      getBoundingClientRect: () => caixa,
      parentNode: { querySelector: () => campo },
      contains: (alvo) => alvo === botao,
    };
    return botao;
  };
  const disparar = (tipo, evento) => {
    [...docOuvintes, ...winOuvintes].filter((o) => o.tipo === tipo).forEach((o) => o.fn(evento));
  };
  return { ctx, m: ctx.__m, criados, docOuvintes, winOuvintes, relogio, disparar, ultimo: () => criados[criados.length - 1] };
}

test("abre a lista EMBAIXO do campo, encostada na esquerda dele", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio({ left: 170, top: 330, bottom: 371 }));
  assert.strictEqual(a.ultimo().style.top, "377px", "bottom + 6");
  assert.strictEqual(a.ultimo().style.left, "170px");
});

test("so vira pra cima quando embaixo nao cabe e em cima tem mais lugar", () => {
  const a = carregarComLista({ altura: 500 });
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio({ left: 170, top: 420, bottom: 461 }));
  // sobra 39px embaixo (lista de 278 nao cabe) e 420px em cima
  assert.strictEqual(a.ultimo().style.top, String(420 - 278 - 6) + "px");
});

test("nao vira pra cima se em cima tambem nao cabe melhor: fica embaixo", () => {
  const a = carregarComLista({ altura: 300 });
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio({ left: 170, top: 60, bottom: 101 }));
  assert.strictEqual(a.ultimo().style.top, "107px");
});

test("nao sai pela borda da tela: encosta a lista na direita e na esquerda", () => {
  const direita = carregarComLista({ largura: 1300 });
  direita.m.rodadas = [{ ...RODADA }];
  direita.ctx._macAbrirHorario(0, direita.relogio({ left: 1250, top: 330, bottom: 371 }));
  assert.strictEqual(direita.ultimo().style.left, String(1300 - 178 - 8) + "px");

  const esquerda = carregarComLista();
  esquerda.m.rodadas = [{ ...RODADA }];
  esquerda.ctx._macAbrirHorario(0, esquerda.relogio({ left: -30, top: 330, bottom: 371 }));
  assert.strictEqual(esquerda.ultimo().style.left, "8px");
});

test("a lista traz hora e minuto lado a lado, cada um com o valor atual marcado", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  const html = a.ultimo().innerHTML;
  assert.ok(html.includes('data-campo="hora"') && html.includes('data-campo="minuto"'));
  assert.ok(html.includes('class="mac-hm-item sel" tabindex="-1" data-n="19"'));
  assert.ok(html.includes('class="mac-hm-item sel" tabindex="-1" data-n="3"'));
});

test("clicar de novo no relogio da mesma rodada fecha a lista", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  const botao = a.relogio();
  a.ctx._macAbrirHorario(0, botao);
  a.ctx._macAbrirHorario(0, botao);
  assert.strictEqual(a.criados.length, 1, "nao abriu uma segunda");
  assert.strictEqual(a.ultimo().removido, true);
});

test("abrir a lista de outra rodada troca a lista: nunca ficam duas abertas", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }, { ...RODADA, hora: 8 }];
  a.ctx._macAbrirHorario(0, a.relogio());
  a.ctx._macAbrirHorario(1, a.relogio());
  assert.strictEqual(a.criados.length, 2);
  assert.strictEqual(a.criados[0].removido, true);
  assert.strictEqual(a.criados[1].removido, false);
});

test("Escape fecha a lista", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  let parou = false;
  a.disparar("keydown", { key: "Escape", stopPropagation() { parou = true; } });
  assert.strictEqual(a.ultimo().removido, true);
  assert.strictEqual(parou, true, "o Escape nao fecha tambem o modal por baixo");
});

test("outra tecla nao fecha", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  a.disparar("keydown", { key: "Enter", stopPropagation() {} });
  assert.strictEqual(a.ultimo().removido, false);
});

test("clicar fora fecha; clicar dentro da lista ou no relogio nao", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  const botao = a.relogio();
  a.ctx._macAbrirHorario(0, botao);

  a.disparar("mousedown", { target: { dentroDaLista: true } });
  assert.strictEqual(a.ultimo().removido, false, "dentro da lista");
  a.disparar("mousedown", { target: botao });
  assert.strictEqual(a.ultimo().removido, false, "no proprio relogio (quem fecha e o clique dele)");
  a.disparar("mousedown", { target: { dentroDaLista: false } });
  assert.strictEqual(a.ultimo().removido, true, "fora");
});

test("redimensionar a janela fecha a lista (ela e fixa na tela e ficaria fora do lugar)", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  a.disparar("resize", {});
  assert.strictEqual(a.ultimo().removido, true);
});

test("fechar remove todos os ouvintes, pra nao vazar nem fechar a lista da proxima vez", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  assert.ok(a.docOuvintes.length >= 2 && a.winOuvintes.length >= 1, "abriu com ouvintes");
  a.ctx._macFecharHorario();
  assert.deepStrictEqual(a.docOuvintes, []);
  assert.deepStrictEqual(a.winOuvintes, []);
});

test("fechar sem nada aberto nao quebra", () => {
  const a = carregarComLista();
  a.ctx._macFecharHorario();
  a.ctx._macFecharHorario();
});

test("escolher a HORA grava, atualiza o campo e deixa a lista aberta pra escolher o minuto", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  const botao = a.relogio();
  a.ctx._macAbrirHorario(0, botao);

  a.ctx._macEscolherHm(0, "hora", 7);
  assert.strictEqual(a.m.rodadas[0].hora, 7);
  assert.strictEqual(botao.campo.value, "07:03", "o campo acompanha, com dois digitos");
  assert.strictEqual(a.ultimo().removido, false, "ainda falta o minuto");
});

test("escolher o MINUTO grava, atualiza o campo e fecha a lista", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  const botao = a.relogio();
  a.ctx._macAbrirHorario(0, botao);

  a.ctx._macEscolherHm(0, "minuto", 45);
  assert.strictEqual(a.m.rodadas[0].minuto, 45);
  assert.strictEqual(botao.campo.value, "19:45");
  assert.strictEqual(a.ultimo().removido, true);
});

test("escolher marca so o item escolhido na coluna, e mexe so na coluna certa", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macAbrirHorario(0, a.relogio());
  a.ctx._macEscolherHm(0, "hora", 7);

  const marcadosHora = a.ultimo().lista.hora.filter((it) => it.marcado).map((it) => it.dataset.n);
  assert.deepStrictEqual(marcadosHora, ["7"]);
  assert.strictEqual(a.ultimo().lista.minuto.filter((it) => it.marcado).length, 0, "minuto intocado");
});

test("meia-noite escolhida na lista vale: hora 0 e minuto 0, nao vazio", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  const botao = a.relogio();
  a.ctx._macAbrirHorario(0, botao);
  a.ctx._macEscolherHm(0, "hora", 0);
  a.ctx._macEscolherHm(0, "minuto", 0);
  assert.strictEqual(a.m.rodadas[0].hora, 0);
  assert.strictEqual(a.m.rodadas[0].minuto, 0);
  assert.strictEqual(botao.campo.value, "00:00");
});

test("escolher sem a lista aberta (clique atrasado) so grava, sem quebrar", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }];
  a.ctx._macEscolherHm(0, "hora", 5);
  assert.strictEqual(a.m.rodadas[0].hora, 5);
});

test("redesenhar as rodadas (remover uma, trocar o criterio) fecha a lista aberta", () => {
  const a = carregarComLista();
  a.m.rodadas = [{ ...RODADA }, { ...RODADA, hora: 8 }];
  a.ctx._macAbrirHorario(0, a.relogio());
  a.ctx._macRemoverRodada(1);
  assert.strictEqual(a.ultimo().removido, true, "a lista era de uma linha que foi redesenhada");
});

// ── a lista da tela, em seções ──────────────────────────────────────────────
// Avisos de rota incompleta (XPT_CFC funciona, XPT_VIA ainda não) e Macros > Shopee (três
// ainda não integrados). O que se protege: só o que existe no servidor ganha "Configurar", o
// que ainda não foi integrado fica marcado sem ação, e nenhum macro do servidor some da tela.
const AVISO = { chave: "avisos_entregador", nome: "Aviso de rota incompleta (Shopee)", descricao: "d", ativo: true,
  resumo: "19:05 Abaixo de 90% concluído · 22:05 Mais de 1 pacotes em Delivering" };

test("a tela traz as duas secoes e todos os itens, na ordem", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([AVISO]);
  const ordem = ["Avisos de rota incompleta", "Shopee XPT_CFC", "Shopee XPT_VIA", ">Macros<", ">Shopee<",
    "Alimentar AT exportada", "Pedidos pesquisados", "Backlog"].map((t) => html.indexOf(t));
  ordem.forEach((pos, k) => assert.ok(pos >= 0, `item ${k} nao apareceu`));
  assert.deepStrictEqual([...ordem].sort((x, y) => x - y), ordem);
});

test("so o aviso da XPT_CFC tem Configurar; os outros ficam como ainda nao integrado", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([AVISO]);
  assert.strictEqual(html.split("_macAbrirConfigurar(").length - 1, 1);
  assert.ok(html.includes("_macAbrirConfigurar('avisos_entregador')"));
  assert.strictEqual(html.split("Ainda não integrado").length - 1, 4, "XPT_VIA + os tres da Shopee");
});

test("o resumo vira uma linha por rodada, horario separado do criterio", () => {
  const a = carregar();
  const html = a.ctx._macResumoHtml(AVISO.resumo);
  assert.strictEqual(html.split("mac-agenda-linha").length - 1, 2);
  assert.ok(html.includes('<span class="mac-agenda-hora">19:05</span><span>abaixo de 90% concluído</span>'));
  assert.ok(html.includes('<span class="mac-agenda-hora">22:05</span>'));
});

test("resumo fora do formato passa inteiro, e vazio nao quebra", () => {
  const a = carregar();
  assert.ok(a.ctx._macResumoHtml("sem rodada configurada").includes("<span>sem rodada configurada</span>"));
  assert.strictEqual(a.ctx._macResumoHtml(""), "");
  assert.strictEqual(a.ctx._macResumoHtml(undefined), "");
});

test("macro desligado aparece como Desligado", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([{ ...AVISO, ativo: false }]);
  assert.ok(html.includes(">Desligado<") && !html.includes(">Ativo<"));
});

test("se o servidor nao manda o aviso, a linha fica sem Configurar (nao abre modal vazio)", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([]);
  assert.ok(!html.includes("_macAbrirConfigurar("));
  assert.ok(html.includes("Indisponível no momento"));
});

test("macro do servidor sem lugar na tela nao some: vai pra Outros, configuravel", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([AVISO, { chave: "novo_macro", nome: "Novo", descricao: "x", ativo: true, resumo: "" }]);
  assert.ok(html.includes(">Outros<"));
  assert.ok(html.includes("_macAbrirConfigurar('novo_macro')"));
});

test("nome e resumo vindos do servidor nao viram HTML", () => {
  const a = carregar();
  const html = a.ctx._macHtmlSecoes([AVISO, { chave: "z", nome: "<b>n</b>", descricao: "<i>d</i>", ativo: true, resumo: "10:00 <s>x</s>" }]);
  assert.ok(!html.includes("<b>n</b>") && !html.includes("<i>d</i>") && !html.includes("<s>x</s>"));
});

test("o titulo do modal usa o nome da tela", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macTituloModal("avisos_entregador"), "Avisos de rota incompleta — Shopee XPT_CFC");
});

// ── interruptor de ligar/desligar na lista ──────────────────────────────────
// Grava só o "ativo" (rota própria, as rodadas ficam como estão), troca na hora e volta atrás
// se o servidor recusar — a tela nunca fica dizendo "Ativo" de um aviso que está desligado.
function carregarComFetch(resposta) {
  const els = {};
  const chamadas = [];
  const alertas = [];
  const ctx = vm.createContext({
    console, API: "https://api.teste", token: "tk",
    document: { getElementById: (id) => els[id] || (els[id] = { id, style: {}, innerHTML: "" }) },
    gcAlert: (msg) => alertas.push(msg),
    fetch: (url, opcoes) => {
      chamadas.push({ url, opcoes });
      return resposta();
    },
  });
  vm.runInContext(fonte + ACESSOR + ";globalThis.__lista = { set v(x) { _macLista = x; }, get v() { return _macLista; } };", ctx, { filename: "macros.js" });
  return { ctx, els, chamadas, alertas, lista: ctx.__lista };
}
const esperar = () => new Promise((resolve) => setImmediate(resolve));

test("a linha do aviso tem o interruptor, marcado conforme o ativo", () => {
  const a = carregar();
  const ligado = a.ctx._macHtmlSecoes([AVISO]);
  assert.ok(ligado.includes("_macAlternarAtivo('avisos_entregador', this)"));
  assert.ok(ligado.includes('aria-checked="true"') && ligado.includes("gc-toggle--on"));
  const desligado = a.ctx._macHtmlSecoes([{ ...AVISO, ativo: false }]);
  assert.ok(desligado.includes('aria-checked="false"') && !desligado.includes("gc-toggle--on"));
});

test("itens ainda nao integrados nao tem interruptor", () => {
  const a = carregar();
  assert.strictEqual(a.ctx._macHtmlSecoes([AVISO]).split("_macAlternarAtivo(").length - 1, 1);
});

test("clicar no interruptor desliga na hora e manda so o ativo pra rota certa", async () => {
  const a = carregarComFetch(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, ativo: false }) }));
  a.lista.v = [{ ...AVISO }];
  a.ctx._macAlternarAtivo("avisos_entregador", null);
  assert.strictEqual(a.lista.v[0].ativo, false);
  assert.ok(a.els["mac-lista"].innerHTML.includes(">Desligado<"), "a tela ja mostra desligado");
  assert.strictEqual(a.chamadas[0].url, "https://api.teste/admin/macros/avisos-entregador/ativo");
  assert.strictEqual(a.chamadas[0].opcoes.method, "PUT");
  assert.strictEqual(a.chamadas[0].opcoes.body, JSON.stringify({ ativo: false }));
  await esperar();
  assert.strictEqual(a.lista.v[0].ativo, false);
  assert.strictEqual(a.alertas.length, 0);
});

test("se o servidor recusa, o interruptor volta como estava e avisa", async () => {
  const a = carregarComFetch(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "Acesso negado" }) }));
  a.lista.v = [{ ...AVISO, ativo: false }];
  a.ctx._macAlternarAtivo("avisos_entregador", null);
  assert.strictEqual(a.lista.v[0].ativo, true);
  await esperar();
  assert.strictEqual(a.lista.v[0].ativo, false);
  assert.ok(a.els["mac-lista"].innerHTML.includes(">Desligado<"));
  assert.deepStrictEqual(a.alertas, ["Acesso negado"]);
});

test("sem conexao, o interruptor tambem volta", async () => {
  const a = carregarComFetch(() => Promise.reject(new Error("rede")));
  a.lista.v = [{ ...AVISO }];
  a.ctx._macAlternarAtivo("avisos_entregador", null);
  await esperar();
  assert.strictEqual(a.lista.v[0].ativo, true);
  assert.deepStrictEqual(a.alertas, ["Erro ao conectar com o servidor."]);
});
