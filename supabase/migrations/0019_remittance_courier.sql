-- 0019_remittance_courier.sql
-- Rol "mensajero" para remesas: lleva el dinero al beneficiario. Ve solo las
-- remesas que tiene asignadas y puede marcarlas entregada / no entregada.
-- Idempotente. Aplicar después de 0018.

-- Nuevo rol.
insert into public.roles (id, name, description) values
  ('mensajero', 'Mensajero', 'Entrega remesas asignadas al beneficiario')
on conflict (id) do nothing;

-- Mensajero asignado a cada operación de remesa.
alter table public.remittance_operations
  add column if not exists assigned_to uuid references public.app_users(id) on delete set null;

create index if not exists remittance_operations_assigned_idx
  on public.remittance_operations(assigned_to);
