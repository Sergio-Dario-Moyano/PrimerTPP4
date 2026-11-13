-- =====================================================================
-- Migración 002 — Nuevos requerimientos (mail "RPP final")
--   1. Propuestas de películas
--   2. Roles configurables por sección del admin
--   3. Lista de espera para funciones agotadas (+ notificaciones push)
--   4. Cancelación ATÓMICA de funciones por parte del cine
-- Correr UNA vez en el SQL Editor, después de la 001.
-- Solo AGREGA cosas: no borra datos ni cambia el RLS de las tablas existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0) Perfiles: email visible para el admin (para asignar roles)
-- ---------------------------------------------------------------------
alter table perfiles add column if not exists email text;

update perfiles p set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- El trigger de registro ahora también guarda el email
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
as $function$
begin
  insert into public.perfiles (
    id, email, nombre, apellido, fecha_nacimiento,
    tipo_sangre, color_ojos, dias_vacaciones, rol
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'nombre', 'Empleado'),
    coalesce(new.raw_user_meta_data->>'apellido', ''),
    coalesce(nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date, '2000-01-01'::date),
    coalesce(new.raw_user_meta_data->>'tipo_sangre', 'N/A'),
    coalesce(new.raw_user_meta_data->>'color_ojos', 'N/A'),
    coalesce((new.raw_user_meta_data->>'dias_vacaciones')::int, 0),
    coalesce(new.raw_user_meta_data->>'rol', 'cliente')
  );
  return new;
end;
$function$;


-- ---------------------------------------------------------------------
-- 1) Roles configurables
--    permisos = claves de las secciones del admin:
--    peliculas, funciones, candy, cupones, fidelizacion, reportes, log,
--    propuestas, validar_sala, validar_candy
--    (la sección "roles" queda reservada al rol base 'admin')
-- ---------------------------------------------------------------------
create table if not exists roles (
  id uuid primary key default uuid_generate_v4(),
  nombre varchar not null unique,
  descripcion text,
  permisos text[] not null default '{}',
  creado_en timestamp default now()
);

alter table perfiles add column if not exists rol_id uuid references roles(id) on delete set null;

-- Rol de ejemplo pedido en el mail
insert into roles (nombre, descripcion, permisos)
values ('Analista de reportes', 'Solo puede ver la sección de reportes', array['reportes'])
on conflict (nombre) do nothing;


-- ---------------------------------------------------------------------
-- 2) Propuestas de películas (una pendiente por cliente)
-- ---------------------------------------------------------------------
create table if not exists propuestas (
  id uuid primary key default uuid_generate_v4(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  titulo varchar not null,
  descripcion text not null,
  motivo text not null,
  estado varchar not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada')),
  respuesta text,
  pelicula_id uuid references peliculas(id) on delete set null,
  revisado_por uuid references perfiles(id) on delete set null,
  revisado_en timestamp,
  creado_en timestamp default now()
);

-- "Cada cliente puede hacer UNA propuesta a la vez"
create unique index if not exists propuestas_una_pendiente
  on propuestas (perfil_id) where estado = 'pendiente';


-- ---------------------------------------------------------------------
-- 3) Notificaciones (campanita + push)
-- ---------------------------------------------------------------------
create table if not exists notificaciones (
  id uuid primary key default uuid_generate_v4(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  tipo varchar not null,
  titulo text not null,
  mensaje text not null,
  link text,
  leida boolean not null default false,
  creado_en timestamp default now()
);
create index if not exists notificaciones_perfil_idx on notificaciones (perfil_id, leida);

-- Suscripciones Web Push de cada dispositivo del usuario
create table if not exists push_suscripciones (
  id uuid primary key default uuid_generate_v4(),
  perfil_id uuid not null references perfiles(id) on delete cascade,
  endpoint text not null unique,
  suscripcion jsonb not null,
  creado_en timestamp default now()
);


-- ---------------------------------------------------------------------
-- 4) Funciones: estado (activa / cancelada)
-- ---------------------------------------------------------------------
alter table funciones add column if not exists estado varchar not null default 'activa';
alter table funciones add column if not exists motivo_cancelacion text;
alter table funciones add column if not exists cancelada_en timestamp;

do $$ begin
  alter table funciones add constraint funciones_estado_check check (estado in ('activa', 'cancelada'));
exception when duplicate_object then null;
end $$;


-- ---------------------------------------------------------------------
-- 5) Lista de espera
--    esperando → notificado (un turno a la vez, 2 min configurables) → compro | vencido
--    salio = el usuario se bajó · cancelada = la función se canceló
-- ---------------------------------------------------------------------
create table if not exists lista_espera (
  id uuid primary key default uuid_generate_v4(),
  funcion_id uuid not null references funciones(id) on delete cascade,
  perfil_id uuid not null references perfiles(id) on delete cascade,
  estado varchar not null default 'esperando'
    check (estado in ('esperando', 'notificado', 'compro', 'vencido', 'salio', 'cancelada')),
  creado_en timestamp default now(),
  notificado_en timestamp,
  vence_en timestamp
);

-- Un usuario no puede estar dos veces activo en la misma lista
create unique index if not exists lista_espera_activa
  on lista_espera (funcion_id, perfil_id) where estado in ('esperando', 'notificado');


-- ---------------------------------------------------------------------
-- 6) Créditos pendientes: compras ANÓNIMAS de funciones canceladas.
--    Se acreditan cuando alguien inicia sesión con ese email.
-- ---------------------------------------------------------------------
create table if not exists creditos_pendientes (
  id uuid primary key default uuid_generate_v4(),
  email text not null,
  monto numeric not null,
  compra_id uuid references compras(id) on delete set null,
  motivo text,
  reclamado boolean not null default false,
  reclamado_por uuid references perfiles(id) on delete set null,
  creado_en timestamp default now()
);


-- ---------------------------------------------------------------------
-- 7) Realtime para notificaciones y lista de espera
-- ---------------------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table notificaciones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table lista_espera; exception when duplicate_object then null; end;
end $$;


-- =====================================================================
-- FUNCIONES (RPC)
-- =====================================================================

-- Hora "actual" en el mismo formato que funciones.fecha_hora (hora local, sin zona)
create or replace function public.ahora_local()
returns timestamp language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires');
$$;


-- Butacas libres de una función (la fila K es solo separación visual)
create or replace function public.butacas_libres(p_funcion uuid)
returns integer language sql stable as $$
  select (
    (select count(*) from butacas b
       join funciones f on f.sala_id = b.sala_id
      where f.id = p_funcion
        and coalesce(b.tipo, 'estandar') <> 'vacia'
        and b.fila <> 'K')
    -
    (select count(*) from entradas e
      where e.funcion_id = p_funcion and e.estado <> 'cancelada')
  )::int;
$$;


-- Avanza las listas de espera:
--   1) vence los avisos con más de 15 minutos
--   2) por cada butaca libre (que no esté reservada para alguien avisado),
--      avisa al siguiente de la lista y le da 15 minutos
-- Se llama al cancelar una compra, al abrir el mapa de butacas y cada minuto con pg_cron.
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


-- Pago con puntos (migración 005): la cancelación también devuelve lo pagado con puntos
alter table compras add column if not exists puntos_usados integer not null default 0;
alter table compras add column if not exists monto_puntos numeric not null default 0;

-- Cancelación de una función por parte del cine. ATÓMICA: todo el cuerpo corre
-- en una sola transacción; si algo falla se lanza una excepción y no queda nada a medias.
create or replace function public.cancelar_funcion(p_funcion uuid, p_motivo text)
returns json
language plpgsql
security definer
as $$
declare
  v_func record;
  v_compra record;
  v_monto numeric;
  v_compras int := 0;
  v_anonimas int := 0;
  v_total numeric := 0;
begin
  -- Bloqueamos la función para que nadie compre mientras se cancela
  select f.*, p.titulo, s.nombre as sala_nombre
    into v_func
    from funciones f
    join peliculas p on p.id = f.pelicula_id
    join salas s on s.id = f.sala_id
   where f.id = p_funcion
   for update of f;

  if not found then
    raise exception 'La función no existe.';
  end if;
  if v_func.estado = 'cancelada' then
    raise exception 'La función ya estaba cancelada.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Indicá el motivo de la cancelación.';
  end if;

  for v_compra in
    select c.*
      from compras c
     where c.estado = 'completada'
       and c.id in (select e.compra_id from entradas e
                     where e.funcion_id = p_funcion and e.estado <> 'cancelada')
     for update
  loop
    -- Monto total de la compra, incluido el candy (lo pagado + el crédito y los puntos que usó)
    v_monto := coalesce(v_compra.total_pagado, 0) + coalesce(v_compra.credito_usado, 0)
             + coalesce(v_compra.monto_puntos, 0);

    if v_compra.perfil_id is not null then
      update perfiles
         set credito_favor = coalesce(credito_favor, 0) + v_monto,
             puntos_fidelizacion = greatest(0, coalesce(puntos_fidelizacion, 0) - coalesce(v_compra.puntos_ganados, 0))
       where id = v_compra.perfil_id;

      insert into notificaciones (perfil_id, tipo, titulo, mensaje, link)
      values (v_compra.perfil_id, 'funcion_cancelada', 'Función cancelada',
              format('La función de "%s" del %s fue cancelada (%s). Te acreditamos $%s: elegí otra función y pagala con tu crédito.',
                     v_func.titulo, to_char(v_func.fecha_hora, 'DD/MM HH24:MI'), p_motivo,
                     to_char(v_monto, 'FM999G999G990')),
              '/pelicula/' || v_func.pelicula_id || '?reubicar=1');
    else
      -- Compra anónima: el crédito queda guardado para ese email
      insert into creditos_pendientes (email, monto, compra_id, motivo)
      values (v_compra.email_contacto, v_monto, v_compra.id,
              format('Cancelación de "%s" del %s', v_func.titulo, to_char(v_func.fecha_hora, 'DD/MM HH24:MI')));
      v_anonimas := v_anonimas + 1;
    end if;

    -- Se liberan las butacas y se anula el candy no retirado
    update entradas set estado = 'cancelada' where compra_id = v_compra.id;
    update detalle_candy set estado = 'cancelado' where compra_id = v_compra.id and estado = 'pendiente';
    update compras set estado = 'cancelada' where id = v_compra.id;

    v_compras := v_compras + 1;
    v_total := v_total + v_monto;
  end loop;

  -- La lista de espera de esa función se cierra y se avisa a quienes esperaban
  insert into notificaciones (perfil_id, tipo, titulo, mensaje, link)
  select le.perfil_id, 'funcion_cancelada', 'Función cancelada',
         format('La función de "%s" del %s en la que estabas en lista de espera fue cancelada.',
                v_func.titulo, to_char(v_func.fecha_hora, 'DD/MM HH24:MI')),
         '/pelicula/' || v_func.pelicula_id
    from lista_espera le
   where le.funcion_id = p_funcion and le.estado in ('esperando', 'notificado');

  update lista_espera set estado = 'cancelada'
   where funcion_id = p_funcion and estado in ('esperando', 'notificado');

  update funciones
     set estado = 'cancelada', motivo_cancelacion = p_motivo, cancelada_en = now()
   where id = p_funcion;

  insert into logs_actividad (perfil_id, accion, entidad_afectada, entidad_id, detalle)
  values (auth.uid(), 'CANCELAR_FUNCION', 'funciones', p_funcion,
          format('Se canceló "%s" (%s, %s). Motivo: %s. %s compra(s), $%s acreditados.',
                 v_func.titulo, v_func.sala_nombre, to_char(v_func.fecha_hora, 'DD/MM HH24:MI'),
                 p_motivo, v_compras, to_char(v_total, 'FM999G999G990')));

  return json_build_object('compras', v_compras, 'anonimas', v_anonimas, 'total', v_total);
end;
$$;


-- Acredita al usuario logueado los créditos pendientes de compras anónimas hechas con su email
create or replace function public.reclamar_creditos()
returns numeric
language plpgsql
security definer
as $$
declare
  v_email text;
  v_total numeric;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  select coalesce(sum(monto), 0) into v_total
    from creditos_pendientes
   where lower(email) = lower(v_email) and not reclamado;

  if v_total > 0 then
    update creditos_pendientes
       set reclamado = true, reclamado_por = auth.uid()
     where lower(email) = lower(v_email) and not reclamado;

    update perfiles set credito_favor = coalesce(credito_favor, 0) + v_total where id = auth.uid();

    insert into notificaciones (perfil_id, tipo, titulo, mensaje, link)
    values (auth.uid(), 'credito', 'Crédito acreditado',
            format('Te acreditamos $%s por funciones canceladas que habías comprado sin cuenta.',
                   to_char(v_total, 'FM999G999G990')),
            '/perfil/puntos');
  end if;

  return v_total;
end;
$$;


-- ---------------------------------------------------------------------
-- 8) (Opcional) pg_cron: procesa las listas de espera cada minuto, para que
--    los turnos de 15 minutos venzan aunque nadie tenga la app abierta.
--    Requiere activar la extensión "pg_cron" en Database → Extensions.
--    Si no está activada, este bloque no hace nada (la app igual procesa
--    las listas cuando alguien abre el mapa de butacas o su perfil).
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('procesar-listas-espera')
      where exists (select 1 from cron.job where jobname = 'procesar-listas-espera');
    perform cron.schedule('procesar-listas-espera', '* * * * *', 'select public.procesar_listas_espera()');
  end if;
end $$;
