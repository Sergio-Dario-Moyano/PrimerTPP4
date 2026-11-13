-- =====================================================================
-- 006 · Lista de espera: un turno a la vez y tiempo configurable
-- Ejecutar en Supabase → SQL Editor. Se puede volver a ejecutar.
--
-- Problema: cuando se liberaban butacas, se avisaba a una persona POR CADA
-- butaca libre al mismo tiempo (el #1 y el #2 con el mismo reloj). Además,
-- si dos pantallas procesaban la lista a la vez, cada una avisaba a alguien.
--
-- Ahora: por cada función hay UN solo turno vigente. El primero de la lista
-- tiene N minutos (configuración 'minutos_turno_espera', por defecto 2) para
-- comprar las butacas liberadas. Si compra, rechaza ("No la quiero") o se le
-- vence el tiempo, el turno pasa al siguiente, y así sucesivamente.
-- =====================================================================


-- 1) Valor por defecto de la duración del turno (si todavía no existe)
insert into configuracion (clave, valor)
select 'minutos_turno_espera', '2'
 where not exists (select 1 from configuracion where clave = 'minutos_turno_espera');


-- 2) Arreglo de datos: si hoy hay varias personas con turno en la misma función,
--    se deja solo al primero de la lista y el resto vuelve a esperar.
with ordenados as (
  select id, row_number() over (partition by funcion_id order by creado_en) as n
    from lista_espera
   where estado = 'notificado'
)
update lista_espera le
   set estado = 'esperando', notificado_en = null, vence_en = null
  from ordenados o
 where le.id = o.id and o.n > 1;


-- 3) Procesar listas: de a un turno por función
create or replace function public.procesar_listas_espera(p_funcion uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_func record;
  v_sig record;
  v_avisados int := 0;
  v_minutos numeric;
begin
  -- Minutos de cada turno: configurables desde el admin (por defecto, 2)
  select coalesce(max(nullif(regexp_replace(valor::text, '[^0-9.]', '', 'g'), '')::numeric), 2)
    into v_minutos
    from configuracion
   where clave = 'minutos_turno_espera';
  if v_minutos is null or v_minutos <= 0 then v_minutos := 2; end if;

  -- 1) Vencer turnos pasados y avisar a quien lo perdió
  with vencidos as (
    update lista_espera
       set estado = 'vencido'
     where estado = 'notificado'
       and vence_en < now()
       and (p_funcion is null or funcion_id = p_funcion)
    returning perfil_id, funcion_id
  )
  insert into notificaciones (perfil_id, tipo, titulo, mensaje, link)
  select v.perfil_id, 'lista_espera', 'Se venció tu turno',
         format('Se terminó tu tiempo para comprar "%s". El turno pasó al siguiente de la lista.', p.titulo),
         '/perfil/espera'
    from vencidos v
    join funciones f on f.id = v.funcion_id
    join peliculas p on p.id = f.pelicula_id;

  -- 2) De a UN turno por función: solo se avisa al siguiente si nadie tiene un turno vigente
  for v_func in
    select distinct le.funcion_id as id, p.titulo, f.fecha_hora
      from lista_espera le
      join funciones f on f.id = le.funcion_id
      join peliculas p on p.id = f.pelicula_id
     where le.estado = 'esperando'
       and f.estado = 'activa'
       and f.fecha_hora > public.ahora_local()
       and (p_funcion is null or le.funcion_id = p_funcion)
  loop
    -- Si dos pantallas procesan la misma lista a la vez, la segunda espera a la primera
    -- (antes cada una podía avisar a una persona distinta)
    perform pg_advisory_xact_lock(hashtext('lista-espera-' || v_func.id::text));

    continue when exists (select 1 from lista_espera
                           where funcion_id = v_func.id and estado = 'notificado' and vence_en >= now());
    continue when public.butacas_libres(v_func.id) <= 0;

    select * into v_sig
      from lista_espera
     where funcion_id = v_func.id and estado = 'esperando'
     order by creado_en
     limit 1
     for update;
    continue when not found;

    update lista_espera
       set estado = 'notificado', notificado_en = now(),
           vence_en = now() + make_interval(secs => (v_minutos * 60)::int)
     where id = v_sig.id;

    insert into notificaciones (perfil_id, tipo, titulo, mensaje, link)
    values (v_sig.perfil_id, 'lista_espera', '¡Es tu turno!',
            format('Se liberaron butacas para "%s" (%s). Tenés %s minuto(s) para comprar; después el turno pasa al siguiente de la lista.',
                   v_func.titulo, to_char(v_func.fecha_hora, 'DD/MM HH24:MI'), trim(to_char(v_minutos, 'FM990.##'))),
            '/perfil/espera');

    v_avisados := v_avisados + 1;
  end loop;

  return v_avisados;
end;
$$;

grant execute on function public.procesar_listas_espera(uuid) to anon, authenticated;
