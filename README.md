# Controle de Processos PM — 3º BPM

API REST para controle de recebimento e acompanhamento de processos administrativos do 3º Batalhão de Polícia Militar de Rondônia.

---

## Stack

- **Node.js** (ESModules) + **Express 4**
- **MongoDB** + **Mongoose 8**
- **JWT** para autenticação
- **Google OAuth 2.0** para login

---

## Estrutura do projeto

```
src/
├── config/
│   ├── ambiente.js        # Variáveis de ambiente
│   ├── bancoDeDados.js    # Conexão MongoDB
│   └── swagger.js         # Spec OpenAPI
├── middlewares/
│   ├── autenticacao.js    # JWT + controle de perfis
│   ├── tratadorDeErros.js # Error handler global
│   └── validacao.js       # express-validator helper
├── modelos/
│   ├── Policial.js        # Hierarquia PM + campos do CSV
│   ├── Processo.js        # Processos administrativos + checklist
│   └── Usuario.js         # Usuários do sistema (Google OAuth)
├── modulos/
│   ├── auth/              # Login Google, refresh, /me
│   ├── usuarios/          # CRUD de usuários (admin)
│   ├── policiais/         # Consulta e edição de policiais
│   └── processos/         # CRUD de processos + dashboard + exportação
├── seeds/
│   └── seedPoliciais.js   # Importa o CSV do efetivo para o banco
├── utils/
│   └── auxiliares.js      # Helpers: manipuladorAsync, paginação etc.
├── app.js                 # Express app (middlewares + rotas)
└── servidor.js            # Entry point (bind + graceful shutdown)
```

---

## Instalação

```bash
# 1. Instalar dependências
npm install

# 2. Configurar variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Colocar o CSV do efetivo
mkdir -p data
cp "Cópia_de_Mapa_da_Força_-_3º_BPM_-_Relação_Nominal_do_Efetivo.csv" data/efetivo.csv

# 4. Popular o banco com os policiais
npm run seed

# 5. Iniciar o servidor
npm run dev       # desenvolvimento (nodemon)
npm start         # produção
```

---

## Variáveis de ambiente

| Variável | Descrição | Exemplo |
|---|---|---|
| `PORT` | Porta do servidor | `3000` |
| `MONGO_URI` | URI de conexão MongoDB | `mongodb+srv://...` |
| `JWT_SECRET` | Segredo JWT (mín. 32 chars) | `abc123...` |
| `JWT_EXPIRES_IN` | Validade do access token | `8h` |
| `JWT_REFRESH_EXPIRES_IN` | Validade do refresh token | `7d` |
| `GOOGLE_CLIENT_ID` | Client ID do Google OAuth | `xxx.apps.googleusercontent.com` |
| `GOOGLE_ALLOWED_DOMAIN` | Restringe login a um domínio | `pm.ro.gov.br` |
| `CORS_ORIGINS` | Origens permitidas (vírgula) | `http://localhost:5173` |

---

## Seed: importando os policiais

O script `src/seeds/seedPoliciais.js` lê o CSV do efetivo e popula a coleção `policials`.

```bash
# Caminho padrão: data/efetivo.csv
npm run seed

# Caminho customizado
CSV_PATH=/outro/caminho.csv npm run seed

# Limpar e reinserir (em vez de upsert)
SEED_MODO=limpar npm run seed
```

O script detecta automaticamente todas as seções do CSV (GAB, CIA, PEL, GP) e extrai:
- **unidade** (ex: `1ª CIA PM`)
- **subunidade** (ex: `1º PEL PM`)
- **localidade** (ex: `VILHENA`, `COLORADO DO OESTE`)

---

## Endpoints principais

### Autenticação
| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/auth/google` | Login com Google (`{ idToken }`) |
| POST | `/api/v1/auth/refresh` | Renova token (`{ refreshToken }`) |
| GET | `/api/v1/auth/me` | Dados do usuário logado |

### Policiais
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/policiais` | Lista com filtros (busca, unidade, localidade) |
| GET | `/api/v1/policiais/unidades` | Lista de unidades e localidades |
| GET | `/api/v1/policiais/:id` | Detalhes de um policial |
| PATCH | `/api/v1/policiais/:id` | Atualiza dados (admin/operador) |

### Processos
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/processos` | Lista com filtros + ordenação por hierarquia |
| GET | `/api/v1/processos/dashboard` | Estatísticas para o painel |
| GET | `/api/v1/processos/exportar` | Dados achatados para planilha |
| GET | `/api/v1/processos/tipos` | Tipos de processo disponíveis |
| GET | `/api/v1/processos/situacoes` | Situações possíveis |
| GET | `/api/v1/processos/:id` | Detalhes + histórico completo |
| POST | `/api/v1/processos` | Registra novo processo |
| PUT | `/api/v1/processos/:id` | Atualiza dados do processo |
| PATCH | `/api/v1/processos/:id/situacao` | Muda situação + registra no histórico |
| PATCH | `/api/v1/processos/:id/documentos` | Atualiza checklist de documentos |

### Usuários (admin)
| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/usuarios` | Lista usuários |
| PATCH | `/api/v1/usuarios/:id/perfil` | Altera perfil (admin/operador/visualizador) |
| PATCH | `/api/v1/usuarios/:id/ativo` | Ativa/desativa conta |

---

## Lógica de ordenação dos processos

Os processos são exibidos com a seguinte prioridade:

1. **Data de recebimento crescente** — processo mais antigo tem prioridade
2. **Ordem hierárquica do policial** — dentro da mesma data, maior posto aparece primeiro
3. **Número de ordem no CSV** — desempate final pela antiguidade dentro do posto

Isso reflete o controle exigido no ofício, respeitando graduação e precedência.

---

## Perfis de acesso

| Perfil | Permissões |
|---|---|
| `admin` | Tudo: incluindo gerenciar usuários e ativar/desativar contas |
| `operador` | Registrar, editar e movimentar processos |
| `visualizador` | Somente leitura |

O **primeiro usuário** que fizer login recebe perfil `admin` automaticamente.

---

## Documentação interativa

Disponível em `http://localhost:3000/api-docs` após iniciar o servidor.

---

## Deploy

Para produção, configure:
- `NODE_ENV=production`
- `MONGO_URI` apontando para seu cluster MongoDB Atlas
- `JWT_SECRET` com valor forte e aleatório
- `CORS_ORIGINS` com o domínio do frontend em produção
- Use um reverse proxy (Nginx) na frente do Node.js
