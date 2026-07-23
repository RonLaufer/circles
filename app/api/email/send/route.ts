import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendSmtpEmail } from "@/lib/smtp";

const SYSTEM_ADMIN_EMAIL = "laufer.ron@gmail.com";
const SMTP_USER = "dont.reply@analysis.co.il";
const SUPPORT_SMTP_USER = "support@analysis.co.il";
const SMTP_RETRY_DELAY_MS = 10_000;
const SUPPORT_MAX_ATTEMPTS = 5;
const PRODUCTION_ORIGIN = "https://circles-community.vercel.app";

type EmailAudience =
  | "all_members"
  | "managers"
  | "event_going"
  | "event_maybe"
  | "event_not_responded";

type RequestBody = {
  contextType?: "community" | "event";
  communityId?: string;
  eventId?: string | null;
  audience?: EmailAudience;
  subject?: string;
  message?: string;
};

type MembershipRow = {
  user_id: string;
  role: "owner" | "admin" | "member";
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function isSystemAdmin(email: string | null | undefined) {
  return email?.trim().toLowerCase() === SYSTEM_ADMIN_EMAIL;
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

async function sendSequentially(
  recipients: ProfileRow[],
  send: (recipient: ProfileRow) => Promise<void>,
) {
  const results: PromiseSettledResult<void>[] = [];

  for (const recipient of recipients) {
    try {
      await send(recipient);
      results.push({ status: "fulfilled", value: undefined });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }

  return results;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUser = authData.user;

  if (authError || !authUser) {
    return NextResponse.json({ message: "יש להתחבר מחדש למערכת." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ message: "בקשת השליחה אינה תקינה." }, { status: 400 });
  }

  const contextType = body.contextType;
  const communityId = cleanText(body.communityId, 100);
  const eventId = cleanText(body.eventId, 100);
  const audience = body.audience;
  const subject = cleanText(body.subject, 160);
  const message = cleanText(body.message, 5000);

  if (
    !communityId ||
    !subject ||
    !message ||
    !audience ||
    (contextType !== "community" && contextType !== "event")
  ) {
    return NextResponse.json({ message: "חסרים פרטים הנדרשים לשליחת המייל." }, { status: 400 });
  }

  if (contextType === "event" && !eventId) {
    return NextResponse.json({ message: "לא נמצא האירוע שאליו שייך המייל." }, { status: 400 });
  }

  const [{ data: senderProfile }, { data: community, error: communityError }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,email")
      .eq("id", authUser.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("communities")
      .select("id,name,share_token,created_by")
      .eq("id", communityId)
      .maybeSingle<{ id: string; name: string; share_token: string; created_by: string }>(),
  ]);

  if (communityError || !community) {
    return NextResponse.json({ message: "המעגל לא נמצא." }, { status: 404 });
  }

  const senderEmail = (authUser.email ?? senderProfile?.email ?? "").trim().toLowerCase();
  const { data: senderMembership } = await supabase
    .from("community_members")
    .select("role")
    .eq("community_id", communityId)
    .eq("user_id", authUser.id)
    .maybeSingle<{ role: "owner" | "admin" | "member" }>();

  const canSend =
    isSystemAdmin(senderEmail) ||
    community.created_by === authUser.id ||
    senderMembership?.role === "owner" ||
    senderMembership?.role === "admin";

  if (!canSend) {
    return NextResponse.json({ message: "רק מנהלי המעגל יכולים לשלוח מיילים." }, { status: 403 });
  }

  const { data: membershipRows, error: membershipsError } = await supabase
    .from("community_members")
    .select("user_id,role")
    .eq("community_id", communityId)
    .returns<MembershipRow[]>();

  if (membershipsError) {
    return NextResponse.json({ message: "לא ניתן לטעון את חברי המעגל." }, { status: 500 });
  }

  const memberships = (membershipRows ?? []) as MembershipRow[];
  let targetUserIds = memberships.map((membership: MembershipRow) => membership.user_id);
  let contextTitle = community.name;
  let contextUrl = `${PRODUCTION_ORIGIN}/circle/${community.share_token}`;

  if (audience === "managers") {
    targetUserIds = memberships
      .filter((membership: MembershipRow) => membership.role === "owner" || membership.role === "admin")
      .map((membership: MembershipRow) => membership.user_id);
  }

  if (contextType === "event") {
    const { data: eventRow, error: eventError } = await supabase
      .from("community_events")
      .select("id,title,share_token,community_id")
      .eq("id", eventId)
      .eq("community_id", communityId)
      .maybeSingle<{ id: string; title: string; share_token: string; community_id: string }>();

    if (eventError || !eventRow) {
      return NextResponse.json({ message: "האירוע לא נמצא." }, { status: 404 });
    }

    contextTitle = eventRow.title;
    contextUrl = `${PRODUCTION_ORIGIN}/event/${eventRow.share_token}`;

    if (audience.startsWith("event_")) {
      const { data: attendanceRows, error: attendanceError } = await supabase
        .from("event_attendance")
        .select("user_id,status")
        .eq("event_id", eventId)
        .returns<Array<{ user_id: string; status: "going" | "maybe" | "not_going" }>>();

      if (attendanceError) {
        return NextResponse.json({ message: "לא ניתן לטעון את תשובות ההשתתפות." }, { status: 500 });
      }

      const attendance = (attendanceRows ?? []) as Array<{
        user_id: string;
        status: "going" | "maybe" | "not_going";
      }>;

      if (audience === "event_going") {
        targetUserIds = attendance
          .filter((row) => row.status === "going")
          .map((row) => row.user_id);
      } else if (audience === "event_maybe") {
        targetUserIds = attendance
          .filter((row) => row.status === "maybe")
          .map((row) => row.user_id);
      } else if (audience === "event_not_responded") {
        const answeredUserIds = new Set(attendance.map((row) => row.user_id));
        targetUserIds = memberships
          .filter((membership: MembershipRow) => !answeredUserIds.has(membership.user_id))
          .map((membership: MembershipRow) => membership.user_id);
      }
    }
  } else if (audience.startsWith("event_")) {
    return NextResponse.json({ message: "קבוצת הנמענים שנבחרה מתאימה רק לאירוע." }, { status: 400 });
  }

  const uniqueUserIds = Array.from(new Set(targetUserIds));
  if (uniqueUserIds.length === 0) {
    return NextResponse.json({ message: "לא נמצאו נמענים בקבוצה שנבחרה." }, { status: 400 });
  }


  const { data: profileRows, error: profilesError } = await supabase
    .from("profiles")
    .select("id,full_name,email")
    .in("id", uniqueUserIds)
    .returns<ProfileRow[]>();

  if (profilesError) {
    return NextResponse.json({ message: "לא ניתן לטעון את כתובות המייל של החברים." }, { status: 500 });
  }

  const profiles = (profileRows ?? []) as ProfileRow[];
  const seenEmails = new Set<string>();
  const recipients = profiles.filter((recipient: ProfileRow) => {
    const email = recipient.email?.trim().toLowerCase();
    if (!email || seenEmails.has(email)) return false;
    seenEmails.add(email);
    recipient.email = email;
    return true;
  });

  if (recipients.length === 0) {
    return NextResponse.json({ message: "לא נמצאו כתובות מייל זמינות בקבוצה שנבחרה." }, { status: 400 });
  }

  const smtpPassword = process.env.SMTP_APP_PASSWORD?.replace(/\s+/g, "");
  const supportSmtpPassword = process.env.SMTP_APP_PASSWORD_FROM_SUPPORT?.replace(/\s+/g, "");

  if (!smtpPassword) {
    return NextResponse.json(
      { message: "חסר המשתנה SMTP_APP_PASSWORD בהגדרות הפרויקט." },
      { status: 503 },
    );
  }

  if (!supportSmtpPassword) {
    return NextResponse.json(
      { message: "חסר המשתנה SMTP_APP_PASSWORD_FROM_SUPPORT בהגדרות הפרויקט." },
      { status: 503 },
    );
  }

  const senderName = senderProfile?.full_name?.trim() || senderEmail || "מנהל המעגל";
  const safeSenderName = escapeHtml(senderName);
  const safeContextTitle = escapeHtml(contextTitle);
  const safeMessage = escapeHtml(message).replaceAll("\n", "<br>");

  const successfulRecipientUserIds: string[] = [];
  const results = await sendSequentially(recipients, async (recipient) => {
    const recipientName = recipient.full_name?.trim() || "שלום";
    const safeRecipientName = escapeHtml(recipientName);
    const emailContent = {
      fromName: "מעגלים",
      to: recipient.email!,
      subject,
      text: [
        `שלום ${recipientName},`,
        "",
        message,
        "",
        `לצפייה ב${contextType === "event" ? "אירוע" : "מעגל"}:`,
        contextUrl,
        "",
        `נשלח על ידי ${senderName} באמצעות מערכת מעגלים.`,
      ].join("\n"),
      html: `
        <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.7;color:#111827;max-width:640px;margin:auto">
          <h2 style="margin:0 0 18px">שלום ${safeRecipientName},</h2>
          <div style="font-size:16px">${safeMessage}</div>
          <p style="margin:26px 0">
            <a href="${contextUrl}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:12px">
              צפייה ב${contextType === "event" ? "אירוע" : "מעגל"} „${safeContextTitle}”
            </a>
          </p>
          <p style="margin-top:28px;color:#475569">נשלח על ידי ${safeSenderName} באמצעות מערכת מעגלים.</p>
        </div>
      `,
    };

    try {
      await sendSmtpEmail({
        username: SMTP_USER,
        password: smtpPassword,
        ...emailContent,
      });
      successfulRecipientUserIds.push(recipient.id);
      return;
    } catch (primaryError) {
      if (!isFailureSendingMailError(primaryError)) throw primaryError;

      console.warn(
        `Primary SMTP account reached a sending failure for ${recipient.email}. Switching to support account.`,
        getErrorMessage(primaryError),
      );
    }

    let lastSupportError: unknown = null;

    for (let attempt = 1; attempt <= SUPPORT_MAX_ATTEMPTS; attempt += 1) {
      await delay(SMTP_RETRY_DELAY_MS);

      try {
        await sendSmtpEmail({
          username: SUPPORT_SMTP_USER,
          password: supportSmtpPassword,
          ...emailContent,
        });
        successfulRecipientUserIds.push(recipient.id);
        return;
      } catch (supportError) {
        lastSupportError = supportError;

        if (!isFailureSendingMailError(supportError)) throw supportError;

        console.warn(
          `Support SMTP attempt ${attempt}/${SUPPORT_MAX_ATTEMPTS} failed for ${recipient.email}.`,
          getErrorMessage(supportError),
        );
      }
    }

    throw lastSupportError instanceof Error
      ? lastSupportError
      : new Error("שליחת המייל נכשלה לאחר חמישה ניסיונות מחשבון התמיכה.");
  });

  const sent = results.filter((result) => result.status === "fulfilled").length;
  const failed = results.length - sent;
  const withoutEmail = uniqueUserIds.length - recipients.length;

  if (sent === 0) {
    console.error("All Circles email deliveries failed", results);
    return NextResponse.json({ message: "שליחת המיילים נכשלה. יש לנסות שוב." }, { status: 500 });
  }

  let notificationWarning = false;
  const { error: notificationError } = await supabase.rpc("create_email_delivery_notifications", {
    p_community_id: communityId,
    p_event_id: contextType === "event" ? eventId : null,
    p_recipient_user_ids: successfulRecipientUserIds,
    p_title: subject,
    p_body: message,
  });

  if (notificationError) {
    notificationWarning = true;
    console.error("Creating email delivery notifications failed", notificationError);
  }

  return NextResponse.json({
    message:
      failed > 0
        ? `נשלחו ${sent} מיילים. שליחת ${failed} מיילים נכשלה.${notificationWarning ? " המיילים שנשלחו לא נרשמו כנוטיפיקציה." : ""}`
        : `נשלחו ${sent} מיילים בהצלחה.${notificationWarning ? " לא ניתן היה לרשום אותם כנוטיפיקציה." : ""}`,
    sent,
    failed,
    withoutEmail,
    notificationWarning,
  });
}
