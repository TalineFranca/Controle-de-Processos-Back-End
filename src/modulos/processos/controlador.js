import Processo, { STATUS_PROCESSO } from '../../models/Processo.js';
import Policial from '../../models/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada, regexSemAcento } from '../../utils/auxiliares.js';

function parseDateBR(valor) {
  if (!valor) return new Date();
  if (valor instanceof Date) return valor;
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00`);
  return new Date(valor);
}

export const listar = manipuladorAsync(async (req, res) => {
  const {
    pagina = 1,
    limite = 100,
    status,
    dataInicio,
    dataFim,
    busca,
    policial: policialId,
  } = req.query;

  const skip = (pagina - 1) * parseInt(limite);
  const filtro = {};

  if (status) filtro.status = { $in: status.split(',') };

  if (dataInicio || dataFim) {
    filtro.dataRecebimento = {};
    if (dataInicio) filtro.dataRecebimento.$gte = parseDateBR(dataInicio);
    if (dataFim) {
      const fim = parseDateBR(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtro.dataRecebimento.$lte = fim;
    }
  }

  if (policialId) filtro.policial = policialId;

  if (busca) {
    const regex = regexSemAcento(busca);
    const policiais = await Policial.find({
      $or: [
        { nomeCompleto: regex },
        { nomeGuerra: regex },
      ],
    }).select('_id');
    filtro.policial = { $in: policiais.map((p) => p._id) };
  }

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
    {
      $sort: {
        dataRecebimento: 1,
        'policialInfo.ordemBatalhao': 1,
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

export const dashboard = manipuladorAsync(async (req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const [totalNaoFeito, totalAConferir, totalFeito, chegadosHoje, porStatus] = await Promise.all([
    Processo.countDocuments({ status: 'naoFeito' }),
    Processo.countDocuments({ status: 'aConferir' }),
    Processo.countDocuments({ status: 'feito' }),
    Processo.countDocuments({ dataRecebimento: { $gte: hoje, $lt: amanha } }),
    Processo.aggregate([{ $group: { _id: '$status', total: { $sum: 1 } } }]),
  ]);

  res.json({
    sucesso: true,
    dados: {
      totalNaoFeito,
      totalAConferir,
      totalFeito,
      chegadosHoje,
      porStatus,
    },
  });
});

export const obterPorId = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id)
    .populate('policial', '-__v')
    .populate('registradoPor', 'nome email')
    .select('-__v');

  if (!processo) throw criarErro('Registro não encontrado', 404);

  res.json({ sucesso: true, dados: processo });
});

export const criar = manipuladorAsync(async (req, res) => {
  const { policialId, dataRecebimento, numeroProcesso } = req.body;

  const policial = await Policial.findById(policialId);
  if (!policial) throw criarErro('Policial não encontrado', 404);

  const processo = new Processo({
    policial: policialId,
    dataRecebimento: parseDateBR(dataRecebimento),
    numeroProcesso: numeroProcesso || null,
    status: 'naoFeito',
    registradoPor: req.usuario._id,
  });

  await processo.save();

  await processo.populate('policial', 'nomeCompleto nomeGuerra postoGraduacao unidade localidade secaoOrigem ordemBatalhao ordemHierarquica nrOrdem');
  await processo.populate('registradoPor', 'nome email');

  res.status(201).json({ sucesso: true, dados: processo });
});

export const marcarFeito = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  processo.status = 'feito';
  processo.dataConclussao = new Date();
  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

export const marcarConferir = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  processo.status = 'aConferir';
  processo.dataConclussao = null;
  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

export const marcarNaoFeito = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  const { motivo } = req.body || {};

  processo.status = 'naoFeito';
  processo.dataConclussao = null;
  if (motivo) processo.observacoes = motivo;
  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

export const excluir = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findByIdAndDelete(req.params.id);
  if (!processo) throw criarErro('Registro não encontrado', 404);

  res.json({ sucesso: true, mensagem: 'Registro excluído com sucesso' });
});