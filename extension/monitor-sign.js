// Compare shared manual status, never the document's native electronic signature.
globalThis.seiSignAlerts = {
  update(record, organizer, items, eligible) {
    if (
      !organizer ||
      !Number.isSafeInteger(organizer.version) ||
      organizer.version < 0 ||
      !organizer.statuses ||
      typeof organizer.statuses !== 'object' ||
      !Array.isArray(organizer.history)
    )
      throw new Error('Situação de assinatura não reconhecida.');
    if (
      organizer.history.some(
        (h) => !Number.isSafeInteger(h.id) || !Number.isSafeInteger(h.version) || h.version > organizer.version,
      )
    )
      throw new Error('Histórico e status mudaram durante a consulta.');
    if (Math.max(0, ...organizer.history.map((h) => h.version)) !== organizer.version)
      throw new Error('Histórico e status mudaram durante a consulta.');
    if (record.signVersion !== undefined && organizer.version < record.signVersion)
      throw new Error('Consulta de assinatura desatualizada.');
    const present = new Map(items.map((item) => [item.id, item]));
    const current = items.filter((item) => organizer.statuses[item.id] === 'sign').map((item) => item.id);
    const previous = new Set(record.signKnown || []);
    const observed = new Set(record.signObserved || []);
    const cursor = Math.max(0, ...organizer.history.map((h) => h.id));
    const ready = record.signVersion !== undefined;
    const changed = new Set(ready ? current.filter((id) => observed.has(id) && !previous.has(id)) : []);
    if (ready)
      for (const h of organizer.history) {
        if (h.id <= (record.signCursor || 0)) continue;
        const action = h.action;
        const entering = action?.type === 'status' && action.status === 'sign';
        if (entering)
          for (const id of action.processIds || [])
            if (
              (action.previousStatuses?.[id] || action.previousStatus) !== 'sign' &&
              present.has(id) &&
              organizer.statuses[id] === 'sign'
            )
              changed.add(id);
      }
    const pending = new Map(
      (eligible ? record.signPending || [] : [])
        .filter((p) => present.has(p.id) && organizer.statuses[p.id] === 'sign')
        .map((p) => [p.id, p]),
    );
    const arrived = eligible ? [...changed].map((id) => ({ id, number: present.get(id).number })) : [];
    for (const item of arrived) pending.set(item.id, item);
    record.signPending = [...pending.values()];
    record.signKnown = current;
    record.signObserved = items.map((item) => item.id);
    record.signCursor = Math.max(record.signCursor || 0, cursor);
    record.signVersion = organizer.version;
    record.signError = '';
    return arrived;
  },
};
