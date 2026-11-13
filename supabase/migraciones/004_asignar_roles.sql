-- =====================================================================
-- 004 · Asignación de roles desde Admin → Roles y Permisos
-- Ejecutar en Supabase → SQL Editor (después del 002). Se puede volver a ejecutar.
--
-- Problema: Angular hacía update directo sobre "perfiles". Las políticas RLS
-- solo dejan que cada usuario modifique su propio perfil, así que el update
-- sobre otro usuario no fallaba pero tampoco cambiaba nada (0 filas). La app
-- mostraba "Permisos actualizados" y al recargar el rol volvía atrás.
--
-- Solución: una función que corre con permisos de dueño (security definer),
-- pero que primero verifica que quien la llama sea administrador.
-- =====================================================================


-- Mismo criterio que PermisosService (también está en el 003; se repite
-- para que este archivo funcione aunque el 003 no se haya ejecutado).
create or replace function public.tiene_permiso(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from perfiles p
      left join roles r on r.id = p.rol_id
     where p.id = auth.uid()
       and (p.rol = 'admin' or p_clave = any (coalesce(r.permisos, '{}')))
  );
$$;

revoke execute on function public.tiene_permiso(text) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated;


-- ---------------------------------------------------------------------
-- 1) Asignar rol base y rol configurable a un usuario
-- ---------------------------------------------------------------------
create or replace function public.asignar_rol(p_usuario uuid, p_rol text, p_rol_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil perfiles%rowtype;
begin
  -- La sección Roles es solo para administradores
  if not public.tiene_permiso('roles') then
    raise exception 'Solo un administrador puede asignar roles.' using errcode = '42501';
  end if;

  if p_rol not in ('cliente', 'empleado_cine', 'empleado_candy', 'admin') then
    raise exception 'Rol base inválido: %', p_rol using errcode = '22023';
  end if;

  if p_usuario = auth.uid() and p_rol <> 'admin' then
    raise exception 'No podés quitarte a vos mismo el rol de administrador.' using errcode = '42501';
  end if;

  if p_rol_id is not null and not exists (select 1 from roles where id = p_rol_id) then
    raise exception 'El rol configurable elegido ya no existe.' using errcode = '22023';
  end if;

  -- Habilita el cambio de rol solo dentro de esta transacción (ver trigger más abajo)
  perform set_config('cine.asignar_rol', 'si', true);

  update perfiles
     set rol = p_rol, rol_id = p_rol_id
   where id = p_usuario
  returning * into v_perfil;

  if not found then
    raise exception 'No se encontró el usuario.' using errcode = 'P0002';
  end if;

  return json_build_object('id', v_perfil.id, 'rol', v_perfil.rol, 'rol_id', v_perfil.rol_id);
end;
$$;

revoke execute on function public.asignar_rol(uuid, text, uuid) from public, anon;
grant execute on function public.asignar_rol(uuid, text, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 2) Nadie puede cambiarse el rol por su cuenta
--
--    Como cada usuario sí puede modificar su propio perfil (puntos, crédito),
--    sin esto podría ponerse rol = 'admin' llamando a la API de Supabase.
--    El trigger solo deja cambiar rol / rol_id desde asignar_rol().
--    Desde el SQL Editor de Supabase (sin usuario logueado) se sigue pudiendo.
-- ---------------------------------------------------------------------
create or replace function public.proteger_rol_perfil()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.rol is distinct from old.rol or new.rol_id is distinct from old.rol_id)
     and coalesce(current_setting('cine.asignar_rol', true), '') <> 'si'
     and auth.uid() is not null then
    raise exception 'El rol solo se puede cambiar desde Admin → Roles y Permisos.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_rol on perfiles;
create trigger perfiles_proteger_rol
  before update of rol, rol_id on perfiles
  for each row execute function public.proteger_rol_perfil();
