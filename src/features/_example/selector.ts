import { createSelector } from "@reduxjs/toolkit";

import type { RootState } from "@/store";
import { summarizeTasks } from "./domain/task";

/** Lectores del store. Lo derivado se calcula con funciones de `domain/`, memoizado. */
export const selectTasks = (state: RootState) => state.exampleTasks.items;

export const selectTaskSummary = createSelector(selectTasks, summarizeTasks);
