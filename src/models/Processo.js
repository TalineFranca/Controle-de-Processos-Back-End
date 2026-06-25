import mongoose from 'mongoose';

export const STATUS_PROCESSO = ['naoFeito', 'aConferir', 'feito'];

const processoSchema = new mongoose.Schema(
  {
    policial: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Policial',
      required: true,
    },
    numeroProcesso: {
      type: String,
      trim: true,
      default: null,
    },
    dataRecebimento: {
      type: Date,
      required: true,
      default: Date.now,
    },
    status: {
      type: String,
      enum: STATUS_PROCESSO,
      default: 'naoFeito',
    },
    dataConclussao: {
      type: Date,
      default: null,
    },
    registradoPor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
    },
    observacoes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

processoSchema.index({ policial: 1 });
processoSchema.index({ status: 1 });
processoSchema.index({ dataRecebimento: 1 });

const Processo = mongoose.model('Processo', processoSchema);

export default Processo;