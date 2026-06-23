import mongoose from 'mongoose';
import Processo, { SITUACOES_PROCESSO, TIPOS_PROCESSO } from '../../modelos/Processo.js';
import Policial from '../../modelos/Policial.js';
import { manipuladorAsync, criarErro, respostaPaginada } from '../../utils/auxiliares.js';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Registra uma entrada no histórico do processo.
 */
async function registrarHistorico(processo, situacao, descricao, usuario) {
  processo.historico.push({
    situacao,
    descricao,
    usuario: usuario._id,
    nomeUsuario: usuario.nome,
    data: new Date(),
  });
}

// ─────────────────────────────────────────────
// CONTROLLERS
// ─────────────────────────────────────────────

/**
 * GET /processos
 * Lista processos com filtros avançados.
 * Ordem padrão: data de recebimento crescente (mais antigo primeiro = prioridade).
 * Dentro da mesma data: ordem hierárquica do policial (maior posto primeiro).
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
    prazoVencendo, // 'true' = processos com prazo nos próximos 3 dias
  } = req.query;

  const skip = (pagina - 1) * limite;
  const filtro = {};

  filtro.arquivado = arquivado === 'true';

  if (situacao) {
    const situacoes = situacao.split(',');
    filtro.situacao = { $in: situacoes };
  }

  if (tipoProcesso) filtro.tipoProcesso = { $regex: tipoProcesso, $options: 'i' };

  if (dataInicio || dataFim) {
    filtro.dataRecebimento = {};
    if (dataInicio) filtro.dataRecebimento.$gte = new Date(dataInicio);
    if (dataFim) {
      const fim = new Date(dataFim);
      fim.setHours(23, 59, 59, 999);
      filtro.dataRecebimento.$lte = fim;
    }
  }

  if (prazoVencendo === 'true') {
    const hoje = new Date();
    const em3dias = new Date();
    em3dias.setDate(em3dias.getDate() + 3);
    filtro.dataPrazo = { $gte: hoje, $lte: em3dias };
    filtro.situacao = { $nin: ['concluido', 'arquivado'] };
  }

  // Filtros por dados do policial (via join/lookup)
  let matchPolicial = {};
  if (unidadePolicial) matchPolicial['policialInfo.unidade'] = { $regex: unidadePolicial, $options: 'i' };
  if (localidade) matchPolicial['policialInfo.localidade'] = { $regex: localidade, $options: 'i' };

  // Se busca textual, primeiro encontra policiais que correspondem
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

  // Agregação para ordenar pelo posto do policial dentro da mesma data
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
    { $unwind: '$policialInfo' },
    ...(Object.keys(matchPolicial).length > 0 ? [{ $match: matchPolicial }] : []),
    {
      $sort: {
        dataRecebimento: 1,                    // mais antigo tem prioridade
        'policialInfo.ordemHierarquica': 1,    // maior posto (menor número) primeiro
        'policialInfo.nrOrdem': 1,             // desempate por antiguidade no CSV
      },
    },
  ];

  // Conta total sem paginação
  const totalPipeline = [...pipeline, { $count: 'total' }];
  const [totalResult] = await Processo.aggregate(totalPipeline);
  const total = totalResult?.total || 0;

  // Aplica paginação
  pipeline.push({ $skip: skip }, { $limit: parseInt(limite) });

  const processos = await Processo.aggregate(pipeline);

  // Popula o campo registradoPor manualmente (aggregate não usa populate)
  await Processo.populate(processos, {
    path: 'registradoPor',
    select: 'nome email',
    model: 'Usuario',
  });

  res.json(respostaPaginada(processos, total, pagina, limite));
});

/**
 * GET /processos/tipos
 * Retorna os tipos de processo disponíveis.
 */
export const listarTipos = manipuladorAsync(async (req, res) => {
  res.json({ sucesso: true, dados: TIPOS_PROCESSO });
});

/**
 * GET /processos/situacoes
 */
export const listarSituacoes = manipuladorAsync(async (req, res) => {
  res.json({ sucesso: true, dados: SITUACOES_PROCESSO });
});

/**
 * GET /processos/dashboard
 * Resumo estatístico para o painel principal.
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
    },
  });
});

/**
 * GET /processos/:id
 */
export const obterPorId = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id)
    .populate('policial', '-__v')
    .populate('registradoPor', 'nome email')
    .populate('historico.usuario', 'nome email')
    .select('-__v');

  if (!processo) throw criarErro('Processo não encontrado', 404);

  res.json({ sucesso: true, dados: processo });
});

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

  // Verifica se o policial existe
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

  await registrarHistorico(
    processo,
    'recebido',
    `Processo recebido e registrado por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  await processo.populate('policial', 'nomeCompleto nomeGuerra postoGraduacao unidade');
  await processo.populate('registradoPor', 'nome email');

  res.status(201).json({ sucesso: true, dados: processo });
});

/**
 * PUT /processos/:id
 * Atualiza dados principais do processo.
 */
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

  await registrarHistorico(
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

/**
 * PATCH /processos/:id/situacao
 * Muda a situação do processo e registra no histórico.
 */
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

  await registrarHistorico(
    processo,
    situacao,
    descricao || `Situação alterada de "${situacaoAnterior}" para "${situacao}" por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  res.json({ sucesso: true, dados: processo });
});

/**
 * PATCH /processos/:id/documentos
 * Atualiza checklist de documentos.
 */
export const atualizarDocumentos = manipuladorAsync(async (req, res) => {
  const processo = await Processo.findById(req.params.id);
  if (!processo) throw criarErro('Processo não encontrado', 404);

  if (processo.arquivado) throw criarErro('Processo arquivado não pode ser editado', 400);

  processo.documentos = { ...processo.documentos.toObject(), ...req.body };

  await registrarHistorico(
    processo,
    processo.situacao,
    `Documentação atualizada por ${req.usuario.nome}`,
    req.usuario
  );

  await processo.save();

  res.json({ sucesso: true, dados: processo.documentos });
});

/**
 * GET /processos/exportar
 * Exporta processos filtrados em formato JSON para geração de planilha no frontend.
 * Retorna todos os registros (sem paginação), com dados achatados para Excel.
 */
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
    .populate('policial', 'nrOrdem postoGraduacao nomeGuerra nomeCompleto funcao unidade subunidade localidade')
    .populate('registradoPor', 'nome email')
    .sort({ dataRecebimento: 1, 'policial.ordemHierarquica': 1 })
    .lean();

  // Achata para planilha
  const linhas = processos.map((p) => ({
    Protocolo: p.numeroProtocolo,
    'Nº SEI': p.numeroSEI || '',
    'Nº Ordem': p.policial?.nrOrdem || '',
    'Posto/Grad.': p.policial?.postoGraduacao || '',
    'Nome de Guerra': p.policial?.nomeGuerra || '',
    'Nome Completo': p.policial?.nomeCompleto || '',
    'Função': p.policial?.funcao || '',
    'Unidade': p.policial?.unidade || '',
    'Localidade': p.policial?.localidade || '',
    'Tipo de Processo': p.tipoProcesso,
    'Data Recebimento': p.dataRecebimento ? new Date(p.dataRecebimento).toLocaleDateString('pt-BR') : '',
    'Prazo': p.dataPrazo ? new Date(p.dataPrazo).toLocaleDateString('pt-BR') : '',
    'Situação': p.situacao,
    'Requerimento': p.documentos?.requerimento ? 'Sim' : 'Não',
    'Doc. Identidade': p.documentos?.documentoIdentificacao ? 'Sim' : 'Não',
    'Boletim Interno': p.documentos?.boletimInterno ? 'Sim' : 'Não',
    'Ficha Funcional': p.documentos?.fichaFuncional ? 'Sim' : 'Não',
    'Decl. Não Sanção': p.documentos?.declaracaoNaoSancao ? 'Sim' : 'Não',
    'Atestado Médico': p.documentos?.atestadoMedico ? 'Sim' : 'Não',
    'Outros Docs': p.documentos?.outrosDocumentos || '',
    'Pendências': p.pendencias || '',
    'Observações': p.observacoes || '',
    'Registrado por': p.registradoPor?.nome || '',
    'Data Registro': new Date(p.createdAt).toLocaleDateString('pt-BR'),
  }));

  res.json({ sucesso: true, dados: linhas, total: linhas.length });
});
