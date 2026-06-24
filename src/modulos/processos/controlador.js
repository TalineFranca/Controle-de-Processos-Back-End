import Processo, { STATUS_PROCESSO } from '../../models/Processo.js';
import Policial from '../../models/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

// ─────────────────────────────────────────────
// LISTAGEM
// ─────────────────────────────────────────────

/**
 * GET /processos
 * Lista registros de processos.
 * Fila de prioridade: data de chegada → hierarquia → nrOrdem
 */
export const listar = manipuladorAsync(async (req, res) => {
  const {
    pagina = 1,
    limite = 100,
    status,
    dataInicio,
    dataFim,
    busca,
    localidade,
    policial: policialId,
  } = req.query;

  const skip = (pagina - 1) * parseInt(limite);
  const filtro = {};

  if (status) filtro.status = { $in: status.split(',') };

  if (dataInicio || dataFim) {
    filtro.dataRecebimento = {};
    if (dataInicio) filtro.dataRecebimento.$gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtro.dataRecebimento.$lte = fim;
    }
  }

  if (policialId) filtro.policial = policialId;

  // Busca por nome do policial
  if (busca) {
    const policiais = await Policial.find({
      $or: [
        { nomeCompleto: { $regex: busca, $options: 'i' } },
        { nomeGuerra: { $regex: busca, $options: 'i' } },
      ],
    }).select('_id');
    filtro.policial = { $in: policiais.map((p) => p._id) };
  }

  // Filtro por localidade do policial (via join)
  const matchPolicial = {};
  if (localidade) matchPolicial['policialInfo.localidade'] = { $regex: localidade, $options: 'i' };

  const pipeline = [
    { $match: filtro },
    {
      $lookup: {
        from: 'policials',
        localField: 'policial',
        foreignField: '_id',
        as: 'policialInfo',
      },
    },
    { $unwind: { path: '$policialInfo', preserveNullAndEmptyArrays: true } },
    ...(Object.keys(matchPolicial).length > 0 ? [{ $match: matchPolicial }] : []),
    {
      $sort: {
        dataRecebimento: 1,
        'policialInfo.ordemHierarquica': 1,
        'policialInfo.nrOrdem': 1,
      },
    },
  ];

  const [totalResult] = await Processo.aggregate([...pipeline, { $count: 'total' }]);
  const total = totalResult?.total || 0;

  pipeline.push({ $skip: skip }, { $limit: parseInt(limite) });

  const processos = await Processo.aggregate(pipeline);

  await Processo.populate(processos, {
    path: 'registradoPor',
    select: 'nome email',
    model: 'Usuario',
  });

  res.json(respostaPaginada(processos, total, pagina, parseInt(limite)));
});

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

export const dashboard = manipuladorAsync(async (req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const [totalNaoFeito, totalFeito, chegadosHoje, porStatus, porLocalidade] = await Promise.all([
    Processo.countDocuments({ status: 'naoFeito' }),
    Processo.countDocuments({ status: 'feito' }),
    Processo.countDocuments({ dataRecebimento: { $gte: hoje, $lt: amanha } }),
    Processo.aggregate([
      { $group: { _id: '$status', total: { $sum: 1 } } },
    ]),
    Processo.aggregate([
      { $match: { status: 'naoFeito' } },
      {
        $lookup: {
          from: 'policials',
          localField: 'policial',
          foreignField: '_id',
          as: 'pol',
        },
      },
      { $unwind: { path: '$pol', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$pol.localidade', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  res.json({
    sucesso: true,
    dados: {
      totalNaoFeito,
      totalFeito,
      chegadosHoje,
      porStatus,
      porLocalidade: porLocalidade.map((l) => ({
        localidade: l._id || 'Sem localidade',
        total: l.total,
      })),
    },
  });
});

// ─────────────────────────────────────────────
// OBTER POR ID
// ─────────────────────────────────────────────

export const obterPorId = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id)
    .populate('policial', '-__v')
    .populate('registradoPor', 'nome email')
    .select('-__v');

  if (!processo) throw criarErro('Registro não encontrado', 404);

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// CRIAR
// ─────────────────────────────────────────────

/**
 * POST /processos
 * Registra um processo para um policial.
 * Body: { policialId, dataRecebimento, numeroProcesso? }
 */
export const criar = manipuladorAsync(async (req, res) => {
  const { policialId, dataRecebimento, numeroProcesso } = req.body;

  const policial = await Policial.findById(policialId);
  if (!policial) throw criarErro('Policial não encontrado', 404);

  const processo = new Processo({
    policial: policialId,
    dataRecebimento: dataRecebimento ? new Date(dataRecebimento) : new Date(),
    numeroProcesso: numeroProcesso || null,
    status: 'naoFeito',
    registradoPor: req.usuario._id,
  });

  await processo.save();

  await processo.populate('policial', 'nomeCompleto nomeGuerra postoGraduacao unidade localidade ordemHierarquica nrOrdem');
  await processo.populate('registradoPor', 'nome email');

  res.status(201).json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// MARCAR COMO FEITO
// ─────────────────────────────────────────────

export const marcarFeito = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  processo.status = 'feito';
  processo.dataConclussao = new Date();

  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// MARCAR COMO NÃO FEITO (desfazer)
// ─────────────────────────────────────────────

export const marcarNaoFeito = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  processo.status = 'naoFeito';
  processo.dataConclussao = null;

  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// EXCLUIR
// ─────────────────────────────────────────────

export const excluir = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findByIdAndDelete(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  res.json({ sucesso: true, mensagem: 'Registro excluído com sucesso' });
});
