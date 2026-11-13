-- =====================================================================
-- 003 · Seguridad de las RPC y control de superposición de funciones
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 002_nuevos_requerimientos.sql.
-- Se puede ejecutar más de una vez. Si alguna vez se vuelve a ejecutar
-- el 002, hay que volver a ejecutar este archivo.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) ¿El usuario de la sesión tiene permiso para una sección del panel?
--    Mismo criterio que PermisosService en Angular:
--    rol base 'admin' = todo; rol configurable = las secciones de roles.permisos.
-- ---------------------------------------------------------------------
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
-- 2) cancelar_funcion solo para quien tenga permiso sobre "funciones"
--
--    La función del 002 es SECURITY DEFINER (saltea RLS) y no controlaba
--    quién la llamaba: cualquiera con la clave pública de Supabase podía
--    ejecutarla. La renombramos a cancelar_funcion_interna, le quitamos el
--    acceso público y la envolvemos con una función que primero verifica
--    el permiso. Angular sigue llamando a rpc('cancelar_funcion', ...).
--    Todo sigue siendo una sola transacción: si algo falla, no se aplica nada.
-- ---------------------------------------------------------------------
do $$
begin
  -- Solo si cancelar_funcion es la versión completa del 002 (no el envoltorio de este archivo)
  if exists (select 1 from pg_proc
              where proname = 'cancelar_funcion' and pronamespace = 'public'::regnamespace
                and prosrc not like '%cancelar_funcion_interna%') then
    -- Si el 002 se volvió a ejecutar, su versión nueva reemplaza a la interna anterior
    drop function if exists public.cancelar_funcion_interna(uuid, text);
    alter function public.cancelar_funcion(uuid, text) rename to cancelar_funcion_interna;
  end if;
end $$;

revoke execute on function public.cancelar_funcion_interna(uuid, text) from public, anon, authenticated;

create or replace function public.cancelar_funcion(p_funcion uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tiene_permiso('funciones') then
    raise exception 'No tenés permiso para cancelar funciones.' using errcode = '42501';
  end if;
  return public.cancelar_funcion_interna(p_funcion, p_motivo);
end;
$$;

revoke execute on function public.cancelar_funcion(uuid, text) from public, anon;
grant execute on function public.cancelar_funcion(uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 3) Ninguna función puede superponerse con otra en la misma sala
--    (mail del 06/02: "bajo ningún término").
--
--    Angular ya elige una sala libre (FuncionesService.buscarSalaLibre),
--    pero esa verificación corre en el navegador: si dos administradores
--    programan a la vez, los dos podrían ver la misma sala libre.
--    Este trigger repite el control dentro de la base:
--      - pg_advisory_xact_lock hace que las altas en una misma sala
--        se procesen de a una (la segunda espera a que termine la primera);
--      - después busca superposiciones con el mismo criterio que Angular:
--        [inicio, inicio + duración + 30 min).
--    Si hay choque, la inserción falla y Angular la informa como rechazada.
-- ---------------------------------------------------------------------
create or replace function public.validar_superposicion_funcion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_duracion int;
  v_choque record;
begin
  if new.estado = 'cancelada' then
    return new; -- una función cancelada no ocupa la sala
  end if;

  perform pg_advisory_xact_lock(hashtext('funciones-sala-' || new.sala_id::text));

  select duracion_minutos into v_duracion from peliculas where id = new.pelicula_id;

  select f.fecha_hora, p.titulo
    into v_choque
    from funciones f
    join peliculas p on p.id = f.pelicula_id
   where f.sala_id = new.sala_id
     and f.estado <> 'cancelada'
     and f.id <> new.id
     and new.fecha_hora < f.fecha_hora + make_interval(mins => coalesce(p.duracion_minutos, 120) + 30)
     and f.fecha_hora < new.fecha_hora + make_interval(mins => coalesce(v_duracion, 120) + 30)
   limit 1;

  if found then
    raise exception 'La sala ya tiene una función de "%" a las % que se superpone con ese horario (se respetan 30 minutos entre funciones).',
      v_choque.titulo, to_char(v_choque.fecha_hora, 'DD/MM HH24:MI')
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists funciones_sin_superposicion on funciones;
create trigger funciones_sin_superposicion
  before insert or update of sala_id, fecha_hora, pelicula_id, estado on funciones
  for each row execute function public.validar_superposicion_funcion();
