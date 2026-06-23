import { validationResult } from 'express-validator';

/**
 * Middleware que verifica os erros coletados pelo express-validator.
 * Deve ser usado após as regras de validação nas rotas.
 */
export function validar(req, res, next) {
  const erros = validationResult(req);

  if (!erros.isEmpty()) {
    return res.status(400).json({
      sucesso: false,
      erro: 'Dados inválidos',
      detalhes: erros.array().map((e) => ({ campo: e.path, mensagem: e.msg })),
    });
  }

  next();
}
