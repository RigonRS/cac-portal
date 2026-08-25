// ============================================================
// CAC PORTAL — Lógica do Dashboard (menu de botões + seções)
// ============================================================

// ---- CONFIGURAÇÃO ----
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

// ---- ESTADO ----
let PORTAL_DADOS = null;   // { validades, processos, armas, categorias, informacoes }
let PORTAL_FILES = null;   // [ {name,size,modified,downloadUrl}, ... ]
let PORTAL_ERRO_FILES = null;

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
  // Cor de acento por tipo de arquivo
  const cores = { pdf:'#dc2626', doc:'#2563eb', docx:'#2563eb', xls:'#16a34a', xlsx:'#16a34a', jpg:'#7c3aed', jpeg:'#7c3aed', png:'#7c3aed', zip:'#a16207', rar:'#a16207' };
  const cor = cores[ext] || '#64748b';
  const rotulo = (ext || '').slice(0, 4).toUpperCase();
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden="true">
    <path d="M13.5 2.5H7A2.5 2.5 0 0 0 4.5 5v14A2.5 2.5 0 0 0 7 21.5h10A2.5 2.5 0 0 0 19.5 19V8.5z" fill="#fff" stroke="${cor}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M13.5 2.5V8.5H19.5" fill="none" stroke="${cor}" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="6.5" y="13" width="11" height="6" rx="1.4" fill="${cor}"/>
    <text x="12" y="17.4" text-anchor="middle" font-size="4.2" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${esc(rotulo)}</text>
  </svg>`;
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

// Remove acentos e deixa minúsculo (para comparar espécie/atividade)
function semAcento(s) {
  return String(s || '').normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '').toLowerCase();
}

// ---- MINIATURA POR TIPO DE ARMA (silhuetas realistas) ----
// Silhuetas em SVG por espécie (revólver, pistola, espingarda, carabina/fuzil).
function armaSvg(especie) {
  const e = semAcento(especie);
  const wrap = (inner) => `<svg viewBox="0 0 34 20" width="38" height="22" fill="currentColor" aria-hidden="true">${inner}</svg>`;
  if (e.includes('revolver')) {
    // Cano curto + tambor (círculo) + coronha curva + guarda-mato
    return wrap(`<path d="M14 7h12v2.4H14z"/><rect x="24.4" y="5.7" width="1.5" height="1.5"/><path d="M6 8h10v3.6H6z"/><circle cx="11" cy="9.9" r="3.5"/><circle cx="11" cy="9.9" r="1" fill="#528EE3"/><path d="M9 11.6a2.7 2.7 0 0 0 2.7 2.5h.8v-1.6h-.8a1.1 1.1 0 0 1-1.1-1z"/><path d="M6 8.6c-2 1-3.1 3.1-3.1 6.1l3 .5c.3-2.6 1.1-4.4 2.6-5.4z"/>`);
  }
  if (e.includes('espingarda')) {
    // Cano duplo longo + bomba + coronha reta
    return wrap(`<path d="M2 7.3h26v1.5H2z"/><path d="M2 8.8h26v1.5H2z"/><rect x="27.4" y="7.1" width="1.7" height="3.4" rx=".4"/><rect x="6" y="6.9" width="6" height="4.4" rx=".6"/><path d="M8 11.3a2 2 0 0 0 2 1.9v-1.5a.7.7 0 0 1-.7-.4z"/><path d="M6 8l-4.2 5.2H5.4l3.1-4z"/>`);
  }
  if (e.includes('carabina') || e.includes('fuzil')) {
    // Cano longo + luneta + carregador curvo + empunhadura + coronha
    return wrap(`<path d="M4 8h27v1.7H4z"/><rect x="30.4" y="7.3" width="1.5" height="2.8" rx=".3"/><rect x="6" y="7" width="10" height="3.4" rx=".5"/><rect x="9" y="4.8" width="6" height="1.9" rx=".9"/><path d="M12 10.4c.3 2 .6 3.6 1.2 5.1l2.3-.6c-.5-1.5-.8-3-.9-4.5z"/><path d="M8 10.4l-1.1 3.4h2.3l1-3.4z"/><path d="M6 8.4l-4.2 1.5v2.1L6 12.8z"/>`);
  }
  // Pistola (padrão): ferrolho + massas de mira + guarda-mato + empunhadura inclinada
  return wrap(`<path d="M6 6h20v3H6z"/><rect x="7" y="4.4" width="2" height="1.6"/><rect x="23.4" y="4.4" width="1.6" height="1.6"/><path d="M6 9h18v1.5H6z"/><path d="M12 10.5a3 3 0 0 0 3 2.9h1v-1.6h-1a1.4 1.4 0 0 1-1.4-1.3z"/><path d="M6 9l-1.6 8h4.3l1.4-8z"/>`);
}

// ---- ÍCONES DAS SEÇÕES (linha branca sobre fundo azul) ----
const ICONS = {
  documentos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2.5H6.5A2.5 2.5 0 0 0 4 5v14a2.5 2.5 0 0 0 2.5 2.5h11A2.5 2.5 0 0 0 20 19V9.5z"/><path d="M13 2.5V9.5H20"/><path d="M7.5 13.5h7M7.5 17h5"/></svg>`,
  processos: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16.5" rx="2.2"/><path d="M9 4.5V3.6A1.4 1.4 0 0 1 10.4 2.2h3.2A1.4 1.4 0 0 1 15 3.6v.9"/><path d="M8.5 12.5l2 2 4-4.3"/></svg>`,
  validades: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.5h17M8 3.2v3.4M16 3.2v3.4"/><path d="M8.8 14.2l2 2 3.8-4"/></svg>`,
  armas: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h16.5a1 1 0 0 1 1 1v1.8a1 1 0 0 1-1 1h-5.6l-1.5 4.4a1.4 1.4 0 0 1-1.3.9H8.4a1.2 1.2 0 0 1-1.13-1.6l1-2.7H4a1 1 0 0 1-1-1z"/><path d="M6.5 12.5h5.2"/></svg>`,
  informacoes: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.2"/><path d="M12 7.8h.01"/></svg>`,
};

// ---- ÍCONES DOS TIPOS DE ACERVO (coloridos com a cor do acervo) ----
const ACERVO_ICONS = {
  // Estande de tiro (alvo)
  atirador: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>`,
  // Javali
  cacador: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.6 7.4 6 4.1 9.6 5.7z"/><path d="M3.2 12.4c0-3 2.3-5.2 5.2-5.4.5-1 1.5-1.6 2.7-1.6.6 0 1.1.2 1.6.5.6-.2 1.2-.3 1.9-.3 2.7 0 5 1.9 5.5 4.5l1.5.4c.7.2 1 1 .5 1.6l-1 1.2c-.3 2.6-2.5 4.6-5.2 4.6h-1v.7a1 1 0 0 1-1 1h-.6a1 1 0 0 1-1-1v-.7h-2.3v.7a1 1 0 0 1-1 1h-.6a1 1 0 0 1-1-1v-1.1c-2-.9-3.4-2.9-3.4-5.3z"/><circle cx="9" cy="11.4" r="1" fill="#fff"/><path d="M21.4 12.3c.8.2 1.4.6 1.9 1.3-.8.1-1.6 0-2.2-.4z"/></svg>`,
  // Escudo
  defesa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.6 4.7 5.5v5.7c0 4.6 3.1 8 7.3 9.2 4.2-1.2 7.3-4.6 7.3-9.2V5.5z"/><path d="M8.8 12l2.1 2.1 4-4.4"/></svg>`,
  // Outros acervos (pistola)
  outro: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h16.5a1 1 0 0 1 1 1v1.8a1 1 0 0 1-1 1h-5.6l-1.5 4.4a1.4 1.4 0 0 1-1.3.9H8.4a1.2 1.2 0 0 1-1.13-1.6l1-2.7H4a1 1 0 0 1-1-1z"/><path d="M6.5 12.5h5.2"/></svg>`,
};

// ---- NAVEGAÇÃO ENTRE MENU E SEÇÕES ----
const SECOES = {
  documentos: { titulo: 'Documentos',              icone: ICONS.documentos,  render: renderDocumentos },
  processos:  { titulo: 'Processos',               icone: ICONS.processos,   render: renderProcessos },
  validades:  { titulo: 'Validades de Documentos', icone: ICONS.validades,   render: renderValidades },
  armas:      { titulo: 'Acervo de Armas',         icone: ICONS.armas,       render: renderArmas },
  informacoes:{ titulo: 'Informações importantes', icone: ICONS.informacoes, render: renderInformacoes },
};

function renderMenu() {
  const el = document.getElementById('portal-menu');
  const d = PORTAL_DADOS || {};
  const contagem = {
    documentos:  PORTAL_FILES ? PORTAL_FILES.length : null,
    processos:   (d.processos || []).length,
    validades:   (d.validades || []).length,
    armas:       (d.armas || []).length,
    informacoes: (d.informacoes || []).length,
  };
  const legenda = {
    documentos:  'Documentos disponíveis para baixar',
    processos:   'Acompanhe seus processos em andamento',
    validades:   'Datas de validade dos seus documentos',
    armas:       'Consulte o seu acervo de armas',
    informacoes: 'Avisos e informações importantes',
  };
  el.style.display = '';
  el.innerHTML = Object.entries(SECOES).map(([chave, s]) => {
    const n = contagem[chave];
    const badge = (n === null || n === undefined) ? '' : `<span class="menu-card-count">${n}</span>`;
    return `<div class="menu-card" onclick="abrirSecao('${chave}')">
      <div class="menu-card-icon">${s.icone}</div>
      <h2>${esc(s.titulo)}${badge}</h2>
      <p>${esc(legenda[chave])}</p>
    </div>`;
  }).join('');
}

function abrirSecao(chave) {
  const s = SECOES[chave];
  if (!s) return;
  const menu = document.getElementById('portal-menu');
  const view = document.getElementById('portal-view');
  menu.style.display = 'none';
  view.style.display = '';
  view.innerHTML = `
    <button class="btn-voltar" onclick="voltarMenu()">← Voltar</button>
    <div class="section">
      <div class="section-header">
        <div class="icon sec-icon">${s.icone}</div>
        <h2>${esc(s.titulo)}</h2>
      </div>
      <div class="section-body" id="secao-conteudo"></div>
    </div>`;
  window.scrollTo(0, 0);
  s.render(document.getElementById('secao-conteudo'));
}

function voltarMenu() {
  document.getElementById('portal-view').style.display = 'none';
  document.getElementById('portal-view').innerHTML = '';
  document.getElementById('portal-menu').style.display = '';
  window.scrollTo(0, 0);
}

// ---- DOCUMENTOS ----
async function baixarArquivo(nome) {
  const url = `${WORKER_URL}/download?token=${encodeURIComponent(token)}&name=${encodeURIComponent(nome)}`;
  window.open(url, '_blank');
  try {
    await fetch(`${WORKER_URL}/log-download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, arquivo: nome }),
    });
  } catch(e) {}
}

function renderDocumentos(el) {
  if (PORTAL_ERRO_FILES) {
    el.innerHTML = `<div class="empty-state" style="color:var(--red)">Erro ao carregar documentos: ${esc(PORTAL_ERRO_FILES)}</div>`;
    return;
  }
  const files = PORTAL_FILES;
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
        ? `<button class="btn-baixar" data-nome="${esc(f.name)}" onclick="baixarArquivo(this.dataset.nome)">⬇ Baixar</button>`
        : `<span style="font-size:12px;color:var(--muted)">Indisponível</span>`
      }
    </div>
  `).join('');
}

// ---- PROCESSOS ----
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
  } else {
    if (d.arma) linhas.push(esc(d.arma));
  }
  return linhas.join(' · ');
}

function renderProcessos(el) {
  const processos = (PORTAL_DADOS || {}).processos;
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

// ---- VALIDADES ----
function renderValidades(el) {
  const validades = (PORTAL_DADOS || {}).validades;
  const aviso = `<div class="aviso-validades">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
    <span>ATENÇÃO: É dever e obrigação do CAC de manter em dia a validade de seus documentos.</span>
  </div>`;
  if (!validades || validades.length === 0) {
    el.innerHTML = aviso + '<div class="empty-state">Nenhuma validade cadastrada.</div>';
    return;
  }
  el.innerHTML = aviso + validades.map(v => `
    <div class="validade-item">
      <span class="validade-label">
        ${esc(v.label)}
        ${v.arma     ? `<span class="validade-detalhe">${esc(v.arma)}</span>`     : ''}
        ${v.tipoGuia ? `<span class="validade-detalhe">${esc(v.tipoGuia)}</span>` : ''}
        ${v.local    ? `<span class="validade-detalhe">${esc(v.local)}</span>`    : ''}
      </span>
      <div class="validade-right">
        <span class="validade-data">${fmtDate(v.data)}</span>
        ${validadeBadge(v.dias)}
      </div>
    </div>
  `).join('');
}

// ---- ACERVO DE ARMAS ----
function armaItem(a) {
  return `
    <div class="arma-item">
      <div class="arma-icon" title="${esc(a.especie || 'Arma')}">${armaSvg(a.especie)}</div>
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

// Cabeçalho de um tipo de acervo, com símbolo grande (estande de tiro / javali / escudo)
function acervoHeader(simbolo, titulo, cor) {
  return `<div class="acervo-tipo-header" style="--acervo-cor:${cor}">
    <span class="acervo-tipo-simbolo">${simbolo}</span>
    <span class="acervo-tipo-titulo">${esc(titulo)}</span>
  </div>`;
}

function renderArmas(el) {
  const armas = (PORTAL_DADOS || {}).armas;
  const categorias = (PORTAL_DADOS || {}).categorias;
  if (!armas || armas.length === 0) {
    el.innerHTML = '<div class="empty-state">Nenhuma arma cadastrada.</div>';
    return;
  }

  const cats = categorias || [];
  const temAtirador = cats.includes('Atirador');
  const temCacador  = cats.includes('Caçador');

  const armAti = armas.filter(a => a.atividade === 'Atirador');
  const permAti = armAti.filter(a => a.grupo === 'Permitido');

  const armCac  = armas.filter(a => a.atividade === 'Caçador');
  const resCac  = armCac.filter(a => a.grupo === 'Restrito');

  const armPF   = armas.filter(a => a.orgao === 'PF - Defesa Pessoal');
  const permPF  = armPF.filter(a => a.grupo === 'Permitido');

  const outrasAtividades = [...new Set(armas.map(a => a.atividade).filter(v => v && v !== 'Atirador' && v !== 'Caçador'))];
  const armOutras = outrasAtividades
    .map(atv => ({ label: atv, lista: armas.filter(a => a.atividade === atv && a.orgao !== 'PF - Defesa Pessoal') }))
    .filter(g => g.lista.length);

  let html = '';

  if (temAtirador || armAti.length) {
    html += `<div class="acervo-bloco acervo-atirador">
      ${acervoHeader(ACERVO_ICONS.atirador, 'Acervo Atirador', '#2563eb')}
      <div class="acervo-limites">${barra('Calibre Permitido', permAti.length, 4)}</div>
      <div class="acervo-lista">
        ${armAti.length ? armAti.map(armaItem).join('') : '<div class="empty-state">Nenhuma arma neste acervo.</div>'}
      </div>
    </div>`;
  }

  if (temCacador || armCac.length) {
    html += `<div class="acervo-bloco acervo-cacador">
      ${acervoHeader(ACERVO_ICONS.cacador, 'Acervo Caçador', '#a16207')}
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
    html += `<div class="acervo-bloco acervo-defesa">
      ${acervoHeader(ACERVO_ICONS.defesa, 'Defesa Pessoal (PF)', '#16a34a')}
      <div class="acervo-limites">${barra('Calibre Permitido', permPF.length, 2)}</div>
      <div class="acervo-lista">${armPF.map(armaItem).join('')}</div>
    </div>`;
  }

  armOutras.forEach(g => {
    html += `<div class="acervo-bloco">
      ${acervoHeader(ACERVO_ICONS.outro, g.label, '#64748b')}
      <div class="acervo-lista">${g.lista.map(armaItem).join('')}</div>
    </div>`;
  });

  el.innerHTML = html || '<div class="empty-state">Nenhuma arma cadastrada.</div>';
}

// ---- INFORMAÇÕES IMPORTANTES ----
function renderInformacoes(el) {
  const infos = (PORTAL_DADOS || {}).informacoes || [];
  if (!infos.length) {
    el.innerHTML = '<div class="empty-state">Nenhuma informação disponível no momento.</div>';
    return;
  }
  el.innerHTML = infos.map((c, i) => `
    <div class="info-card">
      <button class="info-card-head" onclick="toggleInfoCard(${i})" aria-expanded="false">
        <span>${esc(c.titulo || 'Informação')}</span>
        <span class="info-card-seta" id="info-seta-${i}">▾</span>
      </button>
      <div class="info-card-body" id="info-body-${i}" style="display:none">${esc(c.conteudo || '')}</div>
    </div>
  `).join('');
}

function toggleInfoCard(i) {
  const body = document.getElementById(`info-body-${i}`);
  const seta = document.getElementById(`info-seta-${i}`);
  if (!body) return;
  const aberto = body.style.display !== 'none';
  body.style.display = aberto ? 'none' : 'block';
  if (seta) seta.textContent = aberto ? '▾' : '▴';
}

// ---- CARREGAR DADOS ----
function renderMenuSkeleton() {
  const el = document.getElementById('portal-menu');
  el.innerHTML = Array.from({ length: 5 }).map(() => `
    <div class="menu-card menu-card-skeleton">
      <div class="menu-card-icon" style="background:#e2e8f0"></div>
      <div class="skeleton" style="width:60%;margin:14px auto 6px"></div>
      <div class="skeleton" style="width:80%;margin:0 auto"></div>
    </div>`).join('');
}

async function carregarPortal() {
  renderMenuSkeleton();
  try {
    const [resDados, resFiles] = await Promise.all([
      fetch(`${WORKER_URL}/dados?token=${encodeURIComponent(token)}`),
      fetch(`${WORKER_URL}/files?token=${encodeURIComponent(token)}`),
    ]);

    if (resDados.status === 401 || resFiles.status === 401) {
      const err = await resDados.json().catch(() => ({}));
      alert(err.error || 'Sua sessão expirou. Faça login novamente.');
      sair();
      return;
    }

    PORTAL_DADOS = resDados.ok ? await resDados.json() : { validades: [], processos: [], armas: [], categorias: [], informacoes: [] };

    if (resFiles.ok) {
      const fData = await resFiles.json();
      PORTAL_FILES = fData.files || [];
    } else {
      const errBody = await resFiles.json().catch(() => ({}));
      PORTAL_ERRO_FILES = errBody.error || ('HTTP ' + resFiles.status);
      PORTAL_FILES = [];
    }

    renderMenu();
  } catch (err) {
    document.getElementById('portal-menu').innerHTML =
      '<div class="empty-state">Erro ao carregar dados. Verifique sua conexão e tente novamente.</div>';
  }
}

carregarPortal();
