import { Router } from 'express';
import { body } from 'express-validator';
import {
  loginLocal,
  criarUsuario,
  listarUsuarios,
  alterarStatusUsuario,
  alterarPerfil,
  redefinirSenha,
  renovarToken,
  obterPerfil,
  alterarSenha,
} from './controlador.js';
import { autenticar, autorizar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

/**
 * POST /auth/login — Login com nomeUsuario + senha
 */
roteador.post(
  '/login',
  [
    body('nomeUsuario').notEmpty().withMessage('Nome de usuário é obrigatório'),
    body('senha').notEmpty().withMessage('Senha é obrigatória'),
  ],
  validar,
  loginLocal
);

/**
 * POST /auth/usuarios — Criar usuário (somente admin)
 */
roteador.post(
  '/usuarios',
  autenticar,
  autorizar('admin'),
  [
    body('nomeUsuario').notEmpty().trim().withMessage('Nome de usuário é obrigatório'),
    body('nome').notEmpty().trim().withMessage('Nome é obrigatório'),
    body('senha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres'),
  ],
  validar,
  criarUsuario
);

/**
 * GET /auth/usuarios — Listar usuários (somente admin)
 */
roteador.get('/usuarios', autenticar, autorizar('admin'), listarUsuarios);

/**
 * PATCH /auth/usuarios/:id/status — Ativar/desativar (somente admin)
 */
roteador.patch('/usuarios/:id/status', autenticar, autorizar('admin'), alterarStatusUsuario);

/**
 * PATCH /auth/usuarios/:id/perfil — Alterar perfil (somente admin)
 */
roteador.patch(
  '/usuarios/:id/perfil',
  autenticar,
  autorizar('admin'),
  [body('perfil').isIn(['admin', 'operador', 'visualizador']).withMessage('Perfil inválido')],
  validar,
  alterarPerfil
);

/**
 * PATCH /auth/usuarios/:id/senha — Redefinir senha de outro usuário (somente admin)
 */
roteador.patch(
  '/usuarios/:id/senha',
  autenticar,
  autorizar('admin'),
  [body('novaSenha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres')],
  validar,
  redefinirSenha
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