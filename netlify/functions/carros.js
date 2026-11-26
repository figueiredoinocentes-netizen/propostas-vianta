// Netlify Function: lê as viaturas da tabela `carros` (Central Vianta) através
// da API do dashboard e devolve-as já no formato que o gerador usa.
// Server-side para evitar CORS. Só leitura.
const CENTRAL_URL = 'https://vianta-dashboard.netlify.app/.netlify/functions/central?type=carros';

const vazio = (v) => v == null || String(v).trim() === '';

// "22000" / "22 000" / "10 000,00" → 22000
function num(v) {
  if (vazio(v)) return null;
  const n = parseFloat(String(v).split(',')[0].replace(/\s/g, '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const grupos = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const eur = (v) => (num(v) == null ? '' : `${grupos(num(v))} €`);
const kmTxt = (v) => (num(v) == null ? '' : `${grupos(num(v))} km`);

// Híbrido → "Híbrido Plug-in (Gasolina + Elétrico)" / "Híbrido (Gasolina + Elétrico)".
// Replicado de vianta-dashboard src/lib/operacoes/combustivel.ts — manter iguais.
const norm = (v) => String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function descricaoCombustivel(c) {
  const base = String(c.combustivel || '').trim();
  if (!norm(base).includes('hibrid')) return base;
  const partes = [c.combustivel_principal, c.combustivel_secundario].map((x) => String(x || '').trim()).filter(Boolean);
  const nome = partes.some((p) => norm(p).includes('eletric')) && c.plug_in === true ? 'Híbrido Plug-in' : 'Híbrido';
  return partes.length ? `${nome} (${partes.join(' + ')})` : nome;
}

// Os registos mais recentes da Central têm a marca em `marca` e só o modelo em
// `marca_modelo` ("Peugeot" + "5008"); os antigos têm tudo em `marca_modelo`.
// Junta a marca quando o modelo ainda não a traz.
function nomeCompleto(c) {
  let modelo = String(c.marca_modelo || '').trim();
  const marca = String(c.marca || '').trim();
  if (/^[a-z]/.test(modelo)) modelo = modelo[0].toUpperCase() + modelo.slice(1);
  if (!marca) return modelo;
  if (modelo.toLowerCase().startsWith(marca.toLowerCase())) return modelo;
  return `${marca} ${modelo}`.trim();
}

function mapCarro(c) {
  const nome = nomeCompleto(c);
  const versao = !vazio(c.versao) && !nome.toLowerCase().includes(String(c.versao).trim().toLowerCase())
    ? String(c.versao).trim()
    : '';
  const fin = [
    ['120 meses', c.credito_120_meses],
    ['60 meses', c.credito_60_meses],
    ['48 meses', c.credito_48_meses],
  ]
    .filter(([, x]) => !vazio(x))
    .map(([prazo, x]) => ({ prazo, prestacao: eur(x) }));
  const fotos = Array.isArray(c.fotos) ? c.fotos.filter(Boolean) : [];
  const foto = c.foto_url || fotos[0] || '';
  return {
    dbId: c.id,
    tipo: c.tipo_gestao,
    name: nome,
    versao,
    preco: eur(c.preco_venda),
    aluguerSemanal: eur(c.valor_aluguer_semanal),
    caucao: num(c.caucao),
    ano: vazio(c.ano) ? '' : String(c.ano),
    km: kmTxt(c.kms_atuais),
    combustivel: descricaoCombustivel(c),
    autonomia: num(c.autonomia_km) == null ? '—' : `${num(c.autonomia_km)} km`,
    cavalos: num(c.cavalos) == null ? '' : `${num(c.cavalos)} cv`,
    caixa: c.caixa || '',
    bateria: num(c.bateria_kwh) == null ? '' : `${num(c.bateria_kwh)}kwh`,
    // Saúde da bateria (SOH) certificada, ex. "95.19" → "95%". Vazio se não houver teste.
    estadoBateria: num(c.estado_bateria_pct) == null ? '' : `${Math.round(num(c.estado_bateria_pct))}%`,
    bagageira: num(c.volume_bagageira) == null ? '' : `${num(c.volume_bagageira)}L`,
    categorias: c.categorias_tvde || '',
    estado: c.estado || '',
    cor: c.cor || '',
    foto,
    fotosReais: fotos,
    financiamentos: fin,
  };
}

exports.handler = async () => {
  try {
    const resp = await fetch(CENTRAL_URL);
    if (!resp.ok) throw new Error(`Central HTTP ${resp.status}`);
    const dados = await resp.json();
    const lista = Array.isArray(dados) ? dados : dados.data || [];
    const carros = lista
      .filter((c) => c.tipo_gestao === 'Venda' || c.tipo_gestao === 'Aluguer')
      .map(mapCarro)
      .filter((c) => c.name);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(carros),
    };
  } catch (e) {
    return { statusCode: 502, body: 'Erro a ler carros: ' + e.message };
  }
};
