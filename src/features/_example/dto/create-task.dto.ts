/**
 * dto/: solo lo que el caller DECIDE al crear. Lo que se calcula (id, fecha,
 * estado inicial) lo pone el service o el servidor, no se expone aquí.
 */
export interface CreateTaskDto {
  title: string;
}
