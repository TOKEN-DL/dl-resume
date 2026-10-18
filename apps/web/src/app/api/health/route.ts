/**
 * Health check — 用于 Docker 部署和 CI
 */
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    name: "dl-resume-web",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  });
}