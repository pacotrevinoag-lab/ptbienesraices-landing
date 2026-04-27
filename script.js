const currencyMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const CITY_FACTORS = {
  Saltillo: { plusvalia: 1.12, precision: 0.86 },
  'Ramos Arizpe': { plusvalia: 1.08, precision: 0.82 },
  Arteaga: { plusvalia: 1.06, precision: 0.78 },
};

const TYPE_BASE_M2 = {
  casa: 17800,
  departamento: 22500,
  terreno: 6200,
  local: 24500,
  oficina: 23500,
  bodega: 11800,
  mixto: 19600,
};

const CONDITION_FACTOR = {
  excelente: 1.1,
  bueno: 1,
  regular: 0.89,
  'requiere-remodelacion': 0.76,
};

const LOCAL_ADDRESS_BOOK = [
  'Blvd. Venustiano Carranza 2450, Saltillo, Coahuila',
  'Blvd. Luis Donaldo Colosio 1200, Saltillo, Coahuila',
  'Periférico Luis Echeverría 350, Saltillo, Coahuila',
  'Carretera Los Pinos 150, Ramos Arizpe, Coahuila',
  'Blvd. Miguel Ramos Arizpe 2300, Ramos Arizpe, Coahuila',
  'Blvd. Fundadores 180, Arteaga, Coahuila',
];

const SIMULATED_SOURCES = ['Inmuebles24', 'Vivanuncios', 'Lamudi', 'Marketplace', 'API Comercial'];

const form = document.getElementById('estimator-form');
const results = document.getElementById('results');
const comparablesTbody = document.querySelector('#comparablesTable tbody');
const recommendationsList = document.getElementById('recommendations');
const auditLog = document.getElementById('auditLog');
const pdfButton = document.getElementById('btnPdf');
const addressInput = document.getElementById('address');
const addressSuggestions = document.getElementById('addressSuggestions');

let lastEstimate = null;
let autocompleteTimer = null;

function formatCurrency(amount) {
  return currencyMXN.format(Math.round(amount || 0));
}

function computeConfidence(city, comparablesCount, age, condition) {
  const cityPrecision = CITY_FACTORS[city]?.precision ?? 0.76;
  const agePenalty = Math.min(age * 0.002, 0.11);
  const conditionPenalty = condition === 'requiere-remodelacion' ? 0.05 : condition === 'regular' ? 0.03 : 0;
  const comparableBonus = Math.min(comparablesCount * 0.01, 0.06);
  const score = Math.max(0.55, Math.min(0.95, cityPrecision - agePenalty - conditionPenalty + comparableBonus));
  return Math.round(score * 100);
}

function buildComparables({ city, propertyType, buildArea, estimatedValue }) {
  const areaRef = Math.max(60, buildArea || 120);
  return SIMULATED_SOURCES.map((source, index) => {
    const area = Math.round(areaRef * (0.88 + index * 0.06));
    const randomBand = 0.91 + index * 0.035;
    const price = estimatedValue * randomBand;
    return {
      source,
      zone: city,
      type: propertyType,
      area,
      price,
      unitPrice: price / Math.max(area, 1),
    };
  });
}

function renderComparables(comparables) {
  comparablesTbody.innerHTML = '';
  comparables.forEach((item) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.source}</td>
      <td>${item.zone}</td>
      <td>${item.type}</td>
      <td>${item.area}</td>
      <td>${formatCurrency(item.price)}</td>
      <td>${formatCurrency(item.unitPrice)}</td>
    `;
    comparablesTbody.appendChild(tr);
  });
}

function buildRecommendations({ condition, age, parking, bedrooms, city }) {
  const list = [];
  if (condition !== 'excelente') list.push('Invertir en mantenimiento visual y acabados puede incrementar la absorción de mercado.');
  if (age > 20) list.push('Actualizar instalaciones eléctricas/hidrosanitarias mejora percepción de riesgo y valor.');
  if (parking < 2) list.push('Agregar o habilitar cajones de estacionamiento mejora comparabilidad en zonas urbanas.');
  if (bedrooms < 2) list.push('Reconfigurar distribución para ganar funcionalidad suele elevar el ticket en venta.');
  list.push(`Publicar estratégicamente en portales + marketplace con pricing dinámico para ${city}.`);
  return list.slice(0, 5);
}

function appendOptions(options) {
  addressSuggestions.innerHTML = '';
  options.slice(0, 7).forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    addressSuggestions.appendChild(option);
  });
}

function localAddressFilter(query) {
  if (!query) return LOCAL_ADDRESS_BOOK;
  return LOCAL_ADDRESS_BOOK.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
}

async function remoteAddressLookup(query) {
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=mx&limit=5&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, {
    headers: { 'Accept-Language': 'es' },
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.map((item) => item.display_name);
}

addressInput.addEventListener('input', () => {
  clearTimeout(autocompleteTimer);
  autocompleteTimer = setTimeout(async () => {
    const query = addressInput.value.trim();
    const localResults = localAddressFilter(query);

    if (query.length < 4) {
      appendOptions(localResults);
      return;
    }

    try {
      const remote = await remoteAddressLookup(query);
      const merged = Array.from(new Set([...localResults, ...remote]));
      appendOptions(merged);
    } catch {
      appendOptions(localResults);
    }
  }, 260);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const city = data.get('city');
  const propertyType = data.get('propertyType');
  const landArea = Number(data.get('landArea'));
  const buildArea = Number(data.get('buildArea'));
  const bedrooms = Number(data.get('bedrooms'));
  const bathrooms = Number(data.get('bathrooms'));
  const parking = Number(data.get('parking'));
  const age = Number(data.get('age'));
  const condition = data.get('condition');

  const cityFactor = CITY_FACTORS[city]?.plusvalia ?? 1;
  const baseM2 = TYPE_BASE_M2[propertyType] ?? 15000;
  const conditionFactor = CONDITION_FACTOR[condition] ?? 1;

  const usableArea = propertyType === 'terreno' ? landArea : Math.max(buildArea, 1);
  const ageFactor = Math.max(0.72, 1 - age * 0.0065);
  const amenityFactor = 1 + Math.min((bedrooms * 0.006) + (bathrooms * 0.01) + (parking * 0.009), 0.12);

  const marketApproach = usableArea * baseM2 * cityFactor * conditionFactor * ageFactor * amenityFactor;
  const replacementApproach = ((landArea * baseM2 * 0.45) + (buildArea * baseM2 * 0.55)) * conditionFactor * ageFactor;
  const hybridValue = (marketApproach * 0.68) + (replacementApproach * 0.32);

  const comparables = buildComparables({ city, propertyType, buildArea, estimatedValue: hybridValue });
  const comparableAverage = comparables.reduce((acc, item) => acc + item.price, 0) / comparables.length;
  const finalEstimate = hybridValue * 0.7 + comparableAverage * 0.3;

  const rangeMin = finalEstimate * 0.92;
  const rangeMax = finalEstimate * 1.08;
  const quickSale = finalEstimate * 0.9;
  const optimal = finalEstimate * 1.06;
  const confidence = computeConfidence(city, comparables.length, age, condition);
  const recommendations = buildRecommendations({ condition, age, parking, bedrooms, city });

  document.getElementById('estimatedValue').textContent = formatCurrency(finalEstimate);
  document.getElementById('valueRange').textContent = `${formatCurrency(rangeMin)} — ${formatCurrency(rangeMax)}`;
  document.getElementById('confidence').textContent = `${confidence}%`;
  document.getElementById('quickSale').textContent = formatCurrency(quickSale);
  document.getElementById('optimalSale').textContent = formatCurrency(optimal);

  renderComparables(comparables);

  recommendationsList.innerHTML = recommendations.map((item) => `<li>${item}</li>`).join('');

  auditLog.textContent = [
    `Dirección: ${data.get('address')}`,
    `Ciudad: ${city}`,
    `Tipo: ${propertyType}`,
    `Base m²: ${formatCurrency(baseM2)}`,
    `Factor plusvalía (${city}): ${cityFactor.toFixed(2)}`,
    `Factor condición: ${conditionFactor.toFixed(2)}`,
    `Factor antigüedad: ${ageFactor.toFixed(2)}`,
    `Factor amenidades: ${amenityFactor.toFixed(2)}`,
    `Enfoque mercado: ${formatCurrency(marketApproach)}`,
    `Enfoque costo/reposición: ${formatCurrency(replacementApproach)}`,
    `Valor híbrido base: ${formatCurrency(hybridValue)}`,
    `Promedio comparables: ${formatCurrency(comparableAverage)}`,
    `Valor final estimado: ${formatCurrency(finalEstimate)}`,
    `Confianza estimada: ${confidence}%`,
    `Fecha: ${new Date().toLocaleString('es-MX')}`,
  ].join('\n');

  lastEstimate = {
    finalEstimate,
    rangeMin,
    rangeMax,
    quickSale,
    optimal,
    confidence,
    city,
    propertyType,
    address: data.get('address'),
    comparables,
    recommendations,
  };

  pdfButton.disabled = false;
  results.classList.remove('hidden');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

pdfButton.addEventListener('click', () => {
  if (!lastEstimate || !window.jspdf) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  let line = 14;

  const print = (text, gap = 8) => {
    doc.text(text, 14, line);
    line += gap;
  };

  doc.setFont('helvetica', 'bold');
  print('PT Bienes Raices - Reporte preliminar de valor');
  doc.setFont('helvetica', 'normal');
  print(`Direccion: ${lastEstimate.address}`);
  print(`Ciudad: ${lastEstimate.city} | Tipo: ${lastEstimate.propertyType}`);
  print(`Valor estimado: ${formatCurrency(lastEstimate.finalEstimate)}`);
  print(`Rango: ${formatCurrency(lastEstimate.rangeMin)} - ${formatCurrency(lastEstimate.rangeMax)}`);
  print(`Confianza: ${lastEstimate.confidence}%`);
  print(`Venta rapida: ${formatCurrency(lastEstimate.quickSale)} | Optimo: ${formatCurrency(lastEstimate.optimal)}`);

  line += 4;
  doc.setFont('helvetica', 'bold');
  print('Comparables simulados:');
  doc.setFont('helvetica', 'normal');

  lastEstimate.comparables.forEach((item) => {
    print(`${item.source} | ${item.zone} | ${item.area} m2 | ${formatCurrency(item.price)}`, 7);
  });

  line += 3;
  doc.setFont('helvetica', 'bold');
  print('Recomendaciones:');
  doc.setFont('helvetica', 'normal');
  lastEstimate.recommendations.forEach((item) => print(`- ${item}`, 7));

  line += 4;
  doc.setFontSize(9);
  print('Aviso: estimacion preliminar no vinculante. No sustituye avaluo certificado.', 6);

  doc.save(`reporte_estimacion_${Date.now()}.pdf`);
});

appendOptions(LOCAL_ADDRESS_BOOK);
