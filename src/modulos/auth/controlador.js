import jwt from 'jsonwebtoken';
import ambiente from '../../config/ambiente.js';
import Usuario from '../../models/Usuario.js';
import { manipuladorAsync, criarErro } from '../../utils/auxiliares.js';

function gerarTokens(usuario) {
  const payload = {
    sub: usuario._id.toString(),
    nomeUsuario: usuario.nomeUsuario,
    perfil: usuario.perfil,
  };

  const accessToken = jwt.sign(payload, ambiente.jwt.segredo, {
    expiresIn: ambiente.jwt.expiracao,
  });

  const refreshToken = jwt.sign(
    { sub: usuario._id.toString() },
    ambiente.jwt.segredo,
    { expiresIn: ambiente.jwt.expiracaoRefresh }
  );

  return { accessToken, refreshToken };
}

function formatarUsuario(usuario) {
  return {
    id: usuario._id,
    nome: usuario.nome,
    nomeUsuario: usuario.nomeUsuario,
    perfil: usuario.perfil,
  };
}

// ─────────────────────────────────────────────
// LOGIN (nomeUsuario + senha)
// ─────────────────────────────────────────────

export const loginLocal = manipuladorAsync(async (req, res) => {
  const { nomeUsuario, senha } = req.body;

  if (!nomeUsuario || !senha) {
    throw criarErro('Usuário e senha são obrigatórios', 400);
  }

  const usuario = await Usuario.findOne({
    nomeUsuario: nomeUsuario.toLowerCase().trim(),
  }).select('+senhaHash');

  // Mensagem genérica para não revelar se o usuário existe
  if (!usuario || !usuario.senhaHash) {
    throw criarErro('Usuário ou senha inválidos', 401);
  }

  const senhaCorreta = await usuario.verificarSenha(senha);
  if (!senhaCorreta) {
    throw criarErro('Usuário ou senha inválidos', 401);
  }

  if (!usuario.ativo) {
    throw criarErro('Conta desativada. Entre em contato com o administrador.', 403);
  }

  usuario.ultimoAcesso = new Date();
  await usuario.save();

  const tokens = gerarTokens(usuario);

  res.json({
    sucesso: true,
    dados: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      usuario: formatarUsuario(usuario),
    },
  });
});

// ─────────────────────────────────────────────
// CRIAR USUÁRIO (somente admin)
// ─────────────────────────────────────────────

export const criarUsuario = manipuladorAsync(async (req, res) => {
  const { nomeUsuario, nome, senha, perfil } = req.body;

  if (!nomeUsuario || !nome || !senha) {
    throw criarErro('Nome de usuário, nome e senha são obrigatórios', 400);
  }

  if (senha.length < 8) {
    throw criarErro('A senha deve ter pelo menos 8 caracteres', 400);
  }

  const existente = await Usuario.findOne({ nomeUsuario: nomeUsuario.toLowerCase().trim() });
  if (existente) {
    throw criarErro('Nome de usuário já está em uso', 409);
  }

  const totalUsuarios = await Usuario.countDocuments();

  const usuario = new Usuario({
    nomeUsuario: nomeUsuario.toLowerCase().trim(),
    nome: nome.trim(),
    // Primeiro usuário do sistema vira admin automaticamente
    perfil: totalUsuarios === 0 ? 'admin' : (perfil || 'operador'),
    ativo: true,
  });

  await usuario.definirSenha(senha);
  await usuario.save();

  res.status(201).json({
    sucesso: true,
    dados: formatarUsuario(usuario),
  });
});

// ─────────────────────────────────────────────
// LISTAR USUÁRIOS (somente admin)
// ─────────────────────────────────────────────

export const listarUsuarios = manipuladorAsync(async (req, res) => {
  const usuarios = await Usuario.find().select('-__v').sort({ createdAt: -1 });
  res.json({ sucesso: true, dados: usuarios });
});

// ─────────────────────────────────────────────
// ATIVAR / DESATIVAR USUÁRIO (somente admin)
// ─────────────────────────────────────────────

export const alterarStatusUsuario = manipuladorAsync(async (req, res) => {
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  // Impede desativar o próprio admin logado
  if (usuario._id.toString() === req.usuario._id.toString()) {
    throw criarErro('Você não pode desativar sua própria conta', 400);
  }

  usuario.ativo = !usuario.ativo;
  await usuario.save();

  res.json({ sucesso: true, dados: formatarUsuario(usuario) });
});

// ─────────────────────────────────────────────
// ALTERAR PERFIL (somente admin)
// ─────────────────────────────────────────────

export const alterarPerfil = manipuladorAsync(async (req, res) => {
  const { perfil } = req.body;
  const usuario = await Usuario.findById(req.params.id);
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  usuario.perfil = perfil;
  await usuario.save();

  res.json({ sucesso: true, dados: formatarUsuario(usuario) });
});

// ─────────────────────────────────────────────
// REDEFINIR SENHA (somente admin)
// ─────────────────────────────────────────────

export const redefinirSenha = manipuladorAsync(async (req, res) => {
  const { novaSenha } = req.body;

  if (!novaSenha || novaSenha.length < 8) {
    throw criarErro('A nova senha deve ter pelo menos 8 caracteres', 400);
  }

  const usuario = await Usuario.findById(req.params.id).select('+senhaHash');
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  await usuario.definirSenha(novaSenha);
  await usuario.save();

  res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso' });
});

// ─────────────────────────────────────────────
// REFRESH TOKEN
// ─────────────────────────────────────────────

export const renovarToken = manipuladorAsync(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw criarErro('refreshToken não fornecido', 400);
  }

  let payload;
  try {
    payload = jwt.verify(refreshToken, ambiente.jwt.segredo);
  } catch (erro) {
    throw criarErro(
      erro.name === 'TokenExpiredError' ? 'Refresh token expirado' : 'Refresh token inválido',
      401
    );
  }

  const usuario = await Usuario.findById(payload.sub);
  if (!usuario || !usuario.ativo) {
    throw criarErro('Usuário não encontrado ou desativado', 401);
  }

  const tokens = gerarTokens(usuario);
  res.json({ sucesso: true, dados: tokens });
});

// ─────────────────────────────────────────────
// PERFIL DO USUÁRIO LOGADO
// ─────────────────────────────────────────────

export const obterPerfil = manipuladorAsync(async (req, res) => {
  res.json({
    sucesso: true,
    dados: {
      id: req.usuario._id,
      nome: req.usuario.nome,
      nomeUsuario: req.usuario.nomeUsuario,
      perfil: req.usuario.perfil,
      ultimoAcesso: req.usuario.ultimoAcesso,
      criadoEm: req.usuario.createdAt,
    },
  });
});

// ─────────────────────────────────────────────
// ALTERAR PRÓPRIA SENHA (usuário logado)
// ─────────────────────────────────────────────

export const alterarSenha = manipuladorAsync(async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;

  if (!novaSenha || novaSenha.length < 8) {
    throw criarErro('Nova senha deve ter pelo menos 8 caracteres', 400);
  }

  const usuario = await Usuario.findById(req.usuario._id).select('+senhaHash');

  if (usuario.senhaHash) {
    if (!senhaAtual) throw criarErro('Senha atual é obrigatória', 400);
    const correta = await usuario.verificarSenha(senhaAtual);
    if (!correta) throw criarErro('Senha atual incorreta', 401);
  }

  await usuario.definirSenha(novaSenha);
  await usuario.save();

  res.json({ sucesso: true, mensagem: 'Senha atualizada com sucesso' });
});