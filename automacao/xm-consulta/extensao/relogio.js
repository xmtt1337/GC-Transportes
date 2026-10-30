// Pausa entre consultas. Em Worker porque o Chrome segura o setTimeout de aba em
// segundo plano (1x por segundo, e 1x por minuto depois de 5 minutos), e quem
// troca de aba durante uma lista grande faria a consulta quase parar.

self.onmessage = (e) => {
  setTimeout(() => self.postMessage(e.data.id), e.data.ms);
};
