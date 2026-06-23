/**
 * Wrapper para handlers async do Express.
 * Captura erros e repassa ao middleware global de erros.
 */
export function manipuladorAsync(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Cria um erro HTTP com statusCode.
 */
export function criarErro(mensagem, statusCode = 500) {
  const erro = new Error(mensagem);
  erro.statusCode = statusCode;
  return erro;
}

/**
 * Formata resposta paginada padrão.
 */
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

/**
 * Normaliza string para busca (remove acentos, minúsculas).
 */
export function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
