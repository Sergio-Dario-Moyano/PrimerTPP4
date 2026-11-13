-- =====================================================================
-- 007 · Lista de espera: nadie le gana el lugar al que tiene el turno
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 006. Se puede volver a ejecutar.
--
-- Problema: la pantalla de butacas decidía quién podía comprar mirando la
-- tabla lista_espera desde el navegador. Si no veía el turno del #1 (turno sin
-- procesar, vencido justo en ese momento, o filas de otros usuarios ocultas),
-- el #2 —o cualquiera— podía elegir y comprar las butacas liberadas.
--
-- Ahora:
--   1) estado_lista_espera(): el estado de la lista lo calcula la BD (ve todas
--      las filas) y solo devuelve lo necesario, sin datos de otros usuarios.
--   2) Trigger en entradas: mientras una función tenga gente en la lista de
--      espera, SOLO puede comprar quien tiene el turno vigente. El #2 compra
--      recién cuando el turno pasa a él (si quedan butacas).
-- =====================================================================


-- 1) Estado de la lista de una función, visto por el usuario logueado
create or replace function public.estado_lista_espera(p_funcion uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_yo uuid := auth.uid();
  v_turno record;
  v_mia record;
  v_en_espera int;
  v_posicion int;
begin
  -- Turno vigente (uno solo por función desde la 006)
  select perfil_id, vence_en into v_turno
    from lista_espera
   where funcion_id = p_funcion and estado = 'notificado' and vence_en >= now()
   order by creado_en
   limit 1;

  select count(*) into v_en_espera
    from lista_espera
   where funcion_id = p_funcion
     and (estado = 'esperando' or (estado = 'notificado' and vence_en >= now()));

  if v_yo is not null then
    select id, estado, vence_en, creado_en into v_mia
      from lista_espera
     where funcion_id = p_funcion and perfil_id = v_yo
       and (estado = 'esperando' or (estado = 'notificado' and vence_en >= now()))
     limit 1;

    if found and v_mia.estado = 'esperando' then
      select count(*) into v_posicion
        from lista_espera
       where funcion_id = p_funcion and estado = 'esperando' and creado_en <= v_mia.creado_en;
    end if;
  end if;

  return json_build_object(
    'turno_de_otro', v_turno.perfil_id is not null and v_turno.perfil_id is distinct from v_yo,
    'turno_vence',   v_turno.vence_en,
    'en_espera',     v_en_espera,
    'mi_lugar', case when v_mia.id is null then null else json_build_object(
                  'id', v_mia.id, 'estado', v_mia.estado, 'vence_en', v_mia.vence_en,
                  'posicion', coalesce(v_posicion, 0)) end
  );
end;
$$;

grant execute on function public.estado_lista_espera(uuid) to anon, authenticated;


-- 2) Control al vender: con lista de espera activa, solo compra quien tiene el turno
create or replace function public.validar_turno_lista_espera()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comprador uuid;
begin
  -- ¿La función tiene gente en la lista de espera?
  if not exists (select 1 from lista_espera
                  where funcion_id = new.funcion_id
                    and (estado = 'esperando' or (estado = 'notificado' and vence_en >= now()))) then
    return new;
  end if;

  select perfil_id into v_comprador from compras where id = new.compra_id;

  -- Solo pasa quien tiene el turno vigente
  if v_comprador is not null and exists (select 1 from lista_espera
                                          where funcion_id = new.funcion_id
                                            and perfil_id = v_comprador
                                            and estado = 'notificado'
                                            and vence_en >= now()) then
    return new;
  end if;

  raise exception 'LISTA_ESPERA: Las butacas liberadas son para quien tiene el turno de la lista de espera.'
    using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_validar_turno_lista_espera on entradas;
create trigger trg_validar_turno_lista_espera
  before insert on entradas
  for each row execute function public.validar_turno_lista_espera();
