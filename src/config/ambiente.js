import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../.env') });

const ambiente = {
  porta: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/controle_processos_pm',
  jwt: {
    segredo: process.env.JWT_SECRET || 'dev_secret_nao_usar_em_producao',
    expiracao: process.env.JWT_EXPIRES_IN || '8h',
    expiracaoRefresh: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    dominioPermitido: process.env.GOOGLE_ALLOWED_DOMAIN || '',
  },
  corsOrigens: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5173', 'http://localhost:3001'],
};

export default ambiente;
