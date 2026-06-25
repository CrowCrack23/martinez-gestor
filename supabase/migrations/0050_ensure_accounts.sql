-- 0050_ensure_accounts.sql
-- Red de seguridad del PLAN DE CUENTAS: garantiza que TODAS las cuentas que usa
-- el código (lib/auto-accounting.ts, lib/capital.ts, lib/partners.ts) existan,
-- sin importar qué migraciones previas se aplicaron. Resuelve errores tipo
-- "Faltan cuentas 1500/1120 en el plan de cuentas" al registrar inversiones,
-- aportes, ventas, etc.
--
-- Reúne las cuentas sembradas en 0011, 0025, 0031, 0033, 0037, 0040 y 0048.
-- Idempotente: insert ... on conflict (code) do nothing.

-- La columna de moneda nativa de la cuenta (1120 lleva números en USD); se
-- crea por si 0037 no se aplicó.
alter table public.accounts
  add column if not exists currency text not null default 'CUP';

insert into public.accounts (code, name, type) values
  ('1100', 'Caja y bancos',                   'activo'),
  ('1110', 'Caja CUP',                        'activo'),
  ('1120', 'Caja USD',                        'activo'),
  ('1130', 'Banco',                           'activo'),
  ('1200', 'Cuentas por cobrar',              'activo'),
  ('1300', 'Inventario',                      'activo'),
  ('1500', 'Infraestructura',                 'activo'),
  ('2100', 'Cuentas por pagar',               'pasivo'),
  ('2200', 'Impuestos por pagar',             'pasivo'),
  ('2300', 'Salarios por pagar',              'pasivo'),
  ('3100', 'Capital social',                  'patrimonio'),
  ('3300', 'Retiros de socios',               'patrimonio'),
  ('4100', 'Ventas online',                   'ingreso'),
  ('4200', 'Ventas tienda',                   'ingreso'),
  ('4300', 'Comisiones remesas',              'ingreso'),
  ('4310', 'Diferencia de tasas',             'ingreso'),
  ('4900', 'Otros ingresos',                  'ingreso'),
  ('5000', 'Gastos',                          'gasto'),
  ('5100', 'Costo de ventas',                 'gasto'),
  ('5200', 'Salarios',                        'gasto'),
  ('5250', 'Comisiones de venta',             'gasto'),
  ('5260', 'Pago a mensajeros',               'gasto'),
  ('5300', 'Servicios',                       'gasto'),
  ('5310', 'Diferencia de tasa de inventario','gasto'),
  ('5320', 'Pérdida por merma',               'gasto'),
  ('5400', 'Otros gastos',                    'gasto')
on conflict (code) do nothing;

-- 1120 Caja USD guarda números nativos en dólares.
update public.accounts set currency = 'USD' where code = '1120' and currency <> 'USD';
