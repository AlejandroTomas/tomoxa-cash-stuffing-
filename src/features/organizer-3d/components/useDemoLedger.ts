"use client";

import { useCallback, useMemo, useState } from "react";
import { sortByRecent, summarizeActivity, type EnvelopeDocument } from "../domain/document";
import { toneFor, type EnvelopeStyle } from "../domain/envelopeStyle";
import { toLocalIsoDate } from "../domain/localDate";
import { applyTransfer, transferDocuments, type Balances, type Transfer } from "../domain/transfer";
import { documentsOf } from "../mocks/documents.mock";
import { envelopesMock, type EnvelopeId, type EnvelopeItem } from "../mocks/envelopes.mock";

const initialBalances = (): Balances =>
  Object.fromEntries(envelopesMock.map((item) => [item.id, Math.round(item.amount * 100)])) as Balances;

/**
 * Estado de DEMOSTRACIÓN en memoria: saldos, ediciones y movimientos nuevos
 * parten del mock y se pierden al recargar. No es la capa de datos (fase 2):
 * solo permite que "Mover dinero" y "Editar" se vean funcionando.
 */
export function useDemoLedger() {
  const [balances, setBalances] = useState<Balances>(initialBalances);
  const [styles, setStyles] = useState<Partial<Record<EnvelopeId, EnvelopeStyle>>>({});
  const [added, setAdded] = useState<EnvelopeDocument[]>([]);

  const envelopes: EnvelopeItem[] = useMemo(
    () =>
      envelopesMock.map((item) => {
        const style = styles[item.id];
        return { ...item, ...style, tone: style ? toneFor(style.color) : item.tone, amount: balances[item.id] / 100 };
      }),
    [balances, styles],
  );

  const envelopeOf = useCallback((id: EnvelopeId) => envelopes.find((item) => item.id === id) ?? envelopes[0], [envelopes]);

  const documentsFor = useCallback(
    (id: EnvelopeId) => sortByRecent([...documentsOf(id), ...added.filter((doc) => doc.envelopeId === id)]),
    [added],
  );

  const activityFor = useCallback((id: EnvelopeId) => summarizeActivity(documentsFor(id)), [documentsFor]);

  /** Aplica una transferencia ya validada: saldos y un movimiento en cada sobre. */
  const recordTransfer = useCallback(
    (transfer: Transfer) => {
      const names = Object.fromEntries(envelopes.map((item) => [item.id, item.name])) as Record<EnvelopeId, string>;
      setBalances((current) => applyTransfer(current, transfer));
      setAdded((current) => [...current, ...transferDocuments(transfer, toLocalIsoDate(new Date()), names, `demo-${current.length}`)]);
    },
    [envelopes],
  );

  const saveStyle = useCallback((id: EnvelopeId, style: EnvelopeStyle) => setStyles((current) => ({ ...current, [id]: style })), []);

  /** Cómo se vería el sobre con un estilo (vista previa), sin guardarlo. */
  const withStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle): EnvelopeItem => ({ ...envelopeOf(id), ...style, tone: toneFor(style.color) }),
    [envelopeOf],
  );

  return { envelopes, balances, envelopeOf, documentsFor, activityFor, recordTransfer, saveStyle, withStyle };
}
