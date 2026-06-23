import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  listar,
  listarTipos,
  listarSituacoes,
  dashboard,
  obterPorId,
  criar,
  atualizar,
  alterarSituacao,
  atualizarDocumentos,
  exportar,
} from './controlador.js';
import { autenticar, autorizar } from '../../middlewares/autenticacao.js';
import { validar } from '../../middlewares/validacao.js';

const roteador = Router();

// Todos os endpoints exigem autenticação
roteador.use(autenticar);

// Leitura — qualquer perfil autenticado
roteador.get('/', listar);
roteador.get('/tipos', listarTipos);
roteador.get('/situacoes', listarSituacoes);
roteador.get('/dashboard', dashboard);
roteador.get('/exportar', exportar);
roteador.get('/:id', [param('id').isMongoId().withMessage('ID inválido')], validar, obterPorId);

// Escrita — operador ou admin
roteador.post(
  '/',
  autorizar('admin', 'operador'),
  [
    body('policialId').isMongoId().withMessage('policialId inválido'),
    body('tipoProcesso').notEmpty().withMessage('Tipo do processo é obrigatório'),
  ],
  validar,
  criar
);

roteador.put(
  '/:id',
  autorizar('admin', 'operador'),
  [param('id').isMongoId().withMessage('ID inválido')],
  validar,
  atualizar
);

roteador.patch(
  '/:id/situacao',
  autorizar('admin', 'operador'),
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('situacao').notEmpty().withMessage('Situação é obrigatória'),
  ],
  validar,
  alterarSituacao
);

roteador.patch(
  '/:id/documentos',
  autorizar('admin', 'operador'),
  [param('id').isMongoId().withMessage('ID inválido')],
  validar,
  atualizarDocumentos
);

export default roteador;
