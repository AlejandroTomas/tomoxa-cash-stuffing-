import type { OrganizerStyleId } from "../domain/organizerStyle";
import { CABINET_VIEW } from "./cabinet/cabinetLayout";
import { createCabinetModel } from "./cabinet/cabinetModel";
import type { OrganizerSceneApi } from "./contract";
import { FILES_VIEW } from "./files/filesLayout";
import { createFilesModel } from "./files/filesModel";
import { createOrganizerScene } from "./organizerScene";
import { createSlotScene } from "./slotScene";

/** La escena de cada estilo; todas cumplen el mismo contrato. Agregar un estilo = un modelo de ranuras más. */
export function createSceneFor(style: OrganizerStyleId, mount: HTMLElement): OrganizerSceneApi {
  switch (style) {
    case "cabinet":
      return createSlotScene(mount, CABINET_VIEW, createCabinetModel);
    case "files":
      return createSlotScene(mount, FILES_VIEW, createFilesModel);
    case "binder":
      return createOrganizerScene(mount);
  }
}
