import { Router } from 'express';
import { body } from 'express-validator';
import { listar, obterPorId, criar, alterarPerfil, alterarAtivo, redefinirSenha } from './controlador.js';
import { autenticar, autorizar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

// Todos os endpoints de usuários exigem autenticação + admin
roteador.use(autenticar, autorizar('admin'));

roteador.get('/', listar);
roteador.get('/:id', obterPorId);

// Criar usuário com login local
roteador.post(
  '/',
  [
    body('nome').notEmpty().withMessage('Nome é obrigatório'),
    body('email').isEmail().withMessage('E-mail inválido'),
    body('senha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres'),
  ],
  validar,
  criar
);

roteador.patch(
  '/:id/perfil',
  [body('perfil').notEmpty().withMessage('Perfil é obrigatório')],
  validar,
  alterarPerfil
);

roteador.patch(
  '/:id/ativo',
  [body('ativo').isBoolean().withMessage('ativo deve ser boolean')],
  validar,
  alterarAtivo
);

roteador.patch(
  '/:id/senha',
  [body('novaSenha').isLength({ min: 8 }).withMessage('Senha deve ter pelo menos 8 caracteres')],
  validar,
  redefinirSenha
);

export default roteador;
