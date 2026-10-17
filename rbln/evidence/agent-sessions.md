# Sesiones de agentes con la cuenta de Giuliana

Registro desde la primera sesión. Hasta el GO, la contraseña inicial aleatoria
es exclusivamente de bootstrap; no es una contraseña personal de Giuliana.
SMTP permanece en captura. No se entrega ninguna clave a personas.

`agent-sessions.jsonl` se escribe antes de cada sesión y en `finally`: hora UTC,
hilo, propósito, ID aleatorio de auditoría, cierre y resultado de la verificación.
No contiene cookies, contraseñas, API keys ni correo. Cada tarea usa un contexto
Playwright nuevo sin `storageState` persistido. El cierre hace `POST signout`,
comprueba que `GET session` no devuelve usuario, borra cookies y cierra el navegador.
Un fallo de verificación impide dar la tarea por terminada.

El 17/10/2026 hubo tres sesiones entre 15:07 y 15:09 UTC: alta/perfil/API key,
un intento del formulario de evento que terminó por selector incorrecto y
la creación/configuración del único evento oculto. Las tres cerraron con
logout verificado, cookies borradas y navegador cerrado, incluido el intento fallido.
Ver el registro JSONL para los horarios y propósitos exactos.
Las llamadas con la API key del CRM no crean una sesión web del usuario.
