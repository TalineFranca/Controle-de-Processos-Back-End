import { Router } from 'express';
import { body } from 'express-validator';
import { loginGoogle, renovarToken, obterPerfil } from './controlador.js';
import { autenticar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Login com Google OAuth
 *     tags: [Autenticação]
 *     security: []
 */
roteador.post(
  '/google',
  [body('idToken').notEmpty().withMessage('idToken é obrigatório')],
  validar,
  loginGoogle
);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Renovar access token
 *     tags: [Autenticação]
 *     security: []
 */
roteador.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('refreshToken é obrigatório')],
  validar,
  renovarToken
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Dados do usuário autenticado
 *     tags: [Autenticação]
 */
roteador.get('/me', autenticar, obterPerfil);

export default roteador;
