// ============================================================
// CAC PORTAL — Cloudflare Worker
// Deploy em: https://dash.cloudflare.com → Workers & Pages
//
// Secrets necessários (Settings → Variables → Add Secret):
//   AZURE_TENANT_ID   — be520b86-b5ad-44dd-acd2-b6a56d438ca5
//   AZURE_CLIENT_ID   — b9e4b955-b4e0-498c-b1c1-e996cc91dcf0
//   AZURE_CLIENT_SECRET — gerar no portal.azure.com
//   ONEDRIVE_UPN      — matheus@simonebpegoraro.onmicrosoft.com  (dados JSON)
//   DOCS_UPN          — email da Simone (OneDrive onde está PRISCILA E MATHEUS)
//   WORKER_SECRET     — string longa aleatória (64+ chars)
//   PORTAL_ORIGIN     — https://rigonrs.github.io
// ============================================================

const GRAPH = 'https://graph.microsoft.com/v1.0';
const DATA_FOLDER = 'cac-gestao-dados';
const DOCS_PATH   = 'Documentos/PRISCILA E MATHEUS/CR\'S';
const TOKEN_TTL   = 60 * 60 * 1000; // 1 hora em ms
const STATUS_FECHADOS = ['Deferido', 'Indeferido', 'Arquivado'];

// ---- CORS ----
function corsHeaders(env, request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.PORTAL_ORIGIN || '';
  const allow = (allowed && origin.startsWith(allowed)) ? origin : allowed;
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResp(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ---- MICROSOFT TOKEN (client_credentials) ----
async function getMsToken(env) {
  const res = await fetch(
    `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     env.AZURE_CLIENT_ID,
        client_secret: env.AZURE_CLIENT_SECRET,
        scope:         'https://graph.microsoft.com/.default',
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Erro ao autenticar com Azure AD: ' + err);
  }
  const { access_token } = await res.json();
  return access_token;
}

// ---- ONEDRIVE: ler arquivo JSON ----
async function readJson(msToken, upn, path) {
  const url = `${GRAPH}/users/${encodeURIComponent(upn)}/drive/root:/${path}:/content`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${msToken}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Erro ao ler ${path}: HTTP ${res.status}`);
  return res.json();
}

// ---- ONEDRIVE: listar arquivos de uma pasta ----
async function listFolder(msToken, upn, folderPath) {
  const encoded = folderPath.split('/').map(p => encodeURIComponent(p)).join('/');
  const url = `${GRAPH}/users/${encodeURIComponent(upn)}/drive/root:/${encoded}:/children?$select=name,size,lastModifiedDateTime,file,id`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${msToken}` } });
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Erro ao listar pasta (HTTP ${res.status}): ${body}`);
  }
  const data = await res.json();
  return (data.value || []).filter(i => i.file);
}

// ---- TOKEN HMAC-SHA256 ----
async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function signToken(payload, secret) {
  const key = await importKey(secret);
  const data = JSON.stringify(payload);
  const encoded = b64url(new TextEncoder().encode(data));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded));
  return encoded + '.' + b64url(sig);
}

async function verifyToken(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Token inválido');
  const [encoded, sigB64] = parts;
  const key = await importKey(secret);
  const sigBytes = Uint8Array.from(atob(sigB64.replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(encoded));
  if (!valid) throw new Error('Assinatura inválida');
  const payload = JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
  if (payload.exp < Date.now()) throw new Error('Sessão expirada. Faça login novamente.');
  return payload;
}

// ---- ENDPOINT: POST /auth ----
async function handleAuth(request, env, cors) {
  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: 'Requisição inválida' }, 400, cors); }

  const { cpf, dataNascimento } = body;
  if (!cpf || !dataNascimento) return jsonResp({ error: 'CPF e data de nascimento são obrigatórios' }, 400, cors);

  try {
    const msToken = await getMsToken(env);
    const clientes = await readJson(msToken, env.ONEDRIVE_UPN, `${DATA_FOLDER}/clientes.json`);
    if (!clientes) return jsonResp({ error: 'Serviço indisponível' }, 503, cors);

    // Normaliza o CPF para comparação (remove pontos e traço)
    const cpfNorm = cpf.replace(/\D/g, '');
    const cliente = clientes.find(c => {
      const cCpf = (c.CPF || '').replace(/\D/g, '');
      const cData = (c.DataNascimento || '').split('T')[0];
      return cCpf === cpfNorm && cData === dataNascimento;
    });

    if (!cliente) return jsonResp({ error: 'Dados não conferem. Verifique o CPF e a data de nascimento.' }, 401, cors);

    const token = await signToken(
      { sub: String(cliente.id), nome: cliente.Title, exp: Date.now() + TOKEN_TTL },
      env.WORKER_SECRET
    );

    return jsonResp({ token, nome: cliente.Title }, 200, cors);
  } catch (e) {
    return jsonResp({ error: e.message }, 500, cors);
  }
}

// ---- ENDPOINT: GET /dados ----
async function handleDados(request, env, cors) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return jsonResp({ error: 'Token não fornecido' }, 401, cors);

  let payload;
  try { payload = await verifyToken(token, env.WORKER_SECRET); }
  catch (e) { return jsonResp({ error: e.message }, 401, cors); }

  try {
    const msToken = await getMsToken(env);
    const [clientes, processos, documentos, armas] = await Promise.all([
      readJson(msToken, env.ONEDRIVE_UPN, `${DATA_FOLDER}/clientes.json`),
      readJson(msToken, env.ONEDRIVE_UPN, `${DATA_FOLDER}/processos.json`),
      readJson(msToken, env.ONEDRIVE_UPN, `${DATA_FOLDER}/documentos.json`),
      readJson(msToken, env.ONEDRIVE_UPN, `${DATA_FOLDER}/armas.json`),
    ]);

    const cliente = (clientes || []).find(c => String(c.id) === payload.sub) || {};

    const validades = [];
    const addValidade = (label, iso) => {
      if (!iso) return;
      const data = iso.split('T')[0];
      const hoje = new Date(); hoje.setHours(0,0,0,0);
      const venc = new Date(data + 'T00:00:00');
      const dias = Math.floor((venc.getTime() - hoje.getTime()) / 86400000);
      validades.push({ label, data, dias });
    };
    addValidade('CR', cliente.DataValidadeCR);
    addValidade('CTF', cliente.DataValidadeCTF);
    addValidade('Avaliação Psicológica', cliente.ValidadeAvaliPsi);
    addValidade('Teste de Tiro', cliente.ValidadeTesteTiro);

    // Validades de documentos (CRAF, Guia)
    (documentos || [])
      .filter(d => String(d.ClienteId) === payload.sub && d.DataValidade)
      .forEach(d => addValidade(d.TipoDocumento, d.DataValidade));

    const processosAtivos = (processos || [])
      .filter(p => String(p.ClienteId) === payload.sub && !STATUS_FECHADOS.includes(p.Status))
      .map(p => ({
        tipo:      p.TipoProcesso,
        status:    p.Status,
        abertura:  p.DataAbertura ? p.DataAbertura.split('T')[0] : null,
        protocolo: p.NumeroProtocolo || null,
      }));

    const acervoArmas = (armas || [])
      .filter(a => String(a.ClienteId) === payload.sub)
      .map(a => ({
        marca:      a.Marca || null,
        modelo:     a.Modelo || null,
        especie:    a.Especie || null,
        calibre:    a.Calibre || null,
        grupo:      a.GrupoCalibre || null,
        atividade:  a.AtividadeCadastrada || null,
        orgao:      a.OrgaoCadastro || null,
        serie:      a.NumeroSerie || null,
        sigma:      a.NumeroSIGMA || null,
        sinarm:     a.NumeroSINARM || null,
      }));

    return jsonResp({ validades, processos: processosAtivos, armas: acervoArmas }, 200, cors);
  } catch (e) {
    return jsonResp({ error: e.message }, 500, cors);
  }
}

// ---- ENDPOINT: GET /files ----
async function handleFiles(request, env, cors) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return jsonResp({ error: 'Token não fornecido' }, 401, cors);

  let payload;
  try { payload = await verifyToken(token, env.WORKER_SECRET); }
  catch (e) { return jsonResp({ error: e.message }, 401, cors); }

  try {
    const msToken = await getMsToken(env);
    const docsUpn = env.DOCS_UPN || env.ONEDRIVE_UPN;
    const folderPath = `${DOCS_PATH}/${payload.nome}/DOCUMENTOS PORTAL`;
    const items = await listFolder(msToken, docsUpn, folderPath);

    const files = await Promise.all(items.map(async f => {
      let downloadUrl = null;
      try {
        const dlRes = await fetch(
          `${GRAPH}/users/${encodeURIComponent(docsUpn)}/drive/items/${f.id}/content`,
          { headers: { Authorization: `Bearer ${msToken}` }, redirect: 'manual' }
        );
        downloadUrl = dlRes.headers.get('Location') || null;
      } catch { /* sem link de download */ }
      return {
        name:        f.name,
        size:        f.size,
        modified:    f.lastModifiedDateTime ? f.lastModifiedDateTime.split('T')[0] : null,
        downloadUrl,
      };
    }));

    return jsonResp({ files }, 200, cors);
  } catch (e) {
    return jsonResp({ error: e.message }, 500, cors);
  }
}

// ---- ENDPOINT: GET /debug (diagnóstico — remover após testes) ----
async function handleDebug(request, env, cors) {
  try {
    const msToken = await getMsToken(env);
    const upn = env.ONEDRIVE_UPN;
    const docsUpn = env.DOCS_UPN || env.ONEDRIVE_UPN;

    const listAt = async (targetUpn, path) => {
      const encoded = path.split('/').map(p => encodeURIComponent(p)).join('/');
      const url = `${GRAPH}/users/${encodeURIComponent(targetUpn)}/drive/root:/${encoded}:/children?$select=name,folder,file&$top=20`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${msToken}` } });
      if (res.status === 404) return { status: 404, items: [] };
      if (!res.ok) return { status: res.status, error: await res.text() };
      const data = await res.json();
      return { status: 200, items: (data.value || []).map(i => ({ name: i.name, type: i.folder ? 'pasta' : 'arquivo' })) };
    };

    const rootOf = async (targetUpn) => {
      const url = `${GRAPH}/users/${encodeURIComponent(targetUpn)}/drive/root/children?$select=name,folder&$top=20`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${msToken}` } });
      if (!res.ok) return { status: res.status, error: await res.text() };
      const data = await res.json();
      return { status: 200, items: (data.value || []).map(i => ({ name: i.name, type: i.folder ? 'pasta' : 'arquivo' })) };
    };

    const [rootDocs, dentroDocumentos, r1, r2] = await Promise.all([
      rootOf(docsUpn),
      listAt(docsUpn, 'Documentos'),
      listAt(docsUpn, 'PRISCILA E MATHEUS'),
      listAt(docsUpn, 'PRISCILA E MATHEUS/CR\'S'),
    ]);

    // Busca por PRISCILA em toda a raiz via search
    const searchUrl = `${GRAPH}/users/${encodeURIComponent(docsUpn)}/drive/root/search(q='PRISCILA')?$select=name,parentReference,webUrl&$top=10`;
    const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${msToken}` } });
    const searchData = searchRes.ok ? await searchRes.json() : { value: [] };
    const searchResults = (searchData.value || []).map(i => ({ name: i.name, path: i.parentReference?.path, url: i.webUrl }));

    return jsonResp({
      dados_upn: upn,
      docs_upn: docsUpn,
      'raiz_simone': rootDocs,
      'dentro_de_Documentos': dentroDocumentos,
      'PRISCILA E MATHEUS (raiz)': r1,
      'CR\'S (raiz)': r2,
      'busca_PRISCILA': searchResults,
    }, 200, cors);
  } catch (e) {
    return jsonResp({ error: e.message }, 500, cors);
  }
}

// ---- ROTEADOR PRINCIPAL ----
export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/auth'  && request.method === 'POST') return handleAuth(request, env, cors);
    if (pathname === '/dados' && request.method === 'GET')  return handleDados(request, env, cors);
    if (pathname === '/files' && request.method === 'GET')  return handleFiles(request, env, cors);
    if (pathname === '/debug' && request.method === 'GET')  return handleDebug(request, env, cors);

    return jsonResp({ error: 'Rota não encontrada' }, 404, cors);
  },
};
