const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { db, describeConBD, ADMIN, reiniciarBD, crearUsuarioConToken } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Autenticación', () => {
  beforeAll(reiniciarBD);

  describe('POST /api/auth/login', () => {
    it('con credenciales válidas devuelve un JWT con el rol y el usuario sin hash', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: ADMIN.password });

      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ email: ADMIN.email, rol: 'ADMIN', activo: true });
      expect(res.body.usuario).not.toHaveProperty('password_hash');
      const payload = jwt.decode(res.body.token);
      expect(payload).toMatchObject({ sub: String(res.body.usuario.id), rol: 'ADMIN', nombre: ADMIN.nombre });
      expect(payload.exp - payload.iat).toBe(8 * 60 * 60);
    });

    it('el correo no distingue mayúsculas ni espacios', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: `  ${ADMIN.email.toUpperCase()} `, password: ADMIN.password });
      expect(res.status).toBe(200);
    });

    it('contraseña incorrecta y correo inexistente dan el mismo 401', async () => {
      const malaClave = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'incorrecta' });
      const sinCuenta = await request(app).post('/api/auth/login').send({ email: 'nadie@pruebas.local', password: 'incorrecta' });

      expect(malaClave.status).toBe(401);
      expect(sinCuenta.status).toBe(401);
      expect(malaClave.body.error).toBe(sinCuenta.body.error);
    });

    it('una cuenta desactivada no puede iniciar sesión', async () => {
      const { usuario } = await crearUsuarioConToken('VENTAS');
      const hash = await require('../src/modules/usuarios/usuarios.service').hashearPassword('clave-ventas-1');
      await db.query('UPDATE usuarios SET password_hash = $2, activo = false WHERE id = $1', [usuario.id, hash]);

      const res = await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'clave-ventas-1' });
      expect(res.status).toBe(403);
    });

    it('sin datos responde 400 con el detalle por campo', async () => {
      const res = await request(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
      expect(res.body.detalles.map((d) => d.campo)).toEqual(expect.arrayContaining(['email', 'password']));
    });
  });

  describe('GET /api/auth/me', () => {
    it('sin token responde 401', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('con un token mal firmado responde 401', async () => {
      const falso = jwt.sign({ rol: 'ADMIN' }, 'otro-secreto-cualquiera-de-32-caracteres!!', { subject: '1' });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${falso}`);
      expect(res.status).toBe(401);
    });

    it('con un token expirado responde 401', async () => {
      const vencido = jwt.sign({ rol: 'ADMIN', exp: Math.floor(Date.now() / 1000) - 60 }, process.env.JWT_SECRET, { subject: '1' });
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${vencido}`);
      expect(res.status).toBe(401);
    });

    it('con un token válido de un usuario ya desactivado responde 401', async () => {
      const { usuario, token } = await crearUsuarioConToken('TALLER');
      await db.query('UPDATE usuarios SET activo = false WHERE id = $1', [usuario.id]);

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });

    it('con un token válido devuelve el perfil', async () => {
      const { usuario, token } = await crearUsuarioConToken('TALLER');
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.usuario).toMatchObject({ id: usuario.id, rol: 'TALLER' });
    });
  });

  it('tras 10 intentos fallidos bloquea el login con 429', async () => {
    // Los intentos fallidos de las pruebas anteriores también cuentan: basta con agotar el cupo.
    let res;
    for (let i = 0; i < 11; i += 1) {
      res = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'incorrecta' });
      if (res.status === 429) break;
    }
    expect(res.status).toBe(429);
  });
});
