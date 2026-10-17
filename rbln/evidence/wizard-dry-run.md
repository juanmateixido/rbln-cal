# Wizard de GO · ejecución en seco

17/10/2026, 15:02 UTC. `bash rbln/wizard-juanma.sh --dry-run`: exit 0.
No navegador, lectura de secretos, despliegue, reset ni correo. También pasa
`bash -n`. El modo real queda reservado al GO con Juanma y Giuliana presentes.

Etapas mostradas:

1. App OAuth propia de Google publicada; credenciales a
   `RBLN /cal GOOGLE_API_CREDENTIALS` mediante `cargar.py`, sin eco.
2. Con Giuli leyendo el correo en ese momento, reset de un uso/6 h y elección
   de su contraseña. Comprobación automática de rechazo explícito de la clave
   inicial y cierre de sesión; evidencia para la baja posterior por
   secrets-vault conforme T14e.
3. Giuli conecta Google, elige `Pacientes` y el script comprueba destino y
   calendarios de conflictos por API.

El modo opcional `--images sha-<commit>` comprueba primero el pull anónimo y
solo pide cambiar visibilidad si hace falta. No requiere token de paquetes ni
activa SMTP. Los paquetes públicos ya verificados no requieren paso humano.

El DNS se coordina con el orquestador fuera de este wizard. `BOOKING_MODE`
permanece `off`. Las comprobaciones de reset y calendario están preparadas;
no se presentan como ejecutadas en esta prueba seca.
