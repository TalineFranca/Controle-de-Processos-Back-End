import { Router } from 'express';
import { autenticar } from '../../middlewares/autenticacao.js';
import {
  listar,
  dashboard,
  obterPorId,
  criar,
  marcarFeito,
  marcarNaoFeito,
  excluir,
} from './controlador.js';

const roteador = Router();

roteador.use(autenticar);

roteador.get('/', listar);
roteador.get('/dashboard', dashboard);
roteador.get('/:id', obterPorId);
roteador.post('/', criar);
roteador.patch('/:id/feito', marcarFeito);
roteador.patch('/:id/nao-feito', marcarNaoFeito);
roteador.delete('/:id', excluir);

export default roteador;
