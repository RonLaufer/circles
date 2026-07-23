import tls from "node:tls";

type SmtpResponse = {
  code: number;
  lines: string[];
};

type SendSmtpEmailParams = {
  username: string;
  password: string;
  fromName: string;
  to: string;
  subject: string;
  html: string;
  text: string;
};

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";
}

function createMessage({
  username,
  fromName,
  to,
  subject,
  html,
  text,
}: Omit<SendSmtpEmailParams, "password">) {
  const boundary = `circles_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const domain = username.split("@")[1] || "gmail.com";
  const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@${domain}>`;

  return [
    `From: ${encodeHeader(fromName)} <${username}>`,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

export async function sendSmtpEmail(params: SendSmtpEmailParams) {
  const socket = tls.connect({
    host: "smtp.gmail.com",
    port: 465,
    servername: "smtp.gmail.com",
    rejectUnauthorized: true,
  });

  socket.setTimeout(20000);

  let buffer = "";
  let currentLines: string[] = [];
  const pendingReaders: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
  }> = [];

  function fail(error: Error) {
    while (pendingReaders.length > 0) pendingReaders.shift()?.reject(error);
    socket.destroy();
  }

  socket.on("timeout", () => fail(new Error("SMTP connection timed out.")));
  socket.on("error", (error) => fail(error));

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    while (buffer.includes("\r\n")) {
      const lineEnd = buffer.indexOf("\r\n");
      const line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 2);
      currentLines.push(line);

      if (/^\d{3} /.test(line)) {
        const reader = pendingReaders.shift();
        const response: SmtpResponse = {
          code: Number(line.slice(0, 3)),
          lines: currentLines,
        };
        currentLines = [];
        reader?.resolve(response);
      }
    }
  });

  function readResponse() {
    return new Promise<SmtpResponse>((resolve, reject) => {
      pendingReaders.push({ resolve, reject });
    });
  }

  async function expect(expectedCodes: number[], command?: string) {
    if (command !== undefined) socket.write(`${command}\r\n`);
    const response = await readResponse();

    if (!expectedCodes.includes(response.code)) {
      throw new Error(
        `SMTP command failed with ${response.code}: ${response.lines.join(" | ")}`,
      );
    }

    return response;
  }

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
    });

    await expect([220]);
    await expect([250], "EHLO circles-community");
    await expect([334], "AUTH LOGIN");
    await expect([334], Buffer.from(params.username, "utf8").toString("base64"));
    await expect([235], Buffer.from(params.password, "utf8").toString("base64"));
    await expect([250], `MAIL FROM:<${params.username}>`);
    await expect([250, 251], `RCPT TO:<${params.to}>`);
    await expect([354], "DATA");

    const message = createMessage(params);
    socket.write(`${message}\r\n.\r\n`);
    await expect([250]);
    await expect([221], "QUIT");
  } finally {
    socket.end();
  }
}
