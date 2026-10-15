import { configureStore } from "@reduxjs/toolkit";

import { AppError, DEFAULT_ERROR_MESSAGE, ValidationError } from "@/core/errors";
import { registerErrorSink, type ErrorReport } from "@/core/logger";
import { selectIsAnyLoading, selectIsLoading, selectLoading } from "@/store/loadingSelectors";
import { LoadingStates } from "@/store/loadingSlice";
import {
  createNotifyOnRejected,
  type RejectionNotice,
} from "@/store/middleware/notifyOnRejected";
import { reducers } from "@/store/reducers";
import { createAsyncThunkWithErrorHandling } from "@/store/utils/createAsyncThunkWithErrorHandling";
import { rejectionFieldErrors, rejectionMessage } from "@/store/utils/thunkResult";

function setup(moduleTitles: Record<string, string> = {}) {
  const notices: RejectionNotice[] = [];
  const store = configureStore({
    reducer: reducers,
    middleware: (getDefault) =>
      getDefault().concat(
        createNotifyOnRejected({ moduleTitles, notify: (notice) => notices.push(notice) }),
      ),
  });
  return { store, notices };
}

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("loadingSlice + selectores", () => {
  it("sigue el ciclo de vida de cada thunk por su typePrefix", async () => {
    const gate = deferred<string>();
    const fetchOrders = createAsyncThunkWithErrorHandling("orders/fetch", () => gate.promise);
    const fetchUsers = createAsyncThunkWithErrorHandling("users/fetch", async () => "ok");
    const { store } = setup();

    expect(selectLoading(fetchOrders)(store.getState())).toBe(LoadingStates.IDLE);

    const pending = store.dispatch(fetchOrders());
    expect(selectIsLoading(fetchOrders)(store.getState())).toBe(true);
    expect(selectIsLoading(fetchUsers)(store.getState())).toBe(false);
    expect(selectIsAnyLoading(fetchUsers, fetchOrders)(store.getState())).toBe(true);

    gate.resolve("listo");
    await pending;
    expect(selectLoading(fetchOrders)(store.getState())).toBe(LoadingStates.SUCCEEDED);
  });
});

describe("createAsyncThunkWithErrorHandling", () => {
  it("rechaza con mensaje seguro y reporta el detalle técnico", async () => {
    const reports: ErrorReport[] = [];
    const unregister = registerErrorSink((report) => {
      reports.push(report);
    });
    const thunk = createAsyncThunkWithErrorHandling("orders/create", async () => {
      throw new TypeError("cannot read properties of undefined (reading 'id')");
    });
    const { store } = setup();

    const action = await store.dispatch(thunk());
    unregister();

    expect(action.meta.requestStatus).toBe("rejected");
    expect(action.payload).toMatchObject({ message: DEFAULT_ERROR_MESSAGE });
    expect(reports[0]).toMatchObject({ context: "orders/create", name: "TypeError" });
    expect(selectLoading(thunk)(store.getState())).toBe(LoadingStates.FAILED);
  });

  it("propaga código y errores por campo de un ValidationError", async () => {
    const thunk = createAsyncThunkWithErrorHandling("users/create", async () => {
      throw new ValidationError("Revisa el formulario", {
        code: "EMAIL_TAKEN",
        fieldErrors: { email: "Ya está registrado" },
      });
    });
    const { store } = setup();

    const error = await store.dispatch(thunk()).unwrap().catch((e: unknown) => e);

    expect(rejectionMessage(error)).toBe("Revisa el formulario");
    expect(rejectionFieldErrors(error)).toEqual({ email: "Ya está registrado" });
    expect(error).toMatchObject({ code: "EMAIL_TAKEN" });
  });
});

describe("notifyOnRejected", () => {
  it("avisa una vez con el título del módulo y el mensaje seguro", async () => {
    const thunk = createAsyncThunkWithErrorHandling("orders/create", async () => {
      throw new AppError("El pedido ya está cerrado.");
    });
    const { store, notices } = setup({ orders: "Pedidos" });

    await store.dispatch(thunk());

    expect(notices).toEqual([
      { title: "Pedidos", message: "El pedido ya está cerrado.", source: "orders/create" },
    ]);
  });

  it("no avisa en thunks silenciosos, cancelados o cortados por condition", async () => {
    const silent = createAsyncThunkWithErrorHandling(
      "sync/pull",
      async () => {
        throw new AppError("Sin red");
      },
      { silent: true },
    );
    const gate = deferred<void>();
    const slow = createAsyncThunkWithErrorHandling("orders/slow", () => gate.promise);
    const { store, notices } = setup();

    await store.dispatch(silent());
    const running = store.dispatch(slow());
    running.abort();
    await running;

    expect(notices).toEqual([]);
  });

  it("no muestra rechazos que no pasaron por el wrapper (texto técnico)", () => {
    const { store, notices } = setup();
    store.dispatch({
      type: "legacy/thing/rejected",
      payload: undefined,
      error: { message: "ECONNREFUSED 10.0.0.3" },
      meta: { requestId: "1", requestStatus: "rejected", aborted: false, condition: false },
    });
    expect(notices).toEqual([]);
  });
});

it("rejectionMessage no confía en un SerializedError", () => {
  expect(rejectionMessage({ message: "Cannot read properties of null" })).toBe(
    DEFAULT_ERROR_MESSAGE,
  );
});
