import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import ambiente from '../../config/ambiente.js';
import Usuario from '../../models/Usuario.js';
import { manipuladorAsync, criarErro } from '../../utils/auxiliares.js';

const clienteGoogle = new OAuth2Client(ambiente.google.clientId);

/**
 * Gera par de tokens JWT (access + refresh).
 */
function gerarTokens(usuario) {
  const payload = {
    sub: usuario._id.toString(),
    email: usuario.email,
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
    email: usuario.email,
    fotoPerfil: usuario.fotoPerfil,
    perfil: usuario.perfil,
  };
}

// ─────────────────────────────────────────────
// LOGIN LOCAL (email + senha)
// ─────────────────────────────────────────────

/**
 * POST /auth/login
 * Login com e-mail e senha (alternativa ao Google OAuth).
 */
export const loginLocal = manipuladorAsync(async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    throw criarErro('E-mail e senha são obrigatórios', 400);
  }

  // Inclui senhaHash (campo hidden por padrão)
  const usuario = await Usuario.findOne({ email: email.toLowerCase().trim() }).select('+senhaHash');

  if (!usuario || !usuario.senhaHash) {
    throw criarErro('E-mail ou senha inválidos', 401);
  }

  if (!usuario.verificarSenha(senha)) {
    throw criarErro('E-mail ou senha inválidos', 401);
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
// LOGIN GOOGLE OAUTH
// ─────────────────────────────────────────────

/**
 * POST /auth/google
 * Recebe o idToken gerado pelo Google Sign-In no frontend.
 */
export const loginGoogle = manipuladorAsync(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw criarErro('idToken não fornecido', 400);
  }

  if (!ambiente.google.clientId) {
    throw criarErro('Login com Google não configurado neste servidor', 501);
  }

  let ticket;
  try {
    ticket = await clienteGoogle.verifyIdToken({
      idToken,
      audience: ambiente.google.clientId,
    });
  } catch {
    throw criarErro('Token Google inválido ou expirado', 401);
  }

  const payload = ticket.getPayload();
  const { sub: googleId, email, name, picture } = payload;

  // Restringe por domínio se configurado
  if (ambiente.google.dominioPermitido) {
    const dominio = email.split('@')[1];
    if (dominio !== ambiente.google.dominioPermitido) {
      throw criarErro(
        `Acesso restrito a contas do domínio @${ambiente.google.dominioPermitido}`,
        403
      );
    }
  }

  let usuario = await Usuario.findOne({ email });

  if (!usuario) {
    const totalUsuarios = await Usuario.countDocuments();
    usuario = await Usuario.create({
      nome: name,
      email,
      googleId,
      fotoPerfil: picture,
      perfil: totalUsuarios === 0 ? 'admin' : 'visualizador',
    });
  } else {
    usuario.googleId = googleId;
    usuario.fotoPerfil = picture;
    usuario.nome = name;
    usuario.ultimoAcesso = new Date();
    await usuario.save();
  }

  if (!usuario.ativo) {
    throw criarErro('Conta desativada. Entre em contato com o administrador.', 403);
  }

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
// REFRESH TOKEN
// ─────────────────────────────────────────────

/**
 * POST /auth/refresh
 * Renova o access token usando o refresh token.
 */
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

/**
 * GET /auth/me
 */
export const obterPerfil = manipuladorAsync(async (req, res) => {
  res.json({
    sucesso: true,
    dados: {
      id: req.usuario._id,
      nome: req.usuario.nome,
      email: req.usuario.email,
      fotoPerfil: req.usuario.fotoPerfil,
      perfil: req.usuario.perfil,
      ultimoAcesso: req.usuario.ultimoAcesso,
      criadoEm: req.usuario.createdAt,
    },
  });
});

// ─────────────────────────────────────────────
// ALTERAR PRÓPRIA SENHA (usuário logado)
// ─────────────────────────────────────────────

/**
 * PATCH /auth/senha
 * Permite ao próprio usuário definir/alterar sua senha local.
 */
export const alterarSenha = manipuladorAsync(async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;

  if (!novaSenha || novaSenha.length < 8) {
    throw criarErro('Nova senha deve ter pelo menos 8 caracteres', 400);
  }

  const usuario = await Usuario.findById(req.usuario._id).select('+senhaHash');

  // Se já tem senha definida, exige a senha atual
  if (usuario.senhaHash) {
    if (!senhaAtual) throw criarErro('Senha atual é obrigatória', 400);
    if (!usuario.verificarSenha(senhaAtual)) throw criarErro('Senha atual incorreta', 401);
  }

  usuario.definirSenha(novaSenha);
  await usuario.save();

  res.json({ sucesso: true, mensagem: 'Senha atualizada com sucesso' });
});
