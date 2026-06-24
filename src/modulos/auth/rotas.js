import { Router } from 'express';
import { body } from 'express-validator';
import { loginLocal, registrar, renovarToken, obterPerfil, alterarSenha } from './controlador.js';
import { autenticar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

/**
 * POST /auth/login — Login local (email + senha)
 */
roteador.post(
  '/login',
  [
    body('email').isEmail().withMessage('E-mail inválido'),
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
  ],
  validar,
  loginLocal
);

/**
 * POST /auth/registrar — Cadastro público (nome + email + senha)
 */
roteador.post(
  '/registrar',
  [
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    body('email').isEmail().withMessage('E-mail inválido'),
    body('senha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres'),
  ],
  validar,
  registrar
);

/**
 * POST /auth/refresh — Renovar access token
 */
roteador.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken é obrigatório')],
  validar,
  renovarToken
);

/**
 * GET /auth/me — Dados do usuário autenticado
 */
roteador.get('/me', autenticar, obterPerfil);

/**
 * PATCH /auth/senha — Alterar própria senha
 */
roteador.patch(
  '/senha',
  autenticar,
  [body('novaSenha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres')],
  validar,
  alterarSenha
);

export default roteador;
