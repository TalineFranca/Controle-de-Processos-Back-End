import mongoose from 'mongoose';

/**
 * Perfis de acesso do sistema.
 * - admin: acesso total
 * - operador: registra e edita processos
 * - visualizador: somente leitura
 */
export const PERFIS = ['admin', 'operador', 'visualizador'];

const esquemaUsuario = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'E-mail é obrigatório'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    fotoPerfil: {
      type: String,
      default: null,
    },
    perfil: {
      type: String,
      enum: { values: PERFIS, message: 'Perfil inválido: {VALUE}' },
      default: 'visualizador',
    },
    ativo: {
      type: Boolean,
      default: true,
    },
    ultimoAcesso: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

esquemaUsuario.index({ email: 1 }, { unique: true });

const Usuario = mongoose.model('Usuario', esquemaUsuario);

export default Usuario;
