import mongoose from 'mongoose';
import crypto from 'crypto';

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
    /**
     * Hash da senha para login local (opcional — pode usar só Google).
     * Armazenado como SHA-256 com salt, ou null se o usuário só usa OAuth.
     */
    senhaHash: {
      type: String,
      default: null,
      select: false, // nunca retorna no JSON padrão
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

/**
 * Define a senha do usuário (hash SHA-256 + salt).
 */
esquemaUsuario.methods.definirSenha = function (senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHmac('sha256', salt).update(senha).digest('hex');
  this.senhaHash = `${salt}:${hash}`;
};

/**
 * Verifica se a senha fornecida corresponde ao hash armazenado.
 */
esquemaUsuario.methods.verificarSenha = function (senha) {
  if (!this.senhaHash) return false;
  const [salt, hashArmazenado] = this.senhaHash.split(':');
  const hash = crypto.createHmac('sha256', salt).update(senha).digest('hex');
  return hash === hashArmazenado;
};

const Usuario = mongoose.model('Usuario', esquemaUsuario);

export default Usuario;
