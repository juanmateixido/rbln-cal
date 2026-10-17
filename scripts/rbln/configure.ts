import { writeFile } from "node:fs/promises";
import process from "node:process";
import { ErrorCode } from "../../packages/lib/errorCodes";
import { ErrorWithCode } from "../../packages/lib/errors";

type RecordValue = Record<string, unknown>;
type Entity = RecordValue & { id: number | string; slug?: string; name?: string; subscriberUrl?: string };
function fail(message: string): never {
  throw new ErrorWithCode(ErrorCode.BadRequest, message);
}
const env = (name: string) => process.env[name] || fail(`Missing ${name}`);
const base = env("CAL_API_URL").replace(/\/$/, "");
const apiKey = env("CAL_API_KEY");
const secret = env("CAL_WEBHOOK_SECRET");
if (secret.length < 32) fail("CAL_WEBHOOK_SECRET must contain at least 32 characters");
if (!/^https:\/\/cal-api-production-902f\.up\.railway\.app\/v2$/.test(base)) {
  fail("Refusing configuration outside the approved rbln-cal API");
}

async function api(path: string, version: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": version,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok) fail(`${method} ${path.split("?")[0]}: HTTP ${response.status}; response withheld`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("data" in payload)) fail(`Invalid response from ${path}`);
  return payload.data;
}

function entity(value: unknown): Entity {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    (typeof value.id !== "number" && typeof value.id !== "string")
  ) {
    return fail("Invalid entity response");
  }
  return value as Entity;
}

function entities(value: unknown): Entity[] {
  if (!Array.isArray(value)) return fail("Expected an entity list");
  return value.map(entity);
}

function unique(rows: Entity[], matches: (row: Entity) => boolean): Entity | undefined {
  const found = rows.filter(matches);
  if (found.length > 1) fail("Duplicate managed entity; inspect before changing anything");
  return found[0];
}

const offers = [
  ["nutri_consulta_general_inicial", "Consulta general inicial"],
  ["nutri_control_general", "Control general"],
  ["nutri_asesoria_deportiva_inicial", "Asesoría deportiva inicial"],
  ["nutri_seguimiento_deportivo", "Seguimiento deportivo"],
  ["fuel_consulta", "Consulta de nutrición Fuel"],
] as const;
const triggers = [
  "BOOKING_REQUESTED",
  "BOOKING_CREATED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REJECTED",
];

async function main() {
  const me = entity(await api("/me", "2024-06-11"));
  if (me.username !== "giuli") fail("API key must belong to giuli");
  await api("/me", "2024-06-11", "PATCH", {
    name: "Giuliana",
    locale: "es",
    timeZone: "America/Asuncion",
    timeFormat: 24,
  });
  const schedules = entities(await api("/schedules", "2024-06-11"));
  const eventTypes = entities(await api("/event-types?take=100", "2024-06-14"));
  const mapping: { cal_event_type_id: number; cal_slug: string; offer_code: string; modality: string }[] = [];
  for (const modality of ["presencial", "online"] as const) {
    const name = modality === "presencial" ? "presencial-koru" : "online";
    const existing = unique(schedules, (row) => row.name === name);
    const schedule = entity(
      await api(
        existing ? `/schedules/${existing.id}` : "/schedules",
        "2024-06-11",
        existing ? "PATCH" : "POST",
        {
          name,
          timeZone: "America/Asuncion",
          isDefault: modality === "online",
          availability: [
            {
              days: modality === "presencial" ? ["Tuesday", "Thursday"] : ["Monday", "Wednesday", "Friday"],
              startTime: "10:00",
              endTime: "20:00",
            },
          ],
        }
      )
    );
    for (const [offer, title] of offers) {
      const slug = `${offer.replaceAll("_", "-")}-${modality}`;
      const current = unique(eventTypes, (row) => row.slug === slug);
      const desired = {
        title: `${title} · ${modality === "presencial" ? "Koru" : "Online"}`,
        slug,
        description:
          "El turno se confirma con el pago. Para cambiar o cancelar, escribile a Giuli. Política de cambios: 24 horas de aviso y hasta 2 cambios.",
        lengthInMinutes: 45,
        afterEventBuffer: 15,
        slotInterval: 60,
        minimumBookingNotice: 180,
        scheduleId: schedule.id,
        bookingWindow: { type: "calendarDays", value: 60, rolling: true },
        confirmationPolicy: { type: "always", blockUnconfirmedBookingsInBooker: true },
        bookingRequiresAuthentication: true,
        interfaceLanguage: "es",
        hidden: true,
        disableCancelling: { disabled: true },
        disableRescheduling: { disabled: true },
        requiresBookerEmailVerification: false,
        lockTimeZoneToggleOnBookingPage: true,
        hideOrganizerEmail: true,
        successRedirectUrl: "https://crm.rebelion.training/agenda/pago",
        locations:
          modality === "presencial"
            ? [{ type: "address", address: "Koru", public: true }]
            : [{ type: "integration", integration: "google-meet" }],
        bookingFields: [
          { type: "name", label: "Nombre y apellido" },
          { type: "email", label: "Correo electrónico", required: true },
          { type: "phone", slug: "attendeePhoneNumber", label: "WhatsApp", required: true },
          {
            type: "select",
            slug: "motivo",
            label: "Motivo",
            required: true,
            options: ["consulta general", "deportiva / carrera", "control", "otro"],
          },
          {
            type: "boolean",
            slug: "consentimiento",
            label: "Entiendo que el turno se confirma con el pago y acepto la política de cambios",
            required: true,
          },
        ],
      };
      const result = entity(
        await api(
          current ? `/event-types/${current.id}` : "/event-types",
          "2024-06-14",
          current ? "PATCH" : "POST",
          desired
        )
      );
      if (result.bookingRequiresAuthentication !== true || result.interfaceLanguage !== "es")
        fail(`Configuration not preserved for ${slug}`);
      mapping.push({
        cal_event_type_id: typeof result.id === "number" ? result.id : fail("Event type id must be numeric"),
        cal_slug: slug,
        offer_code: offer,
        modality,
      });
      console.log(`${current ? "updated" : "created"}: ${slug} (${result.id})`);
    }
  }
  const hooks = entities(await api("/webhooks?take=100", "2024-06-14"));
  const destinations = [
    { subscriberUrl: "https://crm.rebelion.training/api/integrations/cal/webhook", active: false },
    { subscriberUrl: `${env("T0_SINK_URL")}/webhook`, active: true },
  ];
  for (const destination of destinations) {
    const current = unique(hooks, (row) => row.subscriberUrl === destination.subscriberUrl);
    await api(current ? `/webhooks/${current.id}` : "/webhooks", "2024-06-14", current ? "PATCH" : "POST", {
      ...destination,
      triggers,
      secret,
      version: "2021-10-20",
    });
  }
  await writeFile(
    env("EVENT_TYPES_OUTPUT"),
    `${JSON.stringify({ upstream_sha: "54343aa685ae8f33159d2f485ec4a57bad5c574a", user: "giuli", event_types: mapping }, null, 2)}\n`,
    { mode: 0o644 }
  );
  console.log("Configuration verified: 2 schedules, 10 event types; CRM webhook inactive until GO.");
}

main().catch((error: unknown) => {
  console.error(
    error instanceof ErrorWithCode
      ? error.message
      : "Configuration failed; details withheld to protect secrets"
  );
  process.exitCode = 1;
});
