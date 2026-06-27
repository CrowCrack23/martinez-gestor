-- 0054_roles_centro_gerente.sql
-- Dos roles nuevos para el control de acceso por negocio:
--   - 'centro'  : operador del centro de elaboración. Solo recetas, producción,
--                 inventario, movimientos, contabilidad y cuadres — y, por su
--                 asignación de negocio (user_businesses = 'centro'), solo del
--                 centro.
--   - 'gerente' : administrador de la mipyme. Acceso operativo a mipyme + centro
--                 (sin usuarios, sin remesas, sin asistente IA). Su alcance lo da
--                 user_businesses = {'mipyme','centro'}.
--
-- Los permisos por módulo viven en lib/permissions.ts (ROLE_PERMISSIONS); aquí
-- solo se da de alta el rol para que user_roles pueda referenciarlo.
-- Idempotente. Aplicar después de 0053.

insert into public.roles (id, name, description) values
  ('centro',  'Operador del centro', 'Recetas, producción, inventario, movimientos, contabilidad y cuadres del centro de elaboración'),
  ('gerente', 'Gerente de la mipyme', 'Acceso operativo a la mipyme y el centro (sin usuarios ni remesas)')
on conflict (id) do nothing;
