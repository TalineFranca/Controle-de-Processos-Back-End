import jwt from 'jsonwebtoken';
import ambiente from '../config/ambiente.js';
import Usuario from '../modelos/Usuario.js';
import { manipuladorAsync } from '../utils/auxiliares.js';

/**
 * Middleware de autenticação via JWT Bearer token.
 * Injeta req.usuario com o usuário autenticado.
 */
export const autenticar = manipuladorAsync(async (req, res, next) => {
  const cabecalho = req.headers.authorization;

  if (!cabecalho || !cabecalho.startsWith('Bearer ')) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Token de autenticação não fornecido',
    });
  }

  const token = cabecalho.split(' ')[1];

  const payload = jwt.verify(token, ambiente.jwt.segredo);

  const usuario = await Usuario.findById(payload.sub).select('-__v');

  if (!usuario) {
    return res.status(401).json({
      sucesso: false,
      erro: 'Usuário não encontrado',
    });
  }

  if (!usuario.ativo) {
    return res.status(403).json({
      sucesso: false,
      erro: 'Conta desativada. Entre em contato com o administrador.',
    });
  }

  req.usuario = usuario;
  next();
});

/**
 * Middleware de autorização por perfil (role).
 * Uso: autorizar('admin') ou autorizar('admin', 'operador')
 */
export function autorizar(...perfisPermitidos) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ sucesso: false, erro: 'Não autenticado' });
    }

    if (!perfisPermitidos.includes(req.usuario.perfil)) {
      return res.status(403).json({
        sucesso: false,
        erro: 'Acesso não autorizado para este perfil',
      });
    }

    next();
  };
}
