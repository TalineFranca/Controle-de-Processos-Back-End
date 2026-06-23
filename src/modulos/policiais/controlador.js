import Policial from '../../modelos/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

/**
 * GET /policiais
 * Lista policiais com filtros e paginação.
 * Ordenação padrão: hierarquia (maior posto primeiro), depois nrOrdem.
 */
export const listar = manipuladorAsync(async (req, res) => {
  const {
    pagina = 1,
    limite = 50,
    busca,
    unidade,
    localidade,
    postoGraduacao,
    ativo = 'true',
  } = req.query;

  const skip = (pagina - 1) * limite;

  const filtro = {};

  if (ativo !== undefined) filtro.ativo = ativo === 'true';
  if (unidade) filtro.unidade = { $regex: unidade, $options: 'i' };
  if (localidade) filtro.localidade = { $regex: localidade, $options: 'i' };
  if (postoGraduacao) filtro.postoGraduacao = { $regex: postoGraduacao, $options: 'i' };

  if (busca) {
    filtro.$or = [
      { nomeCompleto: { $regex: busca, $options: 'i' } },
      { nomeGuerra: { $regex: busca, $options: 'i' } },
      { matricula: { $regex: busca, $options: 'i' } },
    ];
  }

  const [policiais, total] = await Promise.all([
    Policial.find(filtro)
      .select('-__v')
      .sort({ ordemHierarquica: 1, nrOrdem: 1 })
      .skip(skip)
      .limit(parseInt(limite)),
    Policial.countDocuments(filtro),
  ]);

  res.json(respostaPaginada(policiais, total, pagina, limite));
});

/**
 * GET /policiais/unidades
 * Retorna lista de unidades únicas para filtros.
 */
export const listarUnidades = manipuladorAsync(async (req, res) => {
  const unidades = await Policial.distinct('unidade', { ativo: true });
  const localidades = await Policial.distinct('localidade', { ativo: true });

  res.json({
    sucesso: true,
    dados: {
      unidades: unidades.filter(Boolean).sort(),
      localidades: localidades.filter(Boolean).sort(),
    },
  });
});

/**
 * GET /policiais/:id
 */
export const obterPorId = manipuladorAsync(async (req, res) => {
  const policial = await Policial.findById(req.params.id).select('-__v');
  if (!policial) throw criarErro('Policial não encontrado', 404);

  res.json({ sucesso: true, dados: policial });
});

/**
 * PATCH /policiais/:id
 * Atualiza dados de um policial (admin/operador).
 */
export const atualizar = manipuladorAsync(async (req, res) => {
  const camposPermitidos = ['funcao', 'unidade', 'subunidade', 'localidade', 'matricula', 'ativo', 'nomeCompleto', 'nomeGuerra', 'postoGraduacao'];
  const atualizacao = {};

  for (const campo of camposPermitidos) {
    if (req.body[campo] !== undefined) atualizacao[campo] = req.body[campo];
  }

  const policial = await Policial.findByIdAndUpdate(
    req.params.id,
    atualizacao,
    { new: true, runValidators: true }
  ).select('-__v');

  if (!policial) throw criarErro('Policial não encontrado', 404);

  res.json({ sucesso: true, dados: policial });
});
