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

Preparado el 17/10/2026 antes del alta. Aún no hubo sesiones de Giuliana.
Las llamadas con la API key del CRM no crean una sesión web del usuario.
