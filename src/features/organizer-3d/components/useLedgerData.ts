"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { archiveEnvelope, cancelMovement, loadLedger, recordMovement, saveEnvelope } from "@/features/ledger/ledgerSlice";
import { selectAccounts, selectActiveEnvelopes, selectBalances, selectBudgets, selectEnvelopes, selectLedgerLoaded, selectMovements } from "@/features/ledger/selector";
import { checkMovement, type MovementDraft } from "@/features/ledger/domain/validation";
import type { Envelope, Movement } from "@/features/ledger/domain/types";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { toLocalIsoDate } from "@/utils/localDate";
import { documentsFromLedger, summarizeActivity } from "../domain/document";
import { toneFor, type EnvelopeStyle } from "../domain/envelopeStyle";
import { toEnvelopeItem, type EnvelopeId, type EnvelopeItem } from "../domain/envelopeView";

/**
 * El libro (feature `ledger`) visto por el organizador: sobres activos con su
 * saldo, documentos de cada sobre y las acciones que se guardan en el
 * dispositivo. La escena 3D nunca escribe aquí: solo recibe estos datos.
 */
export function useLedgerData() {
  const dispatch = useAppDispatch();
  const loaded = useAppSelector(selectLedgerLoaded);
  const activeEnvelopes = useAppSelector(selectActiveEnvelopes);
  const allEnvelopes = useAppSelector(selectEnvelopes);
  const accounts = useAppSelector(selectAccounts);
  const movements = useAppSelector(selectMovements);
  const balances = useAppSelector(selectBalances);
  const [today] = useState(() => toLocalIsoDate(new Date()));
  /** Presupuesto de cada sobre que lo tiene, en el periodo de hoy. */
  const budgets = useAppSelector((state) => selectBudgets(state, today));

  useEffect(() => {
    if (!loaded) void dispatch(loadLedger());
  }, [dispatch, loaded]);

  const envelopes: EnvelopeItem[] = useMemo(
    () => activeEnvelopes.map((envelope) => toEnvelopeItem(envelope, balances.envelopes[envelope.id] ?? 0)),
    [activeEnvelopes, balances],
  );

  /** Saldo (centavos) de cada sobre activo. */
  const balanceOf = useCallback((id: EnvelopeId) => balances.envelopes[id] ?? 0, [balances]);

  const documentsFor = useCallback((id: EnvelopeId) => documentsFromLedger(id, movements, balances.reversed), [movements, balances]);
  const activityFor = useCallback((id: EnvelopeId) => summarizeActivity(documentsFor(id)), [documentsFor]);

  /** Valida un movimiento con las mismas reglas que el servicio (antes de animar). */
  const checkDraft = useCallback((draft: MovementDraft) => checkMovement(draft, { accounts, envelopes: allEnvelopes, movements }), [accounts, allEnvelopes, movements]);

  const record = useCallback((draft: MovementDraft) => dispatch(recordMovement(draft)).unwrap(), [dispatch]);

  /** Cómo se vería el sobre con un estilo (vista previa), sin guardarlo. */
  const withStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle): EnvelopeItem | null => {
      const item = envelopes.find((envelope) => envelope.id === id);
      return item ? { ...item, ...style, tone: toneFor(style.color) } : null;
    },
    [envelopes],
  );

  const saveStyle = useCallback(
    (id: EnvelopeId, style: EnvelopeStyle) => {
      const envelope = allEnvelopes.find((existing) => existing.id === id);
      if (!envelope) return Promise.reject(new Error(`Sobre desconocido: ${id}`));
      return dispatch(saveEnvelope({ ...envelope, ...style })).unwrap();
    },
    [allEnvelopes, dispatch],
  );

  const createEnvelope = useCallback(
    (style: EnvelopeStyle): Promise<Envelope> => dispatch(saveEnvelope({ id: crypto.randomUUID(), ...style, order: 0, archived: false })).unwrap(),
    [dispatch],
  );

  const archive = useCallback((id: EnvelopeId) => dispatch(archiveEnvelope(id)).unwrap(), [dispatch]);

  /** Cancela un movimiento (registra su inverso con fecha de hoy) y devuelve el original. */
  const cancel = useCallback(
    async (movementId: string): Promise<Movement | undefined> => {
      const original = movements.find((movement) => movement.id === movementId);
      await dispatch(cancelMovement({ movementId, date: toLocalIsoDate(new Date()) })).unwrap();
      return original;
    },
    [dispatch, movements],
  );

  return { loaded, envelopes, budgets, balanceOf, documentsFor, activityFor, checkDraft, record, withStyle, saveStyle, createEnvelope, archive, cancel };
}
