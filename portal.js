// ============================================================
// CAC PORTAL — Lógica do Dashboard
// ============================================================

// ---- CONFIGURAÇÃO ----
// Substitua pela URL do seu Cloudflare Worker após o deploy
const WORKER_URL = 'https://cac-portal.SEU-USUARIO.workers.dev';

// ---- SESSÃO ----
const token = sessionStorage.getItem('cac_token');
const nome  = sessionStorage.getItem('cac_nome');

if (!token) {
  window.location.href = 'index.html';
}

document.getElementById('nome-cliente').textContent = nome || '';

function sair() {
  sessionStorage.removeItem('cac_token');
  sessionStorage.removeItem('cac_nome');
  window.location.href = 'index.html';
}

// ---- UTILITÁRIOS ----
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const map = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', jpg: '🖼️', jpeg: '🖼️', png: '🖼️', zip: '🗜️', rar: '🗜️' };
  return map[ext] || '📄';
}

function statusBadge(s) {
  const m = {
    'Aguardando Pagamento Cliente': 'badge-orange',
    'Aguardando Documentos':        'badge-yellow',
    'Pronto para Análise':          'badge-blue',
    'Em análise':                   'badge-blue',
    'Parado':                       'badge-gray',
    'Processo Futuro':              'badge-purple',
    'Deferido':                     'badge-green',
    'Indeferido':                   'badge-red',
    'Arquivado':                    'badge-gray',
  };
  return m[s] || 'badge-gray';
}

function validadeBadge(dias) {
  if (dias === null || dias === undefined) return '';
  if (dias < 0)   return `<span class="badge badge-red">Vencido há ${Math.abs(dias)}d</span>`;
  if (dias <= 30)  return `<span class="badge badge-red">${dias}d</span>`;
  if (dias <= 60)  return `<span class="badge badge-yellow">${dias}d</span>`;
  return `<span class="badge badge-green">${dias}d</span>`;
}

// ---- RENDERIZAR ARQUIVOS ----
function renderArquivos(files) {
  const el = document.getElementById('secao-arquivos');
  if (!files || files.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum documento disponível no momento.</div>';
    return;
  }
  el.innerHTML = files.map(f => `
    <div class="file-item">
      <div class="file-icon">${fileIcon(f.name)}</div>
      <div class="file-info">
        <div class="file-name" title="${esc(f.name)}">${esc(f.name)}</div>
        <div class="file-meta">${fmtSize(f.size)}${f.modified ? ' · ' + fmtDate(f.modified) : ''}</div>
      </div>
      ${f.downloadUrl
        ? `<a class="btn-baixar" href="${esc(f.downloadUrl)}" target="_blank" download>⬇ Baixar</a>`
        : `<span style="font-size:12px;color:var(--muted)">Indisponível</span>`
      }
    </div>
  `).join('');
}

// ---- RENDERIZAR PROCESSOS ----
function renderProcessos(processos) {
  const el = document.getElementById('secao-processos');
  if (!processos || processos.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum processo em andamento no momento.</div>';
    return;
  }
  el.innerHTML = processos.map(p => `
    <div class="processo-item">
      <div class="processo-info">
        <div class="tipo">${esc(p.tipo)}</div>
        <div class="meta">
          ${p.abertura ? 'Aberto em ' + fmtDate(p.abertura) : ''}
          ${p.protocolo ? ' · Protocolo: ' + esc(p.protocolo) : ''}
        </div>
      </div>
      <span class="badge ${statusBadge(p.status)}">${esc(p.status || '—')}</span>
    </div>
  `).join('');
}

// ---- RENDERIZAR VALIDADES ----
function renderValidades(validades) {
  const el = document.getElementById('secao-validades');
  if (!validades || validades.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma validade cadastrada.</div>';
    return;
  }
  el.innerHTML = validades.map(v => `
    <div class="validade-item">
      <span class="validade-label">${esc(v.label)}</span>
      <div class="validade-right">
        <span class="validade-data">${fmtDate(v.data)}</span>
        ${validadeBadge(v.dias)}
      </div>
    </div>
  `).join('');
}

// ---- CARREGAR DADOS ----
async function carregarPortal() {
  try {
    const [resDados, resFiles] = await Promise.all([
      fetch(`${WORKER_URL}/dados?token=${encodeURIComponent(token)}`),
      fetch(`${WORKER_URL}/files?token=${encodeURIComponent(token)}`),
    ]);

    // Verificar se o token expirou
    if (resDados.status === 401 || resFiles.status === 401) {
      const err = await resDados.json().catch(() => ({}));
      alert(err.error || 'Sua sessão expirou. Faça login novamente.');
      sair();
      return;
    }

    const dados = resDados.ok  ? await resDados.json()  : { validades: [], processos: [] };
    const fData = resFiles.ok  ? await resFiles.json()  : { files: [] };

    renderArquivos(fData.files);
    renderProcessos(dados.processos);
    renderValidades(dados.validades);

  } catch (err) {
    document.getElementById('secao-arquivos').innerHTML =
      '<div class="empty-state">Erro ao carregar dados. Verifique sua conexão e tente novamente.</div>';
    document.getElementById('secao-processos').innerHTML = '';
    document.getElementById('secao-validades').innerHTML = '';
  }
}

carregarPortal();
