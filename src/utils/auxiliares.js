export function manipuladorAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function criarErro(mensagem, statusCode = 500) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

export function respostaPaginada(dados, total, pagina, limite) {
  return {
    sucesso: true,
    dados,
    paginacao: {
      total,
      pagina: parseInt(pagina),
      limite: parseInt(limite),
      totalPaginas: Math.ceil(total / limite),
    },
  };
}

export function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function regexSemAcento(texto) {
  const mapa = {
    a: '[aáàâãä]', A: '[AÁÀÂÃÄaáàâãä]',
    e: '[eéèêë]',  E: '[EÉÈÊËeéèêë]',
    i: '[iíìîï]',  I: '[IÍÌÎÏiíìîï]',
    o: '[oóòôõö]', O: '[OÓÒÔÕÖoóòôõö]',
    u: '[uúùûü]',  U: '[UÚÙÛÜuúùûü]',
    c: '[cç]',     C: '[CÇcç]',
    n: '[nñ]',     N: '[NÑnñ]',
  };

  const base = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/[a-zA-Z]/g, (c) => mapa[c] || c);
  return new RegExp(pattern, 'i');
}