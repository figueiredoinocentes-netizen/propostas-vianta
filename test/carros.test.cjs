const test = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/carros.js');

async function mapOne(car) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [{
      id: 'test-id',
      tipo_gestao: 'Venda',
      estado: 'Para Venda',
      marca_modelo: 'Modelo de teste',
      ...car,
    }],
  });
  try {
    const result = await handler();
    assert.equal(result.statusCode, 200);
    return JSON.parse(result.body)[0];
  } finally {
    global.fetch = originalFetch;
  }
}

test('proposal fuel shows the two fuels and Plug-in status when true', async () => {
  const car = await mapOne({
    combustivel: 'Híbrido',
    combustivel_principal: 'Gasolina',
    combustivel_secundario: 'Elétrico',
    plug_in: true,
  });
  assert.equal(car.combustivel, 'Híbrido Plug-in (Gasolina + Elétrico)');
});

test('proposal fuel shows the two fuels and explicitly says non Plug-in when false', async () => {
  const car = await mapOne({
    combustivel: 'Híbrido',
    combustivel_principal: 'Gasóleo/Diesel',
    combustivel_secundario: 'Gasolina',
    plug_in: false,
  });
  assert.equal(car.combustivel, 'Híbrido não Plug-in (Gasóleo/Diesel + Gasolina)');
});

test('legacy hybrid without the new fields remains readable', async () => {
  const car = await mapOne({ combustivel: 'Híbrido' });
  assert.equal(car.combustivel, 'Híbrido');
});

test('non-hybrid fuel labels remain unchanged', async () => {
  const car = await mapOne({ combustivel: 'Gasóleo/Diesel' });
  assert.equal(car.combustivel, 'Gasóleo/Diesel');
});
