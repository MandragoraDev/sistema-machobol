const request = require('supertest');
const app = require('../src/app');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Usuarios (solo Admin)', () => {
  let admin;

  beforeAll(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
  });

  it.each(['TALLER', 'VENTAS'])('un usuario %s recibe 403', async (rol) => {
    const { token } = await crearUsuarioConToken(rol);
    const res = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('sin sesión responde 401', async () => {
    const res = await request(app).get('/api/usuarios');
    expect(res.status).toBe(401);
  });

  it('el Admin crea un usuario: guarda el hash bcrypt y nunca lo devuelve', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'Rosa Taller', email: 'Rosa@MachoBol.local', password: 'clave-taller-1', rol: 'TALLER' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: 'rosa@machobol.local', rol: 'TALLER', activo: true });
    expect(res.body).not.toHaveProperty('password_hash');
    const { rows: [fila] } = await db.query('SELECT password_hash FROM usuarios WHERE id = $1', [res.body.id]);
    expect(fila.password_hash).toMatch(/^\$2b\$12\$/);

    const listado = await request(app).get('/api/usuarios').set('Authorization', `Bearer ${admin}`);
    expect(listado.body.every((u) => !('password_hash' in u))).toBe(true);
  });

  it('un correo repetido responde 409', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'Otra Rosa', email: 'rosa@machobol.local', password: 'clave-taller-2', rol: 'VENTAS' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/correo/);
  });

  it('valida rol y contraseña', async () => {
    const res = await request(app)
      .post('/api/usuarios')
      .set('Authorization', `Bearer ${admin}`)
      .send({ nombre: 'X Y', email: 'xy@pruebas.local', password: 'corta', rol: 'GERENTE' });
    expect(res.status).toBe(400);
    expect(res.body.detalles.map((d) => d.campo)).toEqual(expect.arrayContaining(['password', 'rol']));
  });

  it('cambiar la contraseña permite iniciar sesión con la nueva', async () => {
    const { usuario } = await crearUsuarioConToken('VENTAS');
    const cambio = await request(app)
      .patch(`/api/usuarios/${usuario.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ password: 'nueva-clave-99' });
    expect(cambio.status).toBe(200);

    const login = await request(app).post('/api/auth/login').send({ email: usuario.email, password: 'nueva-clave-99' });
    expect(login.status).toBe(200);
  });

  it('el Admin no puede desactivarse ni quitarse el rol a sí mismo', async () => {
    const { rows: [yo] } = await db.query("SELECT id FROM usuarios WHERE rol = 'ADMIN' LIMIT 1");
    for (const cambios of [{ activo: false }, { rol: 'VENTAS' }]) {
      const res = await request(app).patch(`/api/usuarios/${yo.id}`).set('Authorization', `Bearer ${admin}`).send(cambios);
      expect(res.status).toBe(409);
    }
  });

  it('desactivar a un usuario corta su sesión de inmediato', async () => {
    const { usuario, token } = await crearUsuarioConToken('TALLER');
    await request(app).patch(`/api/usuarios/${usuario.id}`).set('Authorization', `Bearer ${admin}`).send({ activo: false });

    const res = await request(app).get('/api/inventario').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});
