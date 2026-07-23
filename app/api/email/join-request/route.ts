import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSmtpEmail } from "@/lib/smtp";

const SMTP_USER = "dont.reply@analysis.co.il";
const SUPPORT_SMTP_USER = "support@analysis.co.il";
const SMTP_RETRY_DELAY_MS = 10_000;
const SUPPORT_MAX_ATTEMPTS = 5;
const PRODUCTION_ORIGIN = "https://circles-community.vercel.app";

type JoinRequestEmailRow = {
  already_processed: boolean;
  request_time: string;
  community_name: string;
  community_share_token: string;
  requester_name: string | null;
  recipient_user_id: string | null;
  recipient_name: string | null;
  recipient_email: string | null;
};

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
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
    console.warn(`Primary SMTP account failed for join-request email to ${to}.`, getErrorMessage(primaryError));
  }

  let lastSupportError: unknown = null;
  for (let attempt = 1; attempt <= SUPPORT_MAX_ATTEMPTS; attempt += 1) {
    await delay(SMTP_RETRY_DELAY_MS);
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
        `Support SMTP join-request attempt ${attempt}/${SUPPORT_MAX_ATTEMPTS} failed for ${to}.`,
        getErrorMessage(supportError),
      );
    }
  }

  throw lastSupportError instanceof Error
    ? lastSupportError
    : new Error("שליחת המייל נכשלה לאחר חמישה ניסיונות מחשבון התמיכה.");
}

export async function POST(request: Request) {
  const smtpPassword = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  const supportSmtpPassword = process.env.SMTP_APP_PASSWORD_FROM_SUPPORT?.replace(/\s+/g, "");

  if (!smtpPassword || !supportSmtpPassword) {
    return NextResponse.json(
      { message: "הגדרות שליחת המייל אינן מלאות." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return NextResponse.json({ message: "יש להתחבר מחדש למערכת." }, { status: 401 });
  }

  let body: { communityId?: string };
  try {
    body = (await request.json()) as { communityId?: string };
  } catch {
    return NextResponse.json({ message: "בקשת השליחה אינה תקינה." }, { status: 400 });
  }

  const communityId = cleanText(body.communityId, 100);
  if (!communityId) {
    return NextResponse.json({ message: "לא נמצא המעגל של בקשת ההצטרפות." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("prepare_join_request_manager_email", {
    p_community_id: communityId,
  });

  if (error) {
    console.error("Preparing join-request manager email failed", error);
    return NextResponse.json(
      {
        message:
          error.code === "42883"
            ? "יש להריץ את קובץ ה־SQL של circles112 ב־Supabase."
            : "לא ניתן היה להכין את הודעת המייל למנהלי המעגל.",
      },
      { status: 500 },
    );
  }

  const rows = (Array.isArray(data) ? data : []) as JoinRequestEmailRow[];
  const firstRow = rows[0];

  if (!firstRow || firstRow.already_processed) {
    return NextResponse.json({ message: "הודעת ההצטרפות כבר טופלה.", sent: 0 });
  }

  const recipients = rows.filter(
    (row) => row.recipient_user_id && row.recipient_email,
  );
  if (recipients.length === 0) {
    return NextResponse.json({ message: "לא נמצאו מנהלים בעלי כתובת מייל.", sent: 0 });
  }
  const communityName = firstRow.community_name;
  const requesterName = firstRow.requester_name?.trim() || "משתמש חדש";
  const requestTime = firstRow.request_time;
  const subject = `בקשת הצטרפות למעגל ${communityName}`;
  const circleUrl = `${PRODUCTION_ORIGIN}/circle/${firstRow.community_share_token}`;
  const safeCommunityName = escapeHtml(communityName);
  const safeRequesterName = escapeHtml(requesterName);

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const recipientName = recipient.recipient_name?.trim() || "שלום";
    const safeRecipientName = escapeHtml(recipientName);
    try {
      await sendWithFallback({
        to: recipient.recipient_email!,
        subject,
        smtpPassword,
        supportSmtpPassword,
        text: [
          `שלום ${recipientName},`,
          "",
          `${requesterName} מבקש/ת להצטרף למעגל „${communityName}”.`,
          "",
          "לפתיחת המעגל ולטיפול בבקשה:",
          circleUrl,
        ].join("\n"),
        html: `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#111827;max-width:640px;margin:auto">
            <h2 style="margin:0 0 18px">שלום ${safeRecipientName},</h2>
            <p style="font-size:16px">${safeRequesterName} מבקש/ת להצטרף למעגל „${safeCommunityName}”.</p>
            <p style="margin:26px 0">
              <a href="${circleUrl}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px">
                פתיחת המעגל וטיפול בבקשה
              </a>
            </p>
          </div>
        `,
      });
      sent += 1;
    } catch (sendError) {
      failed += 1;
      console.error(`Sending join-request email to ${recipient.recipient_email} failed`, sendError);
    }
  }

  const { error: finishError } = await supabase.rpc("finish_join_request_manager_email", {
    p_community_id: communityId,
    p_requested_at: requestTime,
    p_sent_count: sent,
    p_failed_count: failed,
  });

  if (finishError) {
    console.error("Finishing join-request manager email accounting failed", finishError);
  }

  return NextResponse.json({
    message:
      failed > 0
        ? `נשלחו ${sent} הודעות מייל למנהלים ו־${failed} נכשלו.`
        : `נשלחו ${sent} הודעות מייל למנהלי המעגל.`,
    sent,
    failed,
  });
}
