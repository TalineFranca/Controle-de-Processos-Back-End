import Usuario, { PERFIS } from '../../modelos/Usuario.js';
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
      .select('-__v')
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
  const usuario = await Usuario.findById(req.params.id).select('-__v');
  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  res.json({ sucesso: true, dados: usuario });
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

  // Impede que o admin se rebaixe
  if (req.params.id === req.usuario._id.toString() && perfil !== 'admin') {
    throw criarErro('Você não pode alterar seu próprio perfil de admin', 400);
  }

  const usuario = await Usuario.findByIdAndUpdate(
    req.params.id,
    { perfil },
    { new: true, runValidators: true }
  ).select('-__v');

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
  ).select('-__v');

  if (!usuario) throw criarErro('Usuário não encontrado', 404);

  res.json({ sucesso: true, dados: usuario });
});
