jest.mock('../src/config/db', () => ({ query: jest.fn() }));

const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');

describe('GET /api/health', () => {
  it('responde ok cuando la base de datos responde', async () => {
    db.query.mockResolvedValueOnce({ rows: [{}] });

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'ok' });
  });

  it('responde 503 cuando la base de datos no está disponible', async () => {
    db.query.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

    const res = await request(app).get('/api/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'error', db: 'error' });
  });
});

describe('Rutas desconocidas', () => {
  it('responden 404 en JSON', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Ruta no encontrada/);
  });

  it('un JSON mal formado responde 400, no 500', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"mal": ');

    expect(res.status).toBe(400);
  });
});
