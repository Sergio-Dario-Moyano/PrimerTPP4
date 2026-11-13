-- =====================================================================
-- 005 · Pagar con puntos y con crédito a favor
-- Ejecutar en Supabase → SQL Editor. Se puede volver a ejecutar.
-- Funciona aunque el 003 todavía no se haya ejecutado (incluye lo necesario).
--
-- Antes: los puntos solo servían para canjes fijos (entrada gratis o productos
-- con costo en puntos) y el crédito solo se descontaba del total.
-- Ahora, en el checkout, el crédito y los puntos son medios de pago para
-- cualquier entrada o producto. Si no alcanzan, el resto se paga con tarjeta
-- o en efectivo. El valor de cada punto en pesos lo configura el admin
-- (clave 'valor_punto_pesos' de la tabla configuracion; si no existe, vale $1).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Cuántos puntos se usaron en cada compra y cuántos pesos cubrieron
-- ---------------------------------------------------------------------
alter table compras add column if not exists puntos_usados integer not null default 0;
alter table compras add column if not exists monto_puntos numeric not null default 0;


-- ---------------------------------------------------------------------
-- 2) Cancelación de una función por el cine: ahora también devuelve,
--    como crédito, lo que se había pagado con puntos.
--    Es la misma función del 002 con ese único cambio en v_monto.
-- ---------------------------------------------------------------------
create or replace function public.cancelar_funcion_interna(p_funcion uuid, p_motivo text)
returns json
language plpgsql
security definer
set search_path = public
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

revoke execute on function public.cancelar_funcion_interna(uuid, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) Envoltorio con control de permiso (igual que en el 003)
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
