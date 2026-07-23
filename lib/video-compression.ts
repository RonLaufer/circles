"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";

const FFMPEG_CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/x-m4v"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

type VideoProgressEvent = {
  progress: number;
  time: number;
};

type VideoCompressionUpdate = {
  message: string;
  progress: number | null;
};

export type CompressedVideoResult = {
  file: File;
  beforeBytes: number;
  afterBytes: number;
  reductionPercent: number;
  durationSeconds: number;
};

export class CompressedVideoTooLargeError extends Error {
  beforeBytes: number;
  afterBytes: number;
  maxBytes: number;

  constructor(beforeBytes: number, afterBytes: number, maxBytes: number) {
    super("compressed_video_too_large");
    this.name = "CompressedVideoTooLargeError";
    this.beforeBytes = beforeBytes;
    this.afterBytes = afterBytes;
    this.maxBytes = maxBytes;
  }
}

let ffmpegPromise: Promise<FFmpeg> | null = null;
let activeProgressHandler: ((event: VideoProgressEvent) => void) | null = null;
let compressionBusy = false;
let coreObjectUrlsPromise: Promise<{ coreURL: string; wasmURL: string }> | null = null;


function getOriginalExtension(file: File) {
  return file.name.split(".").pop()?.trim().toLowerCase() ?? "";
}

function getVideoExtension(file: File) {
  const fileExtension = getOriginalExtension(file);
  if (VIDEO_EXTENSIONS.has(fileExtension)) return fileExtension;
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/x-m4v") return "m4v";
  return "mp4";
}

export function isSupportedVideoFile(file: File) {
  return VIDEO_MIME_TYPES.has(file.type) || VIDEO_EXTENSIONS.has(getOriginalExtension(file));
}

async function fetchAsObjectUrl(url: string, contentType: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`video_engine_download_failed_${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  return URL.createObjectURL(new Blob([bytes], { type: contentType }));
}

async function getCoreObjectUrls() {
  if (!coreObjectUrlsPromise) {
    coreObjectUrlsPromise = Promise.all([
      fetchAsObjectUrl(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      fetchAsObjectUrl(`${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
    ]).then(([coreURL, wasmURL]) => ({ coreURL, wasmURL }));
  }
  return coreObjectUrlsPromise;
}

async function getFFmpeg(onUpdate: (update: VideoCompressionUpdate) => void) {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      onUpdate({ message: "טוען את מנוע כיווץ הווידאו…", progress: null });
      const ffmpeg = new FFmpeg();
      ffmpeg.on("progress", (event) => activeProgressHandler?.(event as VideoProgressEvent));
      const urls = await getCoreObjectUrls();
      await ffmpeg.load(urls);
      return ffmpeg;
    })().catch((error) => {
      ffmpegPromise = null;
      coreObjectUrlsPromise = null;
      throw error;
    });
  }
  return ffmpegPromise;
}

function loadVideoMetadata(file: File) {
  return new Promise<{ duration: number; width: number; height: number }>((resolve, reject) => {
    const video = document.createElement("video");
    const sourceUrl = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => finishError(new Error("video_metadata_timeout")), 20_000);

    function cleanup() {
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(sourceUrl);
    }

    function finishError(error: Error) {
      cleanup();
      reject(error);
    }

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number(video.duration);
      const width = Number(video.videoWidth);
      const height = Number(video.videoHeight);
      cleanup();
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("video_metadata_failed"));
        return;
      }
      resolve({ duration, width, height });
    };
    video.onerror = () => finishError(new Error("video_metadata_failed"));
    video.src = sourceUrl;
  });
}

async function getDurationWithFFmpeg(ffmpeg: FFmpeg, inputName: string) {
  const outputName = `${inputName}.duration.txt`;
  try {
    const exitCode = await ffmpeg.ffprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputName,
      "-o",
      outputName,
    ], 20_000);
    if (exitCode !== 0) return null;
    const output = await ffmpeg.readFile(outputName, "utf8");
    const duration = Number(String(output).trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  } finally {
    try {
      await ffmpeg.deleteFile(outputName);
    } catch {
      // The probe output may not exist after an interrupted read.
    }
  }
}

async function deleteVirtualFile(ffmpeg: FFmpeg, name: string) {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    // The file may not exist after an interrupted conversion.
  }
}

export async function compressVideo(
  file: File,
  maxOutputBytes: number,
  onUpdate: (update: VideoCompressionUpdate) => void,
): Promise<CompressedVideoResult> {
  const beforeBytes = file.size;
  let afterBytes: number | null = null;
  let durationSeconds: number | null = null;

  if (!isSupportedVideoFile(file)) {
    throw new Error("unsupported_video_type");
  }

  if (compressionBusy) {
    throw new Error("video_compression_busy");
  }

  compressionBusy = true;
  const token = crypto.randomUUID().replaceAll("-", "");
  const inputName = `input_${token}.${getVideoExtension(file)}`;
  const outputName = `output_${token}.mp4`;
  let ffmpeg: FFmpeg | null = null;

  try {
    onUpdate({ message: "קורא את פרטי הסרטון…", progress: 1 });
    try {
      const metadata = await loadVideoMetadata(file);
      durationSeconds = metadata.duration;
    } catch {
      durationSeconds = null;
    }

    ffmpeg = await getFFmpeg(onUpdate);
    onUpdate({ message: "מכין את הסרטון לכיווץ…", progress: 3 });
    await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));

    if (!durationSeconds) {
      durationSeconds = await getDurationWithFFmpeg(ffmpeg, inputName);
    }
    if (!durationSeconds || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
      throw new Error("video_metadata_failed");
    }

    const attempts = [
      { maxWidth: 1280, targetRatio: 0.86, audioKbps: 96 },
      { maxWidth: 960, targetRatio: 0.66, audioKbps: 64 },
      { maxWidth: 720, targetRatio: 0.46, audioKbps: 48 },
    ];

    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      await deleteVirtualFile(ffmpeg, outputName);

      const targetBytes = Math.max(
        512 * 1024,
        Math.min(maxOutputBytes * attempt.targetRatio, beforeBytes * 0.88),
      );
      const totalKbps = Math.max(180, Math.floor((targetBytes * 8) / durationSeconds / 1000));
      const audioKbps = Math.min(attempt.audioKbps, Math.max(32, Math.floor(totalKbps * 0.22)));
      const videoKbps = Math.max(120, Math.min(4500, totalKbps - audioKbps));
      const maxRateKbps = Math.max(videoKbps, Math.round(videoKbps * 1.15));
      const bufferKbps = Math.max(maxRateKbps * 2, 300);
      const segmentStart = index === 0 ? 5 : index === 1 ? 67 : 87;
      const segmentSpan = index === 0 ? 60 : index === 1 ? 18 : 10;

      activeProgressHandler = ({ progress }) => {
        const normalized = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
        const displayedProgress = Math.min(98, Math.round(segmentStart + normalized * segmentSpan));
        onUpdate({
          message: `מכווץ את הסרטון… ${displayedProgress}%`,
          progress: displayedProgress,
        });
      };

      onUpdate({
        message: index === 0 ? "מכווץ את הסרטון…" : "ממשיך לכווץ כדי לעמוד בגודל המותר…",
        progress: segmentStart,
      });

      const exitCode = await ffmpeg.exec([
        "-i",
        inputName,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `scale=min(${attempt.maxWidth}\\,iw):-2`,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-b:v",
        `${videoKbps}k`,
        "-maxrate",
        `${maxRateKbps}k`,
        "-bufsize",
        `${bufferKbps}k`,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        `${audioKbps}k`,
        "-movflags",
        "+faststart",
        outputName,
      ]);
      activeProgressHandler = null;

      if (exitCode !== 0) {
        throw new Error(`video_compression_failed_${exitCode}`);
      }

      const outputData = await ffmpeg.readFile(outputName);
      if (!(outputData instanceof Uint8Array)) {
        throw new Error("video_compression_failed");
      }
      const outputCopy = new Uint8Array(outputData.byteLength);
      outputCopy.set(outputData);
      afterBytes = outputCopy.byteLength;

      if (afterBytes <= maxOutputBytes) {
        const outputFileName = `${file.name.replace(/\.[^.]+$/, "") || "video"}.mp4`;
        const outputFile = new File([outputCopy], outputFileName, { type: "video/mp4" });
        const reductionPercent = beforeBytes > 0
          ? Math.round((1 - afterBytes / beforeBytes) * 1000) / 10
          : 0;

        onUpdate({ message: "הסרטון מוכן להעלאה.", progress: 100 });

        return {
          file: outputFile,
          beforeBytes,
          afterBytes,
          reductionPercent,
          durationSeconds,
        };
      }
    }

    throw new CompressedVideoTooLargeError(beforeBytes, afterBytes ?? beforeBytes, maxOutputBytes);
  } catch (error) {
    activeProgressHandler = null;
    throw error;
  } finally {
    if (ffmpeg) {
      await deleteVirtualFile(ffmpeg, inputName);
      await deleteVirtualFile(ffmpeg, outputName);
    }
    activeProgressHandler = null;
    compressionBusy = false;
  }
}
