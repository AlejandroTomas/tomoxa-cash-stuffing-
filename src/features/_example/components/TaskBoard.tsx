"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/core/toast";
import { useAppDispatch, useAppSelector } from "@/hooks/useReduxHooks";
import { selectIsAnyLoading, selectIsLoading } from "@/store/loadingSelectors";
import { rejectionFieldErrors } from "@/store/utils/thunkResult";
import { completeTask, createTask, fetchTasks, removeTask, reopenTask } from "../exampleTasksSlice";
import { selectTaskSummary, selectTasks } from "../selector";

/**
 * components/: JSX, hooks, dispatch y selectores. Nada de `http`, `fetch` ni
 * reglas de negocio. Los errores ya los muestra el middleware; aquí solo se
 * decide lo propio de la pantalla (pintar el error del campo, limpiar el input).
 */
export function TaskBoard() {
  const dispatch = useAppDispatch();
  const tasks = useAppSelector(selectTasks);
  const summary = useAppSelector(selectTaskSummary);
  const isLoading = useAppSelector(selectIsLoading(fetchTasks));
  const isSaving = useAppSelector(selectIsAnyLoading(createTask, completeTask, reopenTask, removeTask));
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string>();

  useEffect(() => {
    void dispatch(fetchTasks());
  }, [dispatch]);

  const handleCreate = async () => {
    setTitleError(undefined);
    try {
      await dispatch(createTask({ title })).unwrap();
      setTitle("");
      toast.success("Tarea agregada.");
    } catch (rejection) {
      // El mensaje general ya salió en el panel de alertas; aquí solo el del campo.
      setTitleError(rejectionFieldErrors(rejection).title);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tareas</CardTitle>
        <CardDescription className="tabular-nums">
          {summary.done} de {summary.total} completadas · {summary.progress}%
        </CardDescription>
        <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={summary.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary transition-[width]" style={{ width: `${summary.progress}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="space-y-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="flex gap-2">
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Nueva tarea…"
              aria-invalid={Boolean(titleError)}
              aria-describedby={titleError ? "task-title-error" : undefined}
            />
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
            </Button>
          </div>
          {titleError && (
            <p id="task-title-error" className="text-sm text-destructive">
              {titleError}
            </p>
          )}
        </form>

        {isLoading && tasks.length === 0 ? (
          <div className="space-y-2">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-10 w-full" />
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Sin tareas.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  checked={task.done}
                  aria-label={`Completar "${task.title}"`}
                  onCheckedChange={() => void dispatch(task.done ? reopenTask(task) : completeTask(task))}
                />
                <span className={task.done ? "flex-1 text-muted-foreground line-through" : "flex-1"}>{task.title}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Borrar "${task.title}"`}
                  onClick={() => void dispatch(removeTask(task))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
