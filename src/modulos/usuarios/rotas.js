import { Router } from 'express';
import { body } from 'express-validator';
import { listar, obterPorId, alterarPerfil, alterarAtivo } from './controlador.js';
import { autenticar, autorizar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

// Todos os endpoints de usuários exigem autenticação + admin
roteador.use(autenticar, autorizar('admin'));

roteador.get('/', listar);
roteador.get('/:id', obterPorId);

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

export default roteador;
