import Usuario, { PERFIS } from '../../models/Usuario.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

/**
 * GET /usuarios
 * Lista todos os usuários (admin).
 */
export const listar = manipuladorAsync(async (req, res) => {
  const { pagina = 1, limite = 20, ativo } = req.query;
  const skip = (pagina - 1) * limite;

  const filtro = {};
  if (ativo !== undefined) filtro.ativo = ativo === 'true';

  const [usuarios, total] = await Promise.all([
    Usuario.find(filtro)
      .select('-__v -senhaHash')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limite)),
    Usuario.countDocuments(filtro),
  ]);

  res.json(respostaPaginada(usuarios, total, pagina, limite));
});

/**
 * GET /usuarios/:id
 */
export const obterPorId = manipuladorAsync(async (req, res) => {
  const usuario = await Usuario.findById(req.params.id).select('-__v -senhaHash');
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  res.json({ sucesso: true, dados: usuario });
});

/**
 * POST /usuarios
 * Cria usuário manualmente com senha local (admin).
 * Útil para o administrador criar contas para outras pessoas, sem depender do auto-cadastro.
 */
export const criar = manipuladorAsync(async (req, res) => {
  const { nome, email, senha, perfil = 'visualizador' } = req.body;

  if (!nome || !email || !senha) {
    throw criarErro('Nome, e-mail e senha são obrigatórios', 400);
  }

  if (!PERFIS.includes(perfil)) {
    throw criarErro(`Perfil inválido. Use: ${PERFIS.join(', ')}`, 400);
  }

  if (senha.length < 8) {
    throw criarErro('Senha deve ter pelo menos 8 caracteres', 400);
  }

  const existente = await Usuario.findOne({ email: email.toLowerCase().trim() });
  if (existente) throw criarErro('Já existe um usuário com este e-mail', 409);

  const usuario = new Usuario({
    nome: nome.trim(),
    email: email.toLowerCase().trim(),
    perfil,
    ativo: true,
  });

  usuario.definirSenha(senha);
  await usuario.save();

  res.status(201).json({
    sucesso: true,
    dados: {
      id: usuario._id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      criadoEm: usuario.createdAt,
    },
  });
});

/**
 * PATCH /usuarios/:id/perfil
 * Altera o perfil de acesso de um usuário (admin).
 */
export const alterarPerfil = manipuladorAsync(async (req, res) => {
  const { perfil } = req.body;

  if (!PERFIS.includes(perfil)) {
    throw criarErro(`Perfil inválido. Use: ${PERFIS.join(', ')}`, 400);
  }

  if (req.params.id === req.usuario._id.toString() && perfil !== 'admin') {
    throw criarErro('Você não pode alterar seu próprio perfil de admin', 400);
  }

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { perfil },
    { new: true, runValidators: true }
  ).select('-__v -senhaHash');

  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  res.json({ sucesso: true, dados: usuario });
});

/**
 * PATCH /usuarios/:id/ativo
 * Ativa/desativa um usuário (admin).
 */
export const alterarAtivo = manipuladorAsync(async (req, res) => {
  const { ativo } = req.body;

  if (req.params.id === req.usuario._id.toString()) {
    throw criarErro('Você não pode desativar sua própria conta', 400);
  }

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { ativo },
    { new: true }
  ).select('-__v -senhaHash');

  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  res.json({ sucesso: true, dados: usuario });
});

/**
 * PATCH /usuarios/:id/senha
 * Admin redefine senha de outro usuário.
 */
export const redefinirSenha = manipuladorAsync(async (req, res) => {
  const { novaSenha } = req.body;

  if (!novaSenha || novaSenha.length < 8) {
    throw criarErro('Nova senha deve ter pelo menos 8 caracteres', 400);
  }

  const usuario = await Usuario.findById(req.params.id).select('+senhaHash');
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  usuario.definirSenha(novaSenha);
  await usuario.save();

  res.json({ sucesso: true, mensagem: 'Senha redefinida com sucesso' });
});
