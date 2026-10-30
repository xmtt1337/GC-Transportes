"""XM Consulta: escolhe a transportadora, cola os codigos, sai um CSV.

O programa e o cerebro (login, fila, CSV) e a extensao sao as maos (a aba
logada na transportadora). Mesmo arranjo do XM Vigia.

A senha do sistema nao fica salva: entra-se a cada abertura. Em config.json so
ficam o usuario e a chave que liga programa e extensao.
"""

import json
import os
import secrets
import threading
import time
import tkinter
import webbrowser

import customtkinter as ctk

import consulta
from ponte_consulta import ErroDaPonte, Ponte

CONFIG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "XM_Consulta")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
PASTA_CSV = os.path.join(os.path.expanduser("~"), "Downloads", "XM Consulta")
ESPERA_EXTENSAO_S = 40
ESPERA_ABA_S = 30


def carregar_config():
    os.makedirs(CONFIG_DIR, exist_ok=True)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)
    except (OSError, ValueError):
        cfg = {}
    if not cfg.get("chave"):
        cfg["chave"] = secrets.token_hex(32)
        salvar_config(cfg)
    return cfg


def salvar_config(cfg):
    temporario = f"{CONFIG_PATH}.tmp"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(cfg, f)
    os.replace(temporario, CONFIG_PATH)


class App:
    def __init__(self):
        self.cfg = carregar_config()
        self.backend = consulta.Backend(verificar=consulta.bundle_de_certificados(CONFIG_DIR))
        self.parar_evento = threading.Event()
        self.rodando = False
        self.ultimo_csv = None

        ctk.set_appearance_mode("dark")
        self.raiz = ctk.CTk()
        self.raiz.title("XM Consulta")
        self.raiz.geometry("560x640")
        self.raiz.protocol("WM_DELETE_WINDOW", self._fechar)

        self.ponte = Ponte(self.cfg["chave"], ao_mudar=lambda _: self.raiz.after(0, self._mostrar_extensao))
        self.tela_login()

    def _limpar(self):
        for filho in self.raiz.winfo_children():
            filho.destroy()

    # ── login ───────────────────────────────────────────────────────────
    def tela_login(self, aviso=""):
        self._limpar()
        caixa = ctk.CTkFrame(self.raiz, fg_color="transparent")
        caixa.pack(expand=True)
        ctk.CTkLabel(caixa, text="XM Consulta", font=("", 22, "bold")).pack(pady=(0, 16))
        self.campo_usuario = ctk.CTkEntry(caixa, width=280, placeholder_text="Usuário do sistema")
        self.campo_usuario.pack(pady=4)
        if self.cfg.get("usuario"):
            self.campo_usuario.insert(0, self.cfg["usuario"])
        self.campo_senha = ctk.CTkEntry(caixa, width=280, show="•", placeholder_text="Senha")
        self.campo_senha.pack(pady=4)
        self.campo_senha.bind("<Return>", lambda _: self._entrar())
        self.botao_entrar = ctk.CTkButton(caixa, text="Entrar", width=280, command=self._entrar)
        self.botao_entrar.pack(pady=(10, 4))
        self.aviso_login = ctk.CTkLabel(caixa, text=aviso, text_color="#f87171", wraplength=280)
        self.aviso_login.pack()

    def _entrar(self):
        usuario = self.campo_usuario.get().strip()
        senha = self.campo_senha.get()
        if not usuario or not senha:
            return
        self.botao_entrar.configure(state="disabled", text="Entrando...")

        def trabalho():
            try:
                nome = self.backend.entrar(usuario, senha)
            except (consulta.ErroDeConta, consulta.ErroDeServidor) as e:
                self.raiz.after(0, lambda m=str(e): self.tela_login(m))
                return
            self.cfg["usuario"] = usuario
            salvar_config(self.cfg)
            self.raiz.after(0, lambda: self.tela_principal(nome))

        threading.Thread(target=trabalho, daemon=True).start()

    # ── tela principal ──────────────────────────────────────────────────
    def tela_principal(self, nome):
        self._limpar()
        if self.ponte.thread is None:
            try:
                self.ponte.iniciar()
            except ErroDaPonte as e:
                self.tela_login(str(e))
                self.ponte.thread = None
                return

        c = ctk.CTkFrame(self.raiz, fg_color="transparent")
        c.pack(fill="both", expand=True, padx=16, pady=14)
        ctk.CTkLabel(c, text=f"Logado como {nome}", text_color="#a8adb7").pack(anchor="w")

        ctk.CTkLabel(c, text="Transportadora").pack(anchor="w", pady=(10, 2))
        self.opcoes = {
            (t.nome if t.ativa else f"{t.nome} (em breve)"): t for t in consulta.TRANSPORTADORAS
        }
        self.escolha = ctk.CTkOptionMenu(c, values=list(self.opcoes), command=lambda _: self._contar())
        self.escolha.pack(anchor="w")

        ctk.CTkLabel(c, text="Códigos de pacote (um por linha)").pack(anchor="w", pady=(10, 2))
        self.caixa = ctk.CTkTextbox(c, height=200)
        self.caixa.pack(fill="both", expand=True)
        self.caixa.bind("<KeyRelease>", lambda _: self._contar())
        self.caixa.bind("<<Paste>>", lambda _: self.raiz.after(50, self._contar))
        self.contagem = ctk.CTkLabel(c, text="", text_color="#a8adb7")
        self.contagem.pack(anchor="w")

        botoes = ctk.CTkFrame(c, fg_color="transparent")
        botoes.pack(fill="x", pady=(6, 8))
        self.botao_iniciar = ctk.CTkButton(botoes, text="Iniciar consulta", command=self._iniciar)
        self.botao_iniciar.pack(side="left")
        self.botao_parar = ctk.CTkButton(
            botoes, text="Parar", state="disabled", fg_color="transparent", border_width=1,
            command=self.parar_evento.set)
        self.botao_parar.pack(side="left", padx=8)

        self.barra = ctk.CTkProgressBar(c)
        self.barra.set(0)
        self.barra.pack(fill="x")
        self.progresso = ctk.CTkLabel(c, text="0%")
        self.progresso.pack(anchor="w")
        self.mensagem = ctk.CTkLabel(c, text="", wraplength=520, justify="left")
        self.mensagem.pack(anchor="w")
        self.botao_pasta = ctk.CTkButton(
            c, text="Abrir pasta do CSV", fg_color="transparent", border_width=1, command=self._abrir_pasta)

        rodape = ctk.CTkFrame(c, fg_color="transparent")
        rodape.pack(fill="x", pady=(8, 0))
        self.estado_extensao = ctk.CTkLabel(rodape, text="")
        self.estado_extensao.pack(side="left")
        ctk.CTkButton(rodape, text="Copiar chave da extensão", fg_color="transparent",
                      border_width=1, command=self._copiar_chave).pack(side="right")

        self._mostrar_extensao()
        self._contar()

    def _mostrar_extensao(self):
        if not hasattr(self, "estado_extensao") or not self.estado_extensao.winfo_exists():
            return
        if self.ponte.conectada:
            self.estado_extensao.configure(text="Extensão ligada", text_color="#4ade80")
        else:
            self.estado_extensao.configure(text="Extensão não ligada", text_color="#fbbf24")

    def _copiar_chave(self):
        self.raiz.clipboard_clear()
        self.raiz.clipboard_append(self.cfg["chave"])
        self.mensagem.configure(text="Chave copiada. Cole no ícone da extensão XM Consulta.")

    def _transportadora(self):
        return self.opcoes[self.escolha.get()]

    def _contar(self):
        t = self._transportadora()
        if not t.ativa:
            self.contagem.configure(text=f"{t.nome} ainda não está disponível.")
            self.botao_iniciar.configure(state="disabled")
            return
        codigos, ignorados = consulta.extrair_codigos(self.caixa.get("1.0", "end"), t.padrao)
        texto = f"{len(codigos)} códigos"
        if ignorados:
            texto += f" · {ignorados} ignorados (não parecem da {t.nome})"
        self.contagem.configure(text=texto)
        self.botao_iniciar.configure(state="normal" if codigos and not self.rodando else "disabled")

    # ── execucao ────────────────────────────────────────────────────────
    def _iniciar(self):
        t = self._transportadora()
        codigos, _ = consulta.extrair_codigos(self.caixa.get("1.0", "end"), t.padrao)
        self.rodando = True
        self.parar_evento.clear()
        self.botao_iniciar.configure(state="disabled")
        self.botao_parar.configure(state="normal")
        self.botao_pasta.pack_forget()
        self.barra.set(0)
        self.progresso.configure(text="0%")
        threading.Thread(target=self._trabalhar, args=(t, codigos), daemon=True).start()

    def _dizer(self, texto):
        self.raiz.after(0, lambda: self.mensagem.configure(text=texto))

    def _esperar_extensao(self, t):
        if self.ponte.conectada:
            return
        self._dizer("Abrindo o site e aguardando a extensão...")
        webbrowser.open(t.url)
        limite = time.monotonic() + ESPERA_EXTENSAO_S
        while not self.ponte.conectada and time.monotonic() < limite:
            if self.parar_evento.is_set():
                raise ErroDaPonte("Parado.")
            time.sleep(0.3)
        if not self.ponte.conectada:
            raise ErroDaPonte(
                "A extensão não ligou. Confira se ela está instalada neste perfil do Chrome "
                "e se a chave foi colada.")

    def _trabalhar(self, t, codigos):
        inicio = time.monotonic()

        def avancar(feitos, total):
            medio = (time.monotonic() - inicio) / feitos
            falta = consulta.texto_tempo(medio * (total - feitos))
            pct = consulta.porcentagem(feitos, total)
            self.raiz.after(0, lambda: self._mostrar_progresso(feitos, total, pct, falta))

        try:
            self._dizer("Conferindo seu acesso...")
            self.backend.conferir()
            self._esperar_extensao(t)
            self._dizer("Preparando a aba da transportadora...")
            r = self.ponte.pedir({"tipo": "preparar", "transportadora": t.chave}, prazo=ESPERA_ABA_S)
            if not r.get("ok"):
                raise ErroDaPonte(r.get("erro") or "A aba não ficou pronta.")
            self._dizer("Consultando...")
            inicio = time.monotonic()
            res = consulta.executar(t.chave, codigos, self.ponte.pedir, avancar, self.parar_evento)
        except consulta.ErroDeConta as e:
            self.raiz.after(0, lambda m=str(e): self._terminar_sem_sessao(m))
            return
        except Exception as e:
            res = consulta.Resultado(pendentes=codigos, erro=str(e))
        self.raiz.after(0, lambda: self._terminar(t, res))

    def _mostrar_progresso(self, feitos, total, pct, falta):
        self.barra.set(pct / 100)
        self.progresso.configure(text=f"{pct}%  ·  {feitos} de {total}  ·  faltam {falta}")

    def _terminar_sem_sessao(self, mensagem):
        self.rodando = False
        self.tela_login(mensagem)

    def _terminar(self, t, res):
        self.rodando = False
        self.botao_parar.configure(state="disabled")

        partes = []
        if res.linhas:
            self.ultimo_csv = consulta.gravar_csv(PASTA_CSV, t.chave, res.linhas)
            sem_whats = sum(1 for l in res.linhas if not l["whatsapp"])
            partes.append(f"{len(res.linhas)} pacotes em {os.path.basename(self.ultimo_csv)}")
            if sem_whats:
                partes.append(f"{sem_whats} sem WhatsApp válido")
            self.botao_pasta.pack(anchor="w", pady=(6, 0))
        if res.erro:
            partes.insert(0, res.erro)
        if res.parado:
            partes.insert(0, "Parado por você.")
        if res.pendentes:
            self.caixa.delete("1.0", "end")
            self.caixa.insert("1.0", "\n".join(res.pendentes))
            partes.append(f"{len(res.pendentes)} códigos que faltaram ficaram na caixa")

        cor = "#f87171" if res.erro else "#e8eaed"
        texto = ". ".join(p.rstrip(".") for p in partes) + "."
        self.mensagem.configure(text=texto, text_color=cor)
        self._contar()

    def _abrir_pasta(self):
        os.startfile(PASTA_CSV)

    def _fechar(self):
        self.parar_evento.set()
        self.ponte.parar()
        self.raiz.destroy()

    def rodar(self):
        self.raiz.mainloop()


if __name__ == "__main__":
    try:
        App().rodar()
    except tkinter.TclError as e:
        print(f"Não consegui abrir a janela: {e}")
