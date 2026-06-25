import Processo, { STATUS_PROCESSO } from '../../models/Processo.js';
import Policial from '../../models/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

// ─────────────────────────────────────────────
// UTILIDADE: converte "YYYY-MM-DD" para Date no
// fuso de Brasília sem deslocamento de dia.
//
// O input[type=date] envia "2026-06-22". Se fizermos
// new Date("2026-06-22") o JS interpreta como
// UTC 00:00, que em BRT (UTC-4) vira 21/06 às 20h —
// por isso a data aparecia sempre um dia antes.
// A correção: tratar a string como "local" adicionando
// T12:00:00 para evitar qualquer drift de fuso.
// ─────────────────────────────────────────────
function parseDateBR(valor) {
  if (!valor) return new Date();
  // Se já veio como objeto Date, retorna direto
  if (valor instanceof Date) return valor;
  // "2026-06-22" → "2026-06-22T12:00:00" → sem risco de mudar o dia
  const s = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T12:00:00`);
  }
  return new Date(valor);
}

// ─────────────────────────────────────────────
// LISTAGEM
// ─────────────────────────────────────────────

/**
 * GET /processos
 * Lista registros de processos.
 *
 * Ordenação da fila de chegada (Fila de Prioridade):
 *   1. dataRecebimento ASC  — quem chegou primeiro, é atendido primeiro
 *   2. ordemHierarquica ASC — dentro do mesmo dia, maior posto/graduação vem antes
 *                             (CEL=0, TEN CEL=1, MAJ=2, CAP=3 … SD=12)
 *   3. nrOrdem ASC          — desempate dentro do mesmo posto: número de ordem
 *                             do Mapa da Força (válido dentro de cada localidade,
 *                             mas usado como critério global de desempate)
 *
 * Regra de antiguidade entre localidades:
 *   Policiais de localidades diferentes competem entre si pelo mesmo critério
 *   acima. Ou seja, se um CAP de Colorado do Oeste e um CAP de Vilhena chegaram
 *   no mesmo dia, o que tiver menor nrOrdem vem primeiro — isso é equivalente
 *   à antiguidade relativa dentro do mesmo posto, conforme o Mapa da Força.
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
    // Usa parseDateBR para evitar o problema de fuso nas datas de filtro
    if (dataInicio) filtro.dataRecebimento.$gte = parseDateBR(dataInicio);
    if (dataFim) {
      const fim = parseDateBR(dataFim);
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

    // ── ORDENAÇÃO CORRETA DE ANTIGUIDADE ──────────────────────────────────
    // 1º: data de recebimento (quem chegou antes atende primeiro)
    // 2º: ordemHierarquica (posto mais alto = menor número = vem antes)
    // 3º: nrOrdem (número de ordem do Mapa da Força — desempate dentro do posto)
    {
      $sort: {
        dataRecebimento: 1,          // mais antigo primeiro
        'policialInfo.ordemHierarquica': 1,  // posto mais alto primeiro (CEL=0)
        'policialInfo.nrOrdem': 1,   // menor nrOrdem primeiro (mais antigo no posto)
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
 *
 * CORREÇÃO DE DATA: o input[type=date] envia "YYYY-MM-DD" (sem horário).
 * Se usarmos new Date("2026-06-22") diretamente, o JavaScript interpreta
 * como UTC midnight — que no fuso de Brasília (UTC-4) equivale a
 * 21/06 às 20h, fazendo a data aparecer um dia antes.
 * A função parseDateBR resolve isso definindo T12:00:00, garantindo
 * que a data salva no banco seja sempre o dia correto.
 */
export const criar = manipuladorAsync(async (req, res) => {
  const { policialId, dataRecebimento, numeroProcesso } = req.body;

  const policial = await Policial.findById(policialId);
  if (!policial) throw criarErro('Policial não encontrado', 404);

  const processo = new Processo({
    policial: policialId,
    // ── CORREÇÃO DO BUG DE DATA ──────────────────────────────────────────
    dataRecebimento: parseDateBR(dataRecebimento),
    // ────────────────────────────────────────────────────────────────────
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