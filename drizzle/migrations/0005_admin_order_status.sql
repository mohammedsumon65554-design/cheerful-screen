create or replace function public.admin_set_order_status(_order uuid, _status order_status, _delivered integer default null, _note text default null)
returns json language plpgsql security definer set search_path = public as $$
declare _o orders; _target numeric := 0; _delta numeric; _newbal numeric; _del integer;
begin
  select * into _o from orders where id=_order for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if _o.status in ('rejected','canceled') then raise exception 'ORDER_FINAL'; end if;
  if _o.status = 'partial' and _status <> 'partial' then raise exception 'ORDER_FINAL'; end if;
  _del := case when _status='completed' then _o.quantity when _status='partial' then _delivered when _status in ('rejected','canceled') then 0 else coalesce(_delivered,_o.delivered_qty) end;
  if _status='partial' and (_del is null or _del < 0 or _del >= _o.quantity) then raise exception 'BAD_DELIVERED'; end if;
  if _status='partial' then _target := round(_o.charge * (_o.quantity - _del) / _o.quantity, 2);
  elsif _status in ('rejected','canceled') then _target := _o.charge; end if;
  _delta := _target - _o.refunded;
  if _delta > 0 then
    update profiles set balance = balance + _delta where id=_o.user_id returning balance into _newbal;
    insert into wallet_ledger (user_id,amount,kind,ref,balance_after) values (_o.user_id,_delta,'refund',_o.order_code,_newbal);
  end if;
  update orders set status=_status, delivered_qty=_del, refunded=greatest(_o.refunded,_target),
    admin_note=coalesce(_note, admin_note), updated_at=now() where id=_o.id;
  return json_build_object('refunded', greatest(_delta,0), 'old_status', _o.status);
end $$;
revoke all on function public.admin_set_order_status(uuid,order_status,integer,text) from public, anon, authenticated;
grant execute on function public.admin_set_order_status(uuid,order_status,integer,text) to service_role;