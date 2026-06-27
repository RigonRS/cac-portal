// ============================================================
// CAC PORTAL — Lógica do Dashboard
// ============================================================

// ---- CONFIGURAÇÃO ----
// Substitua pela URL do seu Cloudflare Worker após o deploy
const WORKER_URL = 'https://cac-portal.silvarigon.workers.dev';

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
    'Aguardando Pagamento GRU':     'badge-yellow',
    'Pronto para Análise':          'badge-blue',
    'Em Análise':                   'badge-blue',
    'Em análise':                   'badge-blue',
    'Aguardando Assinatura':        'badge-orange',
    'Aguardando Protocolo (email)': 'badge-purple',
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
function infoProcesso(p) {
  const d = p.dados || {};
  const tipo = p.tipo || '';
  const linhas = [];

  if (tipo === 'Guia de Tráfego') {
    if (d.tipoGuia) linhas.push(esc(d.tipoGuia));
    if (d.cidadeGuia) linhas.push(esc(d.cidadeGuia) + (d.ufGuia ? '/' + esc(d.ufGuia) : ''));
    if (d.nomeClube)  linhas.push(esc(d.nomeClube));
    if (d.arma)       linhas.push(esc(d.arma));
  } else if (tipo === 'Alteração de Endereço') {
    const end = [d.endLogradouro, d.endNumero, d.endCidade, d.endUF].filter(Boolean);
    if (end.length) linhas.push('Novo Endereço: ' + end.map(esc).join(', '));
  } else if (tipo === 'Inclusão de Atividade' || tipo === 'Exclusão de Atividade') {
    if (d.atividade) linhas.push(esc(d.atividade));
  } else if ([
    'Transferência de Arma SINARM x SIGMA',
    'Transferência de Arma SIGMA x SIGMA',
    'Transferência de Arma SINARM x SINARM',
    'Transferência de Arma SIGMA x SINARM',
    'Aquisição de Arma SIGMA',
    'Aquisição de Arma PF',
    'Renovação de CRAF',
    'Segunda via de CRAF',
  ].includes(tipo)) {
    if (d.arma) linhas.push(esc(d.arma));
  } else {
    if (d.arma) linhas.push(esc(d.arma));
  }

  return linhas.join(' · ');
}

function renderProcessos(processos) {
  const el = document.getElementById('secao-processos');
  if (!processos || processos.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhum processo em andamento no momento.</div>';
    return;
  }
  el.innerHTML = processos.map(p => {
    const info = infoProcesso(p);
    return `
    <div class="processo-item">
      <div class="processo-info">
        <div class="tipo">${esc(p.tipo)}</div>
        ${info ? `<div class="meta">${info}</div>` : ''}
      </div>
      <span class="badge ${statusBadge(p.status)}">${esc(p.status || '—')}</span>
    </div>`;
  }).join('');
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
      <span class="validade-label">
        ${esc(v.label)}
        ${v.arma  ? `<span class="validade-detalhe">${esc(v.arma)}</span>`  : ''}
        ${v.local ? `<span class="validade-detalhe">${esc(v.local)}</span>` : ''}
      </span>
      <div class="validade-right">
        <span class="validade-data">${fmtDate(v.data)}</span>
        ${validadeBadge(v.dias)}
      </div>
    </div>
  `).join('');
}

// ---- RENDERIZAR ARMAS ----
function armaItem(a) {
  return `
    <div class="arma-item">
      <div class="arma-icon"><img src="logo-pistola.png" alt="arma" style="width:28px;height:28px;object-fit:contain" /></div>
      <div class="arma-info">
        <div class="arma-nome">${esc(a.marca || '')} ${esc(a.modelo || '')}</div>
        <div class="arma-meta">
          ${a.especie ? esc(a.especie) + ' · ' : ''}${esc(a.calibre || '—')}
          ${a.serie ? ' · Série: ' + esc(a.serie) : ''}
        </div>
        ${(a.sigma || a.sinarm) ? `<div class="arma-meta">
          ${a.sigma  ? 'SIGMA: '  + esc(a.sigma)  + (a.sinarm ? ' · ' : '') : ''}
          ${a.sinarm ? 'SINARM: ' + esc(a.sinarm) : ''}
        </div>` : ''}
      </div>
      <div class="arma-badges">
        ${a.grupo === 'Restrito'  ? `<span class="badge badge-red">Restrito</span>`    : ''}
        ${a.grupo === 'Permitido' ? `<span class="badge badge-green">Permitido</span>` : ''}
      </div>
    </div>`;
}

function barra(label, atual, max) {
  const pct = Math.min(100, Math.round(atual / max * 100));
  const cor = atual >= max ? '#dc2626' : atual >= max - 1 ? '#d97706' : '#16a34a';
  return `<div class="acervo-barra">
    <div class="acervo-barra-label">
      <span>${esc(label)}</span>
      <span style="color:${atual >= max ? '#dc2626' : 'var(--muted)'}"><strong>${atual}</strong> / ${max}${atual >= max ? ' — LIMITE ATINGIDO' : ''}</span>
    </div>
    <div class="acervo-barra-track"><div class="acervo-barra-fill" style="width:${pct}%;background:${cor}"></div></div>
  </div>`;
}

function renderArmas(armas, categorias) {
  const el = document.getElementById('secao-armas');
  if (!armas || armas.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma arma cadastrada.</div>';
    return;
  }

  const cats = categorias || [];
  const temAtirador = cats.includes('Atirador');
  const temCacador  = cats.includes('Caçador');

  const armAti = armas.filter(a => a.atividade === 'Atirador');
  const permAti = armAti.filter(a => a.grupo === 'Permitido');
  const resAti  = armAti.filter(a => a.grupo === 'Restrito');

  const armCac  = armas.filter(a => a.atividade === 'Caçador');
  const resCac  = armCac.filter(a => a.grupo === 'Restrito');
  const permCac = armCac.filter(a => a.grupo === 'Permitido');

  const armPF   = armas.filter(a => a.orgao === 'PF - Defesa Pessoal');
  const permPF  = armPF.filter(a => a.grupo === 'Permitido');

  const outrasAtividades = [...new Set(armas.map(a => a.atividade).filter(v => v && v !== 'Atirador' && v !== 'Caçador'))];
  const armOutras = outrasAtividades.map(atv => ({ label: atv, lista: armas.filter(a => a.atividade === atv && a.orgao !== 'PF - Defesa Pessoal') })).filter(g => g.lista.length);

  let html = '';

  if (temAtirador || armAti.length) {
    html += `<div class="acervo-categoria">
      <div class="acervo-categoria-header">Acervo Atirador</div>
      <div class="acervo-limites">
        ${barra('Calibre Permitido', permAti.length, 4)}
      </div>
      <div class="acervo-lista">
        ${armAti.length ? armAti.map(armaItem).join('') : '<div class="empty-state">Nenhuma arma neste acervo.</div>'}
      </div>
    </div>`;
  }

  if (temCacador || armCac.length) {
    html += `<div class="acervo-categoria">
      <div class="acervo-categoria-header">Acervo Caçador</div>
      <div class="acervo-limites">
        ${barra('Total de armas', armCac.length, 6)}
        ${barra('Calibre Restrito', resCac.length, 2)}
      </div>
      <div class="acervo-lista">
        ${armCac.length ? armCac.map(armaItem).join('') : '<div class="empty-state">Nenhuma arma neste acervo.</div>'}
      </div>
    </div>`;
  }

  if (armPF.length) {
    html += `<div class="acervo-categoria">
      <div class="acervo-categoria-header">PF — Defesa Pessoal</div>
      <div class="acervo-limites">
        ${barra('Calibre Permitido', permPF.length, 2)}
      </div>
      <div class="acervo-lista">${armPF.map(armaItem).join('')}</div>
    </div>`;
  }

  armOutras.forEach(g => {
    html += `<div class="acervo-categoria">
      <div class="acervo-categoria-header">${esc(g.label)}</div>
      <div class="acervo-lista">${g.lista.map(armaItem).join('')}</div>
    </div>`;
  });

  el.innerHTML = html || '<div class="empty-state">Nenhuma arma cadastrada.</div>';
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

    const dados = resDados.ok  ? await resDados.json()  : { validades: [], processos: [], armas: [], categorias: [] };
    let fData = { files: [] };
    if (resFiles.ok) {
      fData = await resFiles.json();
    } else {
      const errBody = await resFiles.json().catch(() => ({}));
      document.getElementById('secao-arquivos').innerHTML =
        `<div class="empty-state" style="color:var(--red)">Erro ao carregar documentos: ${errBody.error || 'HTTP ' + resFiles.status}</div>`;
    }

    if (resFiles.ok) renderArquivos(fData.files);
    renderProcessos(dados.processos);
    renderValidades(dados.validades);
    renderArmas(dados.armas, dados.categorias);

  } catch (err) {
    document.getElementById('secao-arquivos').innerHTML =
      '<div class="empty-state">Erro ao carregar dados. Verifique sua conexão e tente novamente.</div>';
    document.getElementById('secao-processos').innerHTML = '';
    document.getElementById('secao-validades').innerHTML = '';
    document.getElementById('secao-armas').innerHTML = '';
  }
}

carregarPortal();
