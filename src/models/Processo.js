import mongoose from 'mongoose';

/**
 * Tipos de processo administrativo.
 * Pode ser expandido conforme necessidade.
 */
export const TIPOS_PROCESSO = [
  'FÉRIAS',
  'LICENÇA PRÊMIO',
  'LICENÇA MÉDICA',
  'LICENÇA ESPECIAL',
  'PROMOÇÃO',
  'TRANSFERÊNCIA',
  'PENSÃO',
  'REVISÃO SALARIAL',
  'INDENIZAÇÃO',
  'SINDICÂNCIA',
  'PAD',
  'MEDALHA/ELOGIO',
  'OUTROS',
];

/**
 * Situações possíveis de um processo.
 */
export const SITUACOES_PROCESSO = [
  'recebido',
  'em_analise',
  'pendente_documentacao',
  'aguardando_despacho',
  'enviado_ao_setor',
  'concluido',
  'arquivado',
  'devolvido',
];

/**
 * Sub-schema de entrada no histórico do processo.
 */
const esquemaHistorico = new mongoose.Schema(
  {
    situacao: { type: String, required: true },
    descricao: { type: String, required: true },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    nomeUsuario: { type: String },
    data: { type: Date, default: Date.now },
  },
  { _id: true }
);

/**
 * Sub-schema de checklist de documentos.
 * Campos booleanos indicando se o documento foi apresentado.
 * Pode ser expandido conforme o ofício regulamentador.
 */
const esquemaDocumentos = new mongoose.Schema(
  {
    requerimento: { type: Boolean, default: false },
    documentoIdentificacao: { type: Boolean, default: false },
    boletimInterno: { type: Boolean, default: false },
    fichaFuncional: { type: Boolean, default: false },
    declaracaoNaoSancao: { type: Boolean, default: false },
    atestadoMedico: { type: Boolean, default: false },
    comprovanteResidencia: { type: Boolean, default: false },
    certidaoBeneficiario: { type: Boolean, default: false },
    procuracao: { type: Boolean, default: false },
    outrosDocumentos: { type: String, default: null },
  },
  { _id: false }
);

const esquemaProcesso = new mongoose.Schema(
  {
    /**
     * Número do processo no SEI (ex: "0029.003587/2025-19")
     */
    numeroSEI: {
      type: String,
      trim: true,
      default: null,
    },
    /**
     * Número de protocolo interno (gerado automaticamente se não informado)
     */
    numeroProtocolo: {
      type: String,
      unique: true,
      trim: true,
    },
    /**
     * Policial interessado no processo
     */
    policial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policial',
      required: [true, 'Policial é obrigatório'],
    },
    /**
     * Tipo do processo administrativo
     */
    tipoProcesso: {
      type: String,
      required: [true, 'Tipo do processo é obrigatório'],
      trim: true,
    },
    /**
     * Data de recebimento do processo (preenche automaticamente se omitida)
     */
    dataRecebimento: {
      type: Date,
      required: [true, 'Data de recebimento é obrigatória'],
      default: Date.now,
    },
    /**
     * Prazo limite para análise/despacho
     */
    dataPrazo: {
      type: Date,
      default: null,
    },
    /**
     * Situação atual do processo
     */
    situacao: {
      type: String,
      enum: {
        values: SITUACOES_PROCESSO,
        message: 'Situação inválida: {VALUE}',
      },
      default: 'recebido',
    },
    /**
     * Checklist de documentação apresentada
     */
    documentos: {
      type: esquemaDocumentos,
      default: () => ({}),
    },
    /**
     * Observações gerais do processo
     */
    observacoes: {
      type: String,
      trim: true,
      default: null,
    },
    /**
     * Pendências identificadas
     */
    pendencias: {
      type: String,
      trim: true,
      default: null,
    },
    /**
     * Usuário que registrou o processo
     */
    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
    /**
     * Histórico de movimentações do processo
     */
    historico: {
      type: [esquemaHistorico],
      default: [],
    },
    /**
     * Processo arquivado/encerrado
     */
    arquivado: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para consultas frequentes
esquemaProcesso.index({ policial: 1, dataRecebimento: -1 });
esquemaProcesso.index({ situacao: 1 });
esquemaProcesso.index({ dataRecebimento: -1 });
esquemaProcesso.index({ arquivado: 1 });
esquemaProcesso.index({ numeroSEI: 1 }, { sparse: true });
esquemaProcesso.index({ numeroProtocolo: 1 }, { unique: true });
esquemaProcesso.index({ tipoProcesso: 1 });

/**
 * Gera número de protocolo sequencial antes de salvar (se não informado).
 * Formato: PROC-YYYY-NNNNNN
 */
esquemaProcesso.pre('save', async function (next) {
  if (!this.isNew || this.numeroProtocolo) return next();

  const ano = new Date().getFullYear();
  const prefixo = `PROC-${ano}-`;

  // Conta documentos do ano atual para sequência
  const ultimo = await mongoose.model('Processo').findOne(
    { numeroProtocolo: { $regex: `^${prefixo}` } },
    { numeroProtocolo: 1 },
    { sort: { numeroProtocolo: -1 } }
  );

  let sequencia = 1;
  if (ultimo?.numeroProtocolo) {
    const partes = ultimo.numeroProtocolo.split('-');
    sequencia = parseInt(partes[partes.length - 1], 10) + 1;
  }

  this.numeroProtocolo = `${prefixo}${String(sequencia).padStart(6, '0')}`;
  next();
});

const Processo = mongoose.model('Processo', esquemaProcesso);

export default Processo;
