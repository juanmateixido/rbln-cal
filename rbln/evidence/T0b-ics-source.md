# ICS: identidad de eventos pendiente de validación en clientes

17/10/2026. Lectura sobre `878c287ee1c12420ecac7c47739433f95e11b02a`;
los archivos de este recorrido no tienen diff contra el ancla
`54343aa685ae8f33159d2f485ec4a57bad5c574a`. Las capturas corresponden a la
imagen anterior `a7e8cc3096665cefe10a36579d64fdbbbc28617b`, sin Google conectado,
SMTP captura y datos sintéticos. No se aplica parche ni se abre PR.

Estado: **cancelación ICS pendiente/no validada**. El desajuste de UID entre
adjuntos está observado. Su efecto en clientes de correo/calendario y Google
no está probado; no se afirma un fallo confirmado de sincronización.

## Recorrido del MIME

1. `packages/features/bookings/lib/service/RegularBookingService.ts:1306`
   obtiene `iCalUID` de `getICalUID`: conserva el de la reserva anterior al
   reprogramar o construye uno desde el uid nuevo. En
   `packages/emails/lib/getICalUID.ts:26`, un `event.iCalUID` existente tiene
   prioridad; `:30` genera la forma simbólica `<bookingUid>@<APP_NAME>`.
   `packages/lib/constants.ts:38` toma APP_NAME de NEXT_PUBLIC_APP_NAME.
   Aquí el sufijo de la marca explica 34 caracteres frente a los 22 del uid.
2. `RegularBookingService.ts:1412` añade esos identificadores a `evt`;
   `packages/features/bookings/lib/handleNewBooking/createBooking.ts:205`
   persiste `evt.iCalUID` e `iCalSequence` en la reserva. La secuencia inicial
   es cero; `RegularBookingService.ts:129` la incrementa al reprogramar.
3. Confirmar por API v2 llama al handler compartido en
   `apps/api/v2/src/platform/bookings/2024-08-13/services/bookings.service.ts:1135`.
   `packages/trpc/server/routers/viewer/bookings/confirm.handler.ts:231`
   reconstruye un CalendarEvent; `:264` copia `uid`, pero ese objeto no copia
   `booking.iCalUID` ni `booking.iCalSequence`. Pasa a `handleConfirmation`.
4. `packages/features/bookings/lib/handleConfirmation.ts:80` crea las
   integraciones y `:108` manda `sendScheduledEmailsAndSMS` con ese `evt`.
   Sin proveedor conectado no vuelve un iCalUID de calendario que lo complete.
   `packages/emails/templates/attendee-scheduled-email.ts:43` genera ICS
   CONFIRMED; el template organizador usa el mismo generador.
5. `packages/emails/lib/generateIcsFile.ts:34` entrega el CalendarEvent a
   `generateIcsString`. En `generateIcsString.ts:76` el UID es
   `event.iCalUID || event.uid`, y `:77` la secuencia es `event.iCalSequence || 0`.
   Por eso el REQUEST observado después de confirmar usa el uid de 22 caracteres
   y secuencia inicial cero (el serializador puede omitir SEQUENCE=0).
6. Cancelar toma otra ruta: `packages/features/bookings/lib/handleCancelBooking.ts:278`
   sí copia `bookingToDelete.iCalUID` y en `:279` incrementa la secuencia guardada.
   `:509` entrega ese evento a `sendCancelledEmailsAndSMS`.
   `packages/emails/templates/attendee-cancelled-email.ts:11` pide CANCELLED al
   mismo generador; `generateIcsString.ts:110` elige METHOD=CANCEL. Así aparece
   el UID persistido de 34 caracteres y secuencia 1 (o 2 tras reprogramación).

## Reprogramación

`RegularBookingService.ts:1306` preserva el iCalUID anterior y genera un nuevo
booking uid. En la ruta de reprogramación, `:2021` busca un resultado de
calendario y `:2023` sobrescribe `evt.iCalUID` con el iCalUID devuelto, o
`undefined` si no existe. `:2031` entrega ese evento al emisor.
`packages/features/bookings/lib/BookingEmailSmsHandler.ts:97` selecciona la
ruta no round-robin y `:121` pasa `...evt` a los mails reprogramados. No repone
allí el iCalUID separado que también recibió en el payload.
`packages/emails/templates/attendee-rescheduled-email.ts:11` pide CONFIRMED;
sin proveedor, el generador vuelve al uid nuevo de 22 caracteres. Al cancelar
esa nueva reserva se toma el iCalUID original persistido, con secuencia aumentada.
Esto explica también los casos donde el UID de cancelación no contiene el uid
nuevo del enlace. La variante asistente queda pending/BOOKING_REQUESTED según
T0b-H2; el REQUEST confirmado se evalúa después de confirmación, no se atribuye
un ICS de confirmación al simple mail de solicitud.

## Proveedor calendario frente a adjunto MIME

Son caminos distintos. `packages/features/bookings/lib/EventManager.ts:364`
clona el evento para crear integraciones; `:396` puede copiar el iCalUID
retornado por el proveedor al evento usado después para emails.
`packages/features/calendars/lib/CalendarManager.ts:394` llama al proveedor y
`:442` devuelve su iCalUID. Con un proveedor conectado, por tanto, no se puede
extrapolar sin prueba el caso de captura sin calendario.

Google: `packages/app-store/googlecalendar/lib/CalendarService.ts:203` incluye
el iCalUID recibido en el payload; `:283` crea por `calendar.events.insert` y
`:332` devuelve el iCalUID de Google. Reprogramar usa `calendar.events.update`
en `:405` con `eventId: uid` de la referencia del proveedor, no el UID leído del
adjunto MIME. Cancelar en `handleCancelBooking.ts:472` llama a EventManager con
las referencias persistidas; `EventManager.ts:516` obtiene `reference.uid` y
`:528` llama a deleteEvent. Google `CalendarService.ts:469` borra por ese
`eventId`, con `sendUpdates: none`. El envío de CANCEL MIME ocurre por separado.
No hay ejecución de Google en este T0: queda para GO, junto con el efecto real
de los adjuntos sobre el calendario de la persona asistente.

## Evidencia y próxima comprobación

`T0b-ics-linkage.json` correlaciona el enlace del mismo correo con su ICS solo
en memoria, y guarda hashes, METHOD, STATUS, SEQUENCE y longitudes. No conserva
correos, links de gestión ni UID crudos. `mails-sanitized.json` contiene 70 mails,
80 partes de calendario (inline/adjunto pueden duplicarse): 48 REQUEST/CONFIRMED,
32 CANCEL/CANCELLED; secuencias omitida/0, 1 y 2. Las solicitudes/rechazos no se
confunden con confirmaciones.

En GO: repetir crear→confirmar→reprogramar→cancelar con el calendario conectado;
comparar separadamente ID/iCalUID del proveedor, UID/SEQUENCE del MIME y resultado
en el cliente de la persona asistente. Hasta entonces el criterio de cancelación
ICS permanece pendiente. No modifica el cierre de privacidad/traducción del PR #2.
