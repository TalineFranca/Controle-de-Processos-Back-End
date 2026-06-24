import jwt from 'jsonwebtoken';
import ambiente from '../../config/ambiente.js';
import Usuario from '../../models/Usuario.js';
import { manipuladorAsync, criarErro } from '../../utils/auxiliares.js';

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
    perfil: usuario.perfil,
  };
}

// ─────────────────────────────────────────────
// LOGIN LOCAL (email + senha)
// ─────────────────────────────────────────────

/**
 * POST /auth/login
 * Login com e-mail e senha.
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
// CADASTRO (auto-registro de novo usuário)
// ─────────────────────────────────────────────

/**
 * POST /auth/registrar
 * Cadastro público: nome, e-mail e senha.
 * O primeiro usuário cadastrado no sistema vira admin automaticamente;
 * os demais entram como "visualizador" (admin pode promover depois).
 */
export const registrar = manipuladorAsync(async (req, res) => {
  const { nome, email, senha } = req.body;

  if (!nome || !email || !senha) {
    throw criarErro('Nome, e-mail e senha são obrigatórios', 400);
  }

  if (senha.length < 8) {
    throw criarErro('A senha deve ter pelo menos 8 caracteres', 400);
  }

  const emailNormalizado = email.toLowerCase().trim();

  // Restrição opcional de domínio (configurável via REGISTRO_DOMINIO_PERMITIDO)
  if (ambiente.registro.dominioPermitido) {
    const dominio = emailNormalizado.split('@')[1];
    if (dominio !== ambiente.registro.dominioPermitido) {
      throw criarErro(
        `Cadastro restrito a e-mails do domínio @${ambiente.registro.dominioPermitido}`,
        403
      );
    }
  }

  const existente = await Usuario.findOne({ email: emailNormalizado });
  if (existente) {
    throw criarErro('Já existe uma conta cadastrada com este e-mail', 409);
  }

  const totalUsuarios = await Usuario.countDocuments();

  const usuario = new Usuario({
    nome: nome.trim(),
    email: emailNormalizado,
    perfil: totalUsuarios === 0 ? 'admin' : 'visualizador',
    ativo: true,
  });

  usuario.definirSenha(senha);
  usuario.ultimoAcesso = new Date();
  await usuario.save();

  const tokens = gerarTokens(usuario);

  res.status(201).json({
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
