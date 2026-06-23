import { Router } from 'express';
import { listar, listarUnidades, obterPorId, atualizar } from './controlador.js';
import { autenticar, autorizar } from '../../middlewares/autenticacao.js';

const roteador = Router();

roteador.use(autenticar);

roteador.get('/', listar);
roteador.get('/unidades', listarUnidades);
roteador.get('/:id', obterPorId);
roteador.patch('/:id', autorizar('admin', 'operador'), atualizar);

export default roteador;
