import type { BotLabLocale } from './i18n';
import type { WorkspaceDocument } from './workspace-storage';

export const workbenchCopy = {
  es: {
    projects: 'Proyectos',
    current: 'Abierto',
    close: 'Cerrar',
    local:
      'Guardados en este navegador. Exporta una copia para llevarlos a otro equipo.',
    newProject: 'Nuevo proyecto',
    project: 'Proyecto',
    name: 'Nombre del proyecto',
    open: 'Abrir proyecto',
    rename: 'Guardar nombre',
    duplicate: 'Duplicar',
    copy: 'copia',
    remove: 'Eliminar',
    confirmRemove: 'Eliminar definitivamente',
    cancel: 'Cancelar',
    removeHint: 'Se eliminará este proyecto y sus programas de este navegador.',
    lastProject: 'Conserva al menos un proyecto.',
    import: 'Importar proyecto',
    export: 'Exportar proyecto',
    importHint:
      'La importación crea un proyecto nuevo y conserva los existentes.',
    busy: 'Detén la ejecución antes de cambiar o gestionar proyectos.',
    limit: 'Límite de 50 proyectos. Exporta y elimina alguno para añadir otro.',
    program: 'Programa',
    separate: 'Cada robot y modo conserva su programa dentro de este proyecto.',
    advanced: 'Opciones avanzadas',
    mode: 'Modo de Jumper',
    walking: 'Marcha',
    joints: 'Prueba de articulaciones',
    jointHint:
      'Cuerpo fijado para probar articulaciones. Este modo no comprueba el equilibrio.',
    walkingHint: 'Robot libre sobre el suelo con control de equilibrio.',
    hardware: 'Robot físico',
    browser: 'Simulador web clásico',
    native: 'Simulador nativo',
  },
  ca: {
    projects: 'Projectes',
    current: 'Obert',
    close: 'Tanca',
    local:
      'Desats en aquest navegador. Exporta una còpia per portar-los a un altre equip.',
    newProject: 'Nou projecte',
    project: 'Projecte',
    name: 'Nom del projecte',
    open: 'Obre el projecte',
    rename: 'Desa el nom',
    duplicate: 'Duplica',
    copy: 'còpia',
    remove: 'Elimina',
    confirmRemove: 'Elimina definitivament',
    cancel: 'Cancel·la',
    removeHint:
      "S'eliminarà aquest projecte i els seus programes d'aquest navegador.",
    lastProject: 'Conserva almenys un projecte.',
    import: 'Importa un projecte',
    export: 'Exporta el projecte',
    importHint: 'La importació crea un projecte nou i conserva els existents.',
    busy: "Atura l'execució abans de canviar o gestionar projectes.",
    limit:
      "Límit de 50 projectes. Exporta i elimina'n algun per afegir-ne un altre.",
    program: 'Programa',
    separate:
      'Cada robot i mode conserva el seu programa dins aquest projecte.',
    advanced: 'Opcions avançades',
    mode: 'Mode de Jumper',
    walking: 'Marxa',
    joints: "Prova d'articulacions",
    jointHint:
      "Cos fixat per provar articulacions. Aquest mode no comprova l'equilibri.",
    walkingHint: "Robot lliure sobre el terra amb control d'equilibri.",
    hardware: 'Robot físic',
    browser: 'Simulador web clàssic',
    native: 'Simulador natiu',
  },
  en: {
    projects: 'Projects',
    current: 'Open',
    close: 'Close',
    local:
      'Saved in this browser. Export a copy to use them on another computer.',
    newProject: 'New project',
    project: 'Project',
    name: 'Project name',
    open: 'Open project',
    rename: 'Save name',
    duplicate: 'Duplicate',
    copy: 'copy',
    remove: 'Delete',
    confirmRemove: 'Delete permanently',
    cancel: 'Cancel',
    removeHint:
      'This project and its programs will be removed from this browser.',
    lastProject: 'Keep at least one project.',
    import: 'Import project',
    export: 'Export project',
    importHint: 'Importing creates a new project and keeps existing projects.',
    busy: 'Stop execution before switching or managing projects.',
    limit: 'Limit of 50 projects. Export and delete one to add another.',
    program: 'Program',
    separate: 'Each robot and mode keeps its own program within this project.',
    advanced: 'Advanced options',
    mode: 'Jumper mode',
    walking: 'Walking',
    joints: 'Joint test',
    jointHint:
      'Fixed body for testing joints. This mode does not test balance.',
    walkingHint: 'Free robot on the ground with balance control.',
    hardware: 'Physical robot',
    browser: 'Classic web simulator',
    native: 'Native simulator',
  },
} satisfies Record<BotLabLocale, Record<string, string>>;

export function workspaceDescription(
  document: WorkspaceDocument,
  locale: BotLabLocale,
) {
  const copy = workbenchCopy[locale];
  switch (document.targetId) {
    case 'jumper-web-walking':
      return `Jumper · ${copy.walking}`;
    case 'jumper-web-joint-probe':
      return `Jumper · ${copy.joints}`;
    case 'microduck-mujoco-web':
      return 'MicroDuck · MuJoCo web';
    case 'microduck-sim':
      return `MicroDuck · ${document.simulatorBackend === 'native' ? copy.native : copy.browser}`;
    case 'microduck-usb':
      return `MicroDuck · ${copy.hardware}`;
    default:
      return `StackChan · ${copy.hardware}`;
  }
}
