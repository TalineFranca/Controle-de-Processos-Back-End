import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import ambiente from './config/ambiente.js';
import { tratadorDeErros } from './middlewares/tratadorDeErros.js';
import especificacaoSwagger from './config/swagger.js';

import rotasAuth from './modulos/auth/rotas.js';
import rotasUsuarios from './modulos/usuarios/rotas.js';
import rotasPoliciais from './modulos/policiais/rotas.js';
import rotasProcessos from './modulos/processos/rotas.js';

const app = express();

app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// Segurança
// ─────────────────────────────────────────────
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ambiente.corsOrigens.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} não permitida`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Rate limiting global
const limitador = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { sucesso: false, erro: 'Muitas requisições. Tente novamente em 15 minutos.' },
});
app.use(limitador);

// Rate limiting mais restrito para auth
const limitadorAuth = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { sucesso: false, erro: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
});

// ─────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────
if (ambiente.nodeEnv !== 'test') {
  app.use(morgan(ambiente.nodeEnv === 'development' ? 'dev' : 'combined'));
}

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ sucesso: true, status: 'ok', ambiente: ambiente.nodeEnv, ts: new Date() });
});

// ─────────────────────────────────────────────
// Documentação Swagger
// ─────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(especificacaoSwagger));

// ─────────────────────────────────────────────
// Rotas da API
// ─────────────────────────────────────────────
const BASE = '/api/v1';

app.use(`${BASE}/auth`, limitadorAuth, rotasAuth);
app.use(`${BASE}/usuarios`, rotasUsuarios);
app.use(`${BASE}/policiais`, rotasPoliciais);
app.use(`${BASE}/processos`, rotasProcessos);

// 404
app.use((req, res) => {
  res.status(404).json({ sucesso: false, erro: `Rota ${req.method} ${req.path} não encontrada` });
});

app.use(tratadorDeErros);

export default app;