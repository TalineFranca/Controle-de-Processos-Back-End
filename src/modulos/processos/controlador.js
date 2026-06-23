import mongoose from 'mongoose';
import Processo, { SITUACOES_PROCESSO, TIPOS_PROCESSO } from '../../models/Processo.js';
import Policial from '../../models/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Registra uma entrada no histórico do processo.
 */
function registrarHistorico(processo, situacao, descricao, usuario) {
  processo.historico.push({
    situacao,
    descricao,
    usuario: usuario._id,
    nomeUsuario: usuario.nome,
    data: new Date(),
  });
}

// ─────────────────────────────────────────────
// LISTAGEM + FILTROS
// ─────────────────────────────────────────────

/**
 * GET /processos
 * Lista processos com filtros avançados.
 * Ordem padrão: data de recebimento crescente (mais antigo tem prioridade).
 * Dentro da mesma data: ordem hierárquica do policial (maior posto primeiro).
 * Desempate final: nrOrdem (antiguidade no CSV).
 */
export const listar = manipuladorAsync(async (req, res) => {
  const {
    pagina = 1,
    limite = 20,
    situacao,
    tipoProcesso,
    dataInicio,
    dataFim,
    busca,
    arquivado = 'false',
    unidadePolicial,
    localidade,
    prazoVencendo,
    hoje: somenteHoje,
  } = req.query;

  const skip = (pagina - 1) * parseInt(limite);
  const filtro = {};

  filtro.arquivado = arquivado === 'true';

  if (situacao) {
    filtro.situacao = { $in: situacao.split(',') };
  }

  if (tipoProcesso) filtro.tipoProcesso = { $regex: tipoProcesso, $options: 'i' };

  // Filtro: somente processos recebidos hoje
  if (somenteHoje === 'true') {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date();
    fim.setHours(23, 59, 59, 999);
    filtro.dataRecebimento = { $gte: inicio, $lte: fim };
  } else if (dataInicio || dataFim) {
    filtro.dataRecebimento = {};
    if (dataInicio) filtro.dataRecebimento.$gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtro.dataRecebimento.$lte = fim;
    }
  }

  if (prazoVencendo === 'true') {
    const agora = new Date();
    const em3dias = new Date();
    em3dias.setDate(em3dias.getDate() + 3);
    filtro.dataPrazo = { $gte: agora, $lte: em3dias };
    filtro.situacao = { $nin: ['concluido', 'arquivado'] };
  }

  // Filtros por dados do policial (via join/lookup)
  const matchPolicial = {};
  if (unidadePolicial) matchPolicial['policialInfo.unidade'] = { $regex: unidadePolicial, $options: 'i' };
  if (localidade) matchPolicial['policialInfo.localidade'] = { $regex: localidade, $options: 'i' };

  // Busca textual: pesquisa por nome do policial, SEI ou protocolo
  if (busca) {
    const policiais = await Policial.find({
      $or: [
        { nomeCompleto: { $regex: busca, $options: 'i' } },
        { nomeGuerra: { $regex: busca, $options: 'i' } },
        { matricula: { $regex: busca, $options: 'i' } },
      ],
    }).select('_id');
    const ids = policiais.map((p) => p._id);

    filtro.$or = [
      { policial: { $in: ids } },
      { numeroSEI: { $regex: busca, $options: 'i' } },
      { numeroProtocolo: { $regex: busca, $options: 'i' } },
    ];
  }

  // Agregação: join com policial para ordenar por hierarquia
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
        dataRecebimento: 1,                    // mais antigo tem prioridade
        'policialInfo.ordemHierarquica': 1,    // maior posto (menor número) primeiro
        'policialInfo.nrOrdem': 1,             // desempate: antiguidade no CSV
      },
    },
  ];

  // Total sem paginação
  const [totalResult] = await Processo.aggregate([...pipeline, { $count: 'total' }]);
  const total = totalResult?.total || 0;

  // Com paginação
  pipeline.push({ $skip: skip }, { $limit: parseInt(limite) });

  const processos = await Processo.aggregate(pipeline);

  // Popula registradoPor (aggregate não usa populate diretamente)
  await Processo.populate(processos, {
    path: 'registradoPor',
    select: 'nome email',
    model: 'Usuario',
  });

  res.json(respostaPaginada(processos, total, pagina, parseInt(limite)));
});

// ─────────────────────────────────────────────
// ENDPOINTS DE REFERÊNCIA (tipos, situações)
// ─────────────────────────────────────────────

export const listarTipos = manipuladorAsync(async (req, res) => {
  res.json({ sucesso: true, dados: TIPOS_PROCESSO });
});

export const listarSituacoes = manipuladorAsync(async (req, res) => {
  res.json({ sucesso: true, dados: SITUACOES_PROCESSO });
});

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

/**
 * GET /processos/dashboard
 * Resumo estatístico para o painel principal.
 * Inclui: totais por situação, recebidos hoje, prazo vencendo,
 * distribuição por tipo e por localidade.
 */
export const dashboard = manipuladorAsync(async (req, res) => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);
  const em3dias = new Date(hoje);
  em3dias.setDate(em3dias.getDate() + 3);

  const [
    totalAtivos,
    porSituacao,
    recebidosHoje,
    prazoVencendo,
    porTipo,
    porLocalidade,
    recebidosUltimos30Dias,
  ] = await Promise.all([
    Processo.countDocuments({ arquivado: false }),

    Processo.aggregate([
      { $match: { arquivado: false } },
      { $group: { _id: '$situacao', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),

    Processo.countDocuments({
      dataRecebimento: { $gte: hoje, $lt: amanha },
    }),

    Processo.countDocuments({
      dataPrazo: { $gte: hoje, $lte: em3dias },
      situacao: { $nin: ['concluido', 'arquivado'] },
      arquivado: false,
    }),

    Processo.aggregate([
      { $match: { arquivado: false } },
      { $group: { _id: '$tipoProcesso', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),

    // Distribuição por localidade do policial
    Processo.aggregate([
      { $match: { arquivado: false } },
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

    // Processos dos últimos 30 dias (para gráfico de tendência)
    Processo.aggregate([
      {
        $match: {
          dataRecebimento: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$dataRecebimento' } },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  res.json({
    sucesso: true,
    dados: {
      totalAtivos,
      recebidosHoje,
      prazoVencendo,
      porSituacao: porSituacao.reduce((acc, item) => {
        acc[item._id] = item.total;
        return acc;
      }, {}),
      porTipo: porTipo.map((t) => ({ tipo: t._id, total: t.total })),
      porLocalidade: porLocalidade.map((l) => ({ localidade: l._id || 'Sem localidade', total: l.total })),
      recebidosUltimos30Dias: recebidosUltimos30Dias.map((d) => ({ data: d._id, total: d.total })),
    },
  });
});

// ─────────────────────────────────────────────
// RELATÓRIO DIÁRIO
// ─────────────────────────────────────────────

/**
 * GET /processos/relatorio-diario
 * Retorna todos os processos recebidos em uma data específica,
 * na ordem de prioridade correta (hierarquia + antiguidade).
 * Se nenhuma data informada, usa hoje.
 */
export const relatorioDiario = manipuladorAsync(async (req, res) => {
  const { data } = req.query;

  const dataRef = data ? new Date(data) : new Date();
  dataRef.setHours(0, 0, 0, 0);
  const fimDia = new Date(dataRef);
  fimDia.setHours(23, 59, 59, 999);

  const processos = await Processo.aggregate([
    {
      $match: {
        dataRecebimento: { $gte: dataRef, $lte: fimDia },
        arquivado: false,
      },
    },
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
        'policialInfo.ordemHierarquica': 1,
        'policialInfo.nrOrdem': 1,
        dataRecebimento: 1,
      },
    },
  ]);

  await Processo.populate(processos, {
    path: 'registradoPor',
    select: 'nome email',
    model: 'Usuario',
  });

  res.json({
    sucesso: true,
    dados: processos,
    total: processos.length,
    data: dataRef.toISOString().split('T')[0],
  });
});

// ─────────────────────────────────────────────
// OBTER POR ID
// ─────────────────────────────────────────────

export const obterPorId = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id)
    .populate('policial', '-__v')
    .populate('registradoPor', 'nome email')
    .populate('historico.usuario', 'nome email')
    .select('-__v');

  if (!processo) throw criarErro('Processo não encontrado', 404);

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// CRIAR
// ─────────────────────────────────────────────

/**
 * POST /processos
 * Registra um novo processo.
 */
export const criar = manipuladorAsync(async (req, res) => {
  const {
    policialId,
    tipoProcesso,
    numeroSEI,
    dataRecebimento,
    dataPrazo,
    documentos,
    observacoes,
    pendencias,
  } = req.body;

  const policial = await Policial.findById(policialId);
  if (!policial) throw criarErro('Policial não encontrado', 404);

  const processo = new Processo({
    policial: policialId,
    tipoProcesso,
    numeroSEI: numeroSEI || null,
    dataRecebimento: dataRecebimento ? new Date(dataRecebimento) : new Date(),
    dataPrazo: dataPrazo ? new Date(dataPrazo) : null,
    documentos: documentos || {},
    observacoes: observacoes || null,
    pendencias: pendencias || null,
    registradoPor: req.usuario._id,
    situacao: 'recebido',
  });

  registrarHistorico(
    processo,
    'recebido',
    `Processo recebido e registrado por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  await processo.populate('policial', 'nomeCompleto nomeGuerra postoGraduacao unidade localidade ordemHierarquica');
  await processo.populate('registradoPor', 'nome email');

  res.status(201).json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// ATUALIZAR
// ─────────────────────────────────────────────

export const atualizar = manipuladorAsync(async (req, res) => {
  const {
    tipoProcesso,
    numeroSEI,
    dataRecebimento,
    dataPrazo,
    documentos,
    observacoes,
    pendencias,
  } = req.body;

  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Processo não encontrado', 404);
  if (processo.arquivado) throw criarErro('Processo arquivado não pode ser editado', 400);

  if (tipoProcesso !== undefined) processo.tipoProcesso = tipoProcesso;
  if (numeroSEI !== undefined) processo.numeroSEI = numeroSEI;
  if (dataRecebimento !== undefined) processo.dataRecebimento = new Date(dataRecebimento);
  if (dataPrazo !== undefined) processo.dataPrazo = dataPrazo ? new Date(dataPrazo) : null;
  if (documentos !== undefined) processo.documentos = { ...processo.documentos.toObject(), ...documentos };
  if (observacoes !== undefined) processo.observacoes = observacoes;
  if (pendencias !== undefined) processo.pendencias = pendencias;

  registrarHistorico(
    processo,
    processo.situacao,
    `Dados atualizados por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  await processo.populate('policial', 'nomeCompleto nomeGuerra postoGraduacao unidade');
  await processo.populate('registradoPor', 'nome email');

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// ALTERAR SITUAÇÃO
// ─────────────────────────────────────────────

export const alterarSituacao = manipuladorAsync(async (req, res) => {
  const { situacao, descricao } = req.body;

  if (!SITUACOES_PROCESSO.includes(situacao)) {
    throw criarErro(`Situação inválida. Use: ${SITUACOES_PROCESSO.join(', ')}`, 400);
  }

  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Processo não encontrado', 404);
  if (processo.arquivado) throw criarErro('Processo arquivado não pode ser alterado', 400);

  const situacaoAnterior = processo.situacao;
  processo.situacao = situacao;

  if (situacao === 'arquivado') processo.arquivado = true;

  registrarHistorico(
    processo,
    situacao,
    descricao || `Situação alterada de "${situacaoAnterior}" para "${situacao}" por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

// ─────────────────────────────────────────────
// ATUALIZAR DOCUMENTOS
// ─────────────────────────────────────────────

export const atualizarDocumentos = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Processo não encontrado', 404);
  if (processo.arquivado) throw criarErro('Processo arquivado não pode ser editado', 400);

  processo.documentos = { ...processo.documentos.toObject(), ...req.body };

  registrarHistorico(
    processo,
    processo.situacao,
    `Documentação atualizada por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  res.json({ sucesso: true, dados: processo.documentos });
});

// ─────────────────────────────────────────────
// EXPORTAR (JSON para planilha)
// ─────────────────────────────────────────────

export const exportar = manipuladorAsync(async (req, res) => {
  const { situacao, tipoProcesso, dataInicio, dataFim, arquivado = 'false' } = req.query;

  const filtro = { arquivado: arquivado === 'true' };

  if (situacao) filtro.situacao = { $in: situacao.split(',') };
  if (tipoProcesso) filtro.tipoProcesso = tipoProcesso;
  if (dataInicio || dataFim) {
    filtro.dataRecebimento = {};
    if (dataInicio) filtro.dataRecebimento.$gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtro.dataRecebimento.$lte = fim;
    }
  }

  const processos = await Processo.find(filtro)
    .populate('policial', 'nrOrdem postoGraduacao nomeGuerra nomeCompleto funcao unidade subunidade localidade ordemHierarquica')
    .populate('registradoPor', 'nome email')
    .sort({ dataRecebimento: 1 })
    .lean();

  // Ordena manualmente por hierarquia após populate
  processos.sort((a, b) => {
    if (a.dataRecebimento - b.dataRecebimento !== 0) return a.dataRecebimento - b.dataRecebimento;
    const ha = a.policial?.ordemHierarquica ?? 99;
    const hb = b.policial?.ordemHierarquica ?? 99;
    if (ha !== hb) return ha - hb;
    return (a.policial?.nrOrdem ?? 0) - (b.policial?.nrOrdem ?? 0);
  });

  const linhas = processos.map((p) => ({
    Protocolo: p.numeroProtocolo,
    'Nº SEI': p.numeroSEI || '',
    'Nº Ordem': p.policial?.nrOrdem || '',
    'Posto/Grad.': p.policial?.postoGraduacao || '',
    'Nome de Guerra': p.policial?.nomeGuerra || '',
    'Nome Completo': p.policial?.nomeCompleto || '',
    Função: p.policial?.funcao || '',
    Unidade: p.policial?.unidade || '',
    Localidade: p.policial?.localidade || '',
    'Tipo de Processo': p.tipoProcesso,
    'Data Recebimento': p.dataRecebimento ? new Date(p.dataRecebimento).toLocaleDateString('pt-BR') : '',
    Prazo: p.dataPrazo ? new Date(p.dataPrazo).toLocaleDateString('pt-BR') : '',
    Situação: p.situacao,
    Requerimento: p.documentos?.requerimento ? 'Sim' : 'Não',
    'Doc. Identidade': p.documentos?.documentoIdentificacao ? 'Sim' : 'Não',
    'Boletim Interno': p.documentos?.boletimInterno ? 'Sim' : 'Não',
    'Ficha Funcional': p.documentos?.fichaFuncional ? 'Sim' : 'Não',
    'Decl. Não Sanção': p.documentos?.declaracaoNaoSancao ? 'Sim' : 'Não',
    'Atestado Médico': p.documentos?.atestadoMedico ? 'Sim' : 'Não',
    'Outros Docs': p.documentos?.outrosDocumentos || '',
    Pendências: p.pendencias || '',
    Observações: p.observacoes || '',
    'Registrado por': p.registradoPor?.nome || '',
    'Data Registro': new Date(p.createdAt).toLocaleDateString('pt-BR'),
  }));

  res.json({ sucesso: true, dados: linhas, total: linhas.length });
});
