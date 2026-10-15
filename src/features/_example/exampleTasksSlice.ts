import { createSlice } from "@reduxjs/toolkit";

import { completeTask, createTask, fetchTasks, removeTask, reopenTask } from "./actions/task.actions";
import type { Task } from "./domain/task";

/**
 * El estado del feature. Solo datos: NO guarda `status`/`loading`/`error`
 * (eso vive en `store/loadingSlice` y se lee con `selectIsLoading(thunk)`), y
 * los reducers no muestran UI.
 *
 * `extraReducers` siempre en forma `builder`.
 */
interface ExampleTasksState {
  items: Task[];
}

const initialState: ExampleTasksState = { items: [] };

const upsert = (items: Task[], task: Task) => items.map((item) => (item.id === task.id ? task : item));

const exampleTasksSlice = createSlice({
  name: "exampleTasks",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchTasks.fulfilled, (state, { payload }) => {
        state.items = payload;
      })
      .addCase(createTask.fulfilled, (state, { payload }) => {
        state.items.push(payload);
      })
      .addCase(completeTask.fulfilled, (state, { payload }) => {
        state.items = upsert(state.items, payload);
      })
      .addCase(reopenTask.fulfilled, (state, { payload }) => {
        state.items = upsert(state.items, payload);
      })
      .addCase(removeTask.fulfilled, (state, { payload: id }) => {
        state.items = state.items.filter((task) => task.id !== id);
      });
  },
});

export default exampleTasksSlice.reducer;

// Los thunks se reexportan desde el slice: es la API pública del feature.
export { completeTask, createTask, fetchTasks, removeTask, reopenTask };
