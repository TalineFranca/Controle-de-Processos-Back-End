import mongoose from 'mongoose';

/**
 * Status possíveis de um registro.
 * Simples: o processo chegou ou não foi resolvido ainda?
 */
export const STATUS_PROCESSO = ['naoFeito', 'feito'];

const esquemaProcesso = new mongoose.Schema(
  {
    /**
     * Policial a quem pertence o registro
     */
    policial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policial',
      required: [true, 'Policial é obrigatório'],
    },
    /**
     * Data de chegada/recebimento do processo (obrigatória)
     */
    dataRecebimento: {
      type: Date,
      required: [true, 'Data de recebimento é obrigatória'],
      default: Date.now,
    },
    /**
     * Número do processo (SEI ou outro) — opcional
     */
    numeroProcesso: {
      type: String,
      trim: true,
      default: null,
    },
    /**
     * Status: feito ou não feito
     */
    status: {
      type: String,
      enum: {
        values: STATUS_PROCESSO,
        message: 'Status inválido: {VALUE}',
      },
      default: 'naoFeito',
    },
    /**
     * Data em que foi marcado como feito
     */
    dataConclussao: {
      type: Date,
      default: null,
    },
    /**
     * Usuário que registrou
     */
    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Índices para consultas frequentes
esquemaProcesso.index({ policial: 1, dataRecebimento: -1 });
esquemaProcesso.index({ status: 1 });
esquemaProcesso.index({ dataRecebimento: -1 });
esquemaProcesso.index({ numeroProcesso: 1 }, { sparse: true });

const Processo = mongoose.model('Processo', esquemaProcesso);

export default Processo;
