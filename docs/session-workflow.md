# Continuidad entre sesiones de BotLab

El trabajo debe poder retomarse desde el repositorio sin releer el chat. El [registro de próximos pasos](next-steps.md) reúne el punto de reanudación, las tareas, las ideas y las decisiones que afectan a lo siguiente.

## Dónde guardar cada cosa

| Información                                                     | Lugar                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Prioridad actual, trabajo abierto, ideas y punto de reanudación | [next-steps.md](next-steps.md)                                                                   |
| Método de inicio, actualización y cierre                        | Este documento                                                                                   |
| Alcance, arquitectura y criterios de aceptación extensos        | [implementation-plan.md](implementation-plan.md) y planes específicos enlazados desde cada tarea |
| Decisiones arquitectónicas y su estado                          | [ADR](adr/README.md)                                                                             |
| Pruebas realizadas, resultados y límites                        | Informes de validación y `docs/evidence/`                                                        |

El orden actual se mantiene solo en `next-steps.md`. Los planes específicos enlazan a ese registro; conservan el detalle técnico y la historia. Ante una contradicción, comprobar fechas, código y evidencia y corregir el registro: una casilla antigua no demuestra el estado actual. La instrucción más reciente del usuario prevalece.

## Al iniciar o retomar una sesión

1. Leer `AGENTS.override.md`, el contexto de `AGENTS.md` si existe, este método y `docs/next-steps.md` antes de decidir el siguiente trabajo.
2. Revisar `git status --short` y los cambios relacionados. Preservar el trabajo existente, incluido el que esté sin commit o sin seguimiento.
3. Leer la tarea elegida y sus referencias. Comprobar sus dependencias y su estado real antes de repetir trabajo histórico.
4. Continuar la petición autorizada por el usuario. Cuando pida continuar sin más detalle, usar el punto de reanudación y la prioridad allí indicada. Registrar una idea o recomendarla no equivale a aprobar su implementación ni a autorizar acciones externas.
5. Actualizar el trabajo activo y el siguiente paso concreto. No dar por vivos servidores, sesiones del navegador o procesos de un chat anterior; conservar comandos de arranque, no depender de sus identificadores temporales.

## Durante el trabajo

- Registrar las ideas, compromisos, decisiones y bloqueos relevantes cuando aparezcan, también si quedan fuera del cambio actual. No esperar al resumen final o a que se agote el contexto.
- Buscar primero una entrada equivalente. Añadir contexto o enlaces a la misma tarea; conservar su identificador al cambiarla de sección y no reutilizarlo.
- Distinguir el origen: petición del usuario, propuesta del asistente, hallazgo medido o pendiente histórico por revisar. No convertir una propuesta en un compromiso ni descartar silenciosamente una idea.
- Escribir el resultado que se busca, por qué importa y qué permitirá cerrarlo. Añadir dependencia o bloqueo solo si existen. Mantener detalles extensos en el documento del área.
- Registrar las decisiones con fecha y motivo. Conservar las restricciones educativas, de compatibilidad y de alcance que evitarán volver a discutir lo ya acordado.
- Si cambia el alcance, actualizar la tarea y el punto de reanudación. Una interrupción se registra como trabajo parcial, con el último paso completado y el siguiente pendiente.

## Estados de las tareas

| Estado      | Significado                                                               |
| ----------- | ------------------------------------------------------------------------- |
| Idea        | Posibilidad conservada, aún sin priorizar ni comprometer                  |
| Propuesta   | Candidata concreta con alcance y criterio de cierre                       |
| Pendiente   | Trabajo acordado que aún no ha empezado                                   |
| En curso    | Trabajo autorizado iniciado, con punto de reanudación                     |
| Bloqueada   | Necesita una condición concreta; anotar qué la desbloquea                 |
| Aparcada    | Pospuesta de forma explícita; conservar el motivo y cuándo reconsiderarla |
| Por revisar | Referencia histórica cuyo estado actual debe contrastarse                 |
| Hecha       | Criterio de cierre satisfecho y evidencia o resultado enlazado            |
| Descartada  | Decisión explícita de no continuar, con motivo                            |

Formato mínimo para una entrada nueva:

```text
BL-NNN — Título orientado al resultado
Estado y origen/fecha:
Objetivo y motivo:
Próxima acción y criterio de cierre:
Dependencias o bloqueo, si existen:
Referencias y última actualización:
```

Las tablas del registro pueden condensar estos campos. Usar fecha ISO (`AAAA-MM-DD`); una nota de evidencia conserva la fecha en que se realizó la prueba. Al cerrar o descartar, mover la entrada a la sección correspondiente conservando su ID, fecha y resultado. El registro contiene una síntesis útil, no una transcripción de cada turno.

## Antes de terminar una sesión de trabajo

1. Actualizar las entradas afectadas y la fecha del registro; señalar qué se implementó y qué solo se propuso.
2. Dejar el punto de reanudación con trabajo activo o «ninguno», último resultado, comprobaciones relevantes, asuntos sin resolver y una próxima acción concreta.
3. Enlazar cambios o evidencia para lo terminado. No cerrar una tarea por haber escrito un plan o por pasar pruebas que no cubren su criterio de aceptación.
4. Comprobar que el orden de próximos pasos tenga una sola fuente, que los enlaces nuevos funcionen y que ninguna idea relevante quede únicamente en el chat.
5. Informar al usuario del resultado y, cuando haya cambiado, del siguiente paso. No hace falta modificar documentos por una conversación que no cambie el proyecto.

## Alcance y persistencia

Este método rige BotLab. Los documentos se guardan en el repositorio, fuera de `sources/`, que sigue siendo material de referencia de solo lectura. No requiere una tarea programada ni sincronización con un servicio externo.

El [archivo local de instrucciones](../AGENTS.override.md) dirige a este método y al registro al iniciar trabajo en el repositorio. Codex admite `AGENTS.override.md` y lo selecciona antes que `AGENTS.md` en el mismo directorio, según su [documentación de instrucciones](https://learn.chatgpt.com/docs/agent-configuration/agents-md). Por eso el archivo local exige leer también el contexto generado de `AGENTS.md` y conserva la restricción de `sources/`. No se modifica el archivo generado, protegido contra escritura e ignorado por Git.

El método y el registro también son accesibles desde el README. Para retomar explícitamente: «Lee docs/session-workflow.md y docs/next-steps.md y retoma el trabajo de BotLab».

Guardar los archivos permite reiniciar el chat en este mismo checkout. Compartirlos con otro checkout o equipo requiere incluirlos en el flujo habitual de Git; este método no hace commits, publicaciones ni copias de seguridad automáticas.
