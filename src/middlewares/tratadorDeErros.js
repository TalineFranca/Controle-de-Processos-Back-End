/**
 * Middleware de tratamento global de erros.
 */
export function tratadorDeErros(erro, req, res, _next) {
  // Erros de validação do Mongoose
  if (erro.name === 'ValidationError') {
    const mensagens = Object.values(erro.errors).map((e) => e.message);
    return res.status(400).json({
      sucesso: false,
      erro: 'Dados inválidos',
      detalhes: mensagens,
    });
  }

  // Duplicata (índice único)
  if (erro.code === 11000) {
    const campo = Object.keys(erro.keyValue || {})[0] || 'campo';
    return res.status(409).json({
      sucesso: false,
      erro: `Já existe um registro com esse ${campo}`,
    });
  }

  // CastError (ID inválido)
  if (erro.name === 'CastError') {
    return res.status(400).json({
      sucesso: false,
      erro: 'ID inválido',
    });
  }

  // JWT inválido
  if (erro.name === 'JsonWebTokenError') {
    return res.status(401).json({
      sucesso: false,
      erro: 'Token inválido',
    });
  }

  if (erro.name === 'TokenExpiredError') {
    return res.status(401).json({
      sucesso: false,
      erro: 'Token expirado',
    });
  }

  const statusCode = erro.statusCode || 500;
  const mensagem = erro.message || 'Erro interno do servidor';

  console.error(`[Erro ${statusCode}] ${req.method} ${req.path} - ${mensagem}`, statusCode === 500 ? erro.stack : '');

  res.status(statusCode).json({
    sucesso: false,
    erro: mensagem,
    ...(process.env.NODE_ENV === 'development' && { stack: erro.stack }),
  });
}
