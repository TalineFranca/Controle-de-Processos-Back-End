import Policial from '../../models/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

/**
 * GET /policiais
 * Lista policiais com filtros e paginação.
 * Ordenação padrão: ordemBatalhao ASC (ordem de antiguidade do batalhão inteiro).
 */
export const listar = manipuladorAsync(async (req, res) => {
  const {
    pagina = 1,
    limite = 50,
    busca,
    postoGraduacao,
    ativo = 'true',
  } = req.query;

  const skip = (pagina - 1) * limite;

  const filtro = {};

  if (ativo !== undefined) filtro.ativo = ativo === 'true';
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
      .sort({ ordemBatalhao: 1 })
      .skip(skip)
      .limit(parseInt(limite)),
    Policial.countDocuments(filtro),
  ]);

  res.json(respostaPaginada(policiais, total, pagina, limite));
});

/**
 * GET /policiais/unidades
 * Retorna listas de localidades, CIAs, PELs, GPs únicos para os filtros.
 */
export const listarUnidades = manipuladorAsync(async (req, res) => {
  const [localidades, cias, pels, gps] = await Promise.all([
    Policial.distinct('localidade', { ativo: true }),
    Policial.distinct('cia', { ativo: true }),
    Policial.distinct('pel', { ativo: true }),
    Policial.distinct('gp', { ativo: true }),
  ]);

  res.json({
    sucesso: true,
    dados: {
      localidades: localidades.filter(Boolean).sort(),
      cias: cias.filter(Boolean).sort(),
      pels: pels.filter(Boolean).sort(),
      gps: gps.filter(Boolean).sort(),
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
  const camposPermitidos = [
    'funcao', 'unidade', 'subunidade', 'localidade', 'matricula',
    'ativo', 'nomeCompleto', 'nomeGuerra', 'postoGraduacao',
    'cia', 'pel', 'gp',
  ];
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