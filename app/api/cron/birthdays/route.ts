import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendSmtpEmail } from "@/lib/smtp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SMTP_USER = "dont.reply@analysis.co.il";
const SUPPORT_SMTP_USER = "support@analysis.co.il";
const SUPPORT_MAX_ATTEMPTS = 2;
const SMTP_RETRY_DELAY_MS = 3_000;
const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

type BirthdayDispatchRow = {
  dispatch_id: string;
  birthday_name: string;
  recipient_name: string;
  recipient_email: string;
  circle_names: string[] | null;
};

function getPublicKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

function createCronClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = getPublicKey();

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase environment variables are missing.");
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function getIsraelDateTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ISRAEL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = Number(values.hour);
  const minute = Number(values.minute);

  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error("Could not resolve Israel date and time.");
  }

  return {
    date: `${year}-${month}-${day}`,
    hour,
    minute,
  };
}

function isBirthdaySendWindow(hour: number, minute: number) {
  const minutesSinceMidnight = hour * 60 + minute;
  const windowStart = 9 * 60 + 20;
  const windowEnd = 10 * 60 + 45;
  return minutesSinceMidnight >= windowStart && minutesSinceMidnight <= windowEnd;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isFailureSendingMailError(error: unknown) {
  const message = getErrorMessage(error).trim();
  return (
    /^ERROR\s*5:\s*Failure sending mail/i.test(message) ||
    /Failure sending mail/i.test(message) ||
    /SMTP command failed with 5\d{2}:/i.test(message)
  );
}

async function sendWithFallback({
  to,
  subject,
  text,
  html,
  smtpPassword,
  supportSmtpPassword,
}: {
  to: string;
  subject: string;
  text: string;
  html: string;
  smtpPassword: string;
  supportSmtpPassword: string;
}) {
  try {
    await sendSmtpEmail({
      username: SMTP_USER,
      password: smtpPassword,
      fromName: "מעגלים",
      to,
      subject,
      text,
      html,
    });
    return;
  } catch (primaryError) {
    if (!isFailureSendingMailError(primaryError)) throw primaryError;
    console.warn(`Primary SMTP account failed for birthday email to ${to}.`, getErrorMessage(primaryError));
  }

  let lastSupportError: unknown = null;
  for (let attempt = 1; attempt <= SUPPORT_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await delay(SMTP_RETRY_DELAY_MS);

    try {
      await sendSmtpEmail({
        username: SUPPORT_SMTP_USER,
        password: supportSmtpPassword,
        fromName: "מעגלים",
        to,
        subject,
        text,
        html,
      });
      return;
    } catch (supportError) {
      lastSupportError = supportError;
      if (!isFailureSendingMailError(supportError)) throw supportError;
      console.warn(
        `Support SMTP birthday attempt ${attempt}/${SUPPORT_MAX_ATTEMPTS} failed for ${to}.`,
        getErrorMessage(supportError),
      );
    }
  }

  throw lastSupportError instanceof Error
    ? lastSupportError
    : new Error("שליחת מייל יום ההולדת נכשלה.");
}

function formatCircleList(circleNames: string[]) {
  return circleNames.map((name) => `• ${name}`).join("\n");
}

function formatCircleListHtml(circleNames: string[]) {
  return circleNames
    .map((name) => `<li style="margin:4px 0">${escapeHtml(name)}</li>`)
    .join("");
}

export async function POST(request: Request) {
  const cronToken = request.headers.get("x-birthday-cron-token")?.trim() ?? "";
  if (!cronToken) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const israelNow = getIsraelDateTime();
  if (!isBirthdaySendWindow(israelNow.hour, israelNow.minute)) {
    return NextResponse.json({
      message: "Outside the Israel birthday-email window.",
      israelDate: israelNow.date,
      israelTime: `${String(israelNow.hour).padStart(2, "0")}:${String(israelNow.minute).padStart(2, "0")}`,
      sent: 0,
    });
  }

  const smtpPassword = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  const supportSmtpPassword = process.env.SMTP_APP_PASSWORD_FROM_SUPPORT?.replace(/\s+/g, "");

  if (!smtpPassword || !supportSmtpPassword) {
    return NextResponse.json(
      { message: "Birthday email SMTP settings are incomplete." },
      { status: 503 },
    );
  }

  const supabase = createCronClient();
  const { data, error } = await supabase.rpc("prepare_birthday_email_dispatches", {
    p_cron_token: cronToken,
    p_birthday_date: israelNow.date,
  });

  if (error) {
    console.error("Preparing birthday email dispatches failed", error);
    return NextResponse.json(
      { message: "Could not prepare birthday email dispatches." },
      { status: error.code === "42501" ? 401 : 500 },
    );
  }

  const dispatches = (Array.isArray(data) ? data : []) as BirthdayDispatchRow[];
  let sent = 0;
  let failed = 0;

  for (const dispatch of dispatches) {
    const birthdayName = dispatch.birthday_name?.trim() || "חבר/ת מעגל";
    const recipientName = dispatch.recipient_name?.trim() || "מנהל/ת המעגל";
    const recipientEmail = dispatch.recipient_email?.trim().toLowerCase();
    const circleNames = Array.from(
      new Set((dispatch.circle_names ?? []).map((name) => name.trim()).filter(Boolean)),
    );

    if (!dispatch.dispatch_id || !recipientEmail || circleNames.length === 0) {
      failed += 1;
      await supabase.rpc("finish_birthday_email_dispatch", {
        p_cron_token: cronToken,
        p_dispatch_id: dispatch.dispatch_id,
        p_success: false,
        p_error_message: "invalid_dispatch_data",
      });
      continue;
    }

    const oneCircle = circleNames.length === 1;
    const subject = `היום יום ההולדת של ${birthdayName}`;
    const text = [
      `שלום ${recipientName},`,
      "",
      `היום יום ההולדת של ${birthdayName}, חבר/ה ${oneCircle ? "במעגל" : "במעגלים"}:`,
      formatCircleList(circleNames),
      "",
      "יום הולדת שמח! 🎉",
    ].join("\n");

    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#111827;max-width:640px;margin:auto">
        <h2 style="margin:0 0 18px">שלום ${escapeHtml(recipientName)},</h2>
        <p style="font-size:16px;margin:0 0 12px">
          היום יום ההולדת של <strong>${escapeHtml(birthdayName)}</strong>, חבר/ה ${oneCircle ? "במעגל" : "במעגלים"}:
        </p>
        <ul style="margin:0 0 20px;padding-right:22px">
          ${formatCircleListHtml(circleNames)}
        </ul>
        <p style="font-size:18px;margin:0">יום הולדת שמח! 🎉</p>
      </div>
    `;

    try {
      await sendWithFallback({
        to: recipientEmail,
        subject,
        text,
        html,
        smtpPassword,
        supportSmtpPassword,
      });
      sent += 1;

      const { error: finishError } = await supabase.rpc("finish_birthday_email_dispatch", {
        p_cron_token: cronToken,
        p_dispatch_id: dispatch.dispatch_id,
        p_success: true,
        p_error_message: null,
      });
      if (finishError) {
        console.error(`Finishing successful birthday dispatch ${dispatch.dispatch_id} failed`, finishError);
      }
    } catch (sendError) {
      failed += 1;
      const errorMessage = getErrorMessage(sendError);
      console.error(`Sending birthday email to ${recipientEmail} failed`, sendError);

      const { error: finishError } = await supabase.rpc("finish_birthday_email_dispatch", {
        p_cron_token: cronToken,
        p_dispatch_id: dispatch.dispatch_id,
        p_success: false,
        p_error_message: errorMessage,
      });
      if (finishError) {
        console.error(`Finishing failed birthday dispatch ${dispatch.dispatch_id} failed`, finishError);
      }
    }
  }

  return NextResponse.json({
    message: "Birthday email run completed.",
    israelDate: israelNow.date,
    prepared: dispatches.length,
    sent,
    failed,
  });
}
