import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import ambiente from '../../config/ambiente.js';
import Usuario from '../../modelos/Usuario.js';
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

/**
 * POST /auth/google
 * Recebe o idToken gerado pelo Google Sign-In no frontend
 * e retorna JWT de acesso ao sistema.
 */
export const loginGoogle = manipuladorAsync(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw criarErro('idToken não fornecido', 400);
  }

  // Verifica o token com o Google
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

  // Upsert do usuário
  let usuario = await Usuario.findOne({ email });

  if (!usuario) {
    // Primeiro usuário do sistema vira admin automaticamente
    const totalUsuarios = await Usuario.countDocuments();
    usuario = await Usuario.create({
      nome: name,
      email,
      googleId,
      fotoPerfil: picture,
      perfil: totalUsuarios === 0 ? 'admin' : 'visualizador',
    });
  } else {
    // Atualiza dados do Google
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
      usuario: {
        id: usuario._id,
        nome: usuario.nome,
        email: usuario.email,
        fotoPerfil: usuario.fotoPerfil,
        perfil: usuario.perfil,
      },
    },
  });
});

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
  } catch {
    throw criarErro('Refresh token inválido ou expirado', 401);
  }

  const usuario = await Usuario.findById(payload.sub);

  if (!usuario || !usuario.ativo) {
    throw criarErro('Usuário não encontrado ou desativado', 401);
  }

  const tokens = gerarTokens(usuario);

  res.json({
    sucesso: true,
    dados: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    },
  });
});

/**
 * GET /auth/me
 * Retorna dados do usuário autenticado.
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
