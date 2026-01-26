import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiResponse, apiError } from "@/lib/api";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Get job counts by status
    const { data: pendingJobs } = await supabase
      .from("processing_queue" as any)
      .select("id", { count: "exact" })
      .eq("status", "pending");
      
    const { data: processingJobs } = await supabase
      .from("processing_queue" as any)
      .select("id", { count: "exact" })
      .eq("status", "processing");
    
    // Get active batches with details
    const { data: activeBatches } = await supabase
      .from("batch_jobs" as any)
      .select("id, company_id, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at")
      .eq("status", "processing")
      .order("created_at", { ascending: false })
      .limit(10);
    
    // Get recent jobs (last 50)
    const { data: recentJobs } = await supabase
      .from("processing_queue" as any)
      .select("id, job_type, status, batch_id, created_at, started_at, completed_at, error_message")
      .order("updated_at", { ascending: false })
      .limit(50);
    
    // Get environment info for debugging
    const envInfo = {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "NOT SET",
      VERCEL_URL: process.env.VERCEL_URL || "NOT SET",
      NODE_ENV: process.env.NODE_ENV,
      hasCronSecret: !!process.env.CRON_SECRET,
    };
    
    return apiResponse({
      timestamp: new Date().toISOString(),
      environment: envInfo,
      queue: {
        pending: pendingJobs?.length || 0,
        processing: processingJobs?.length || 0,
      },
      active_batches: activeBatches || [],
      recent_jobs: recentJobs || [],
    });
  } catch (error) {
    console.error("Error fetching queue status:", error);
    return apiError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}

// POST to manually trigger the worker
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    
    // Check if there are pending jobs
    const { data: pendingJobs, error: countError } = await supabase
      .from("processing_queue" as any)
      .select("id", { count: "exact" })
      .eq("status", "pending");
    
    const pendingCount = pendingJobs?.length || 0;
    
    if (pendingCount === 0) {
      return apiResponse({
        message: "No pending jobs to process",
        pending: 0,
        triggered: false,
      });
    }
    
    // Determine the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
                    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
                    "http://localhost:3000";
    
    console.log(`🚀 Manually triggering worker at ${baseUrl}/api/queue/worker`);
    console.log(`📊 Pending jobs: ${pendingCount}`);
    
    // Trigger the worker
    const workerResponse = await fetch(`${baseUrl}/api/queue/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchSize: 50,
        continuous: true,
        concurrency: 10, // Lower concurrency for production
      }),
    });
    
    let workerResult = null;
    try {
      workerResult = await workerResponse.json();
    } catch (e) {
      workerResult = { error: "Failed to parse response" };
    }
    
    return apiResponse({
      message: workerResponse.ok ? "Worker triggered successfully" : "Worker trigger failed",
      pending: pendingCount,
      triggered: true,
      workerUrl: `${baseUrl}/api/queue/worker`,
      workerStatus: workerResponse.status,
      workerResult,
    });
  } catch (error) {
    console.error("Error triggering worker:", error);
    return apiError(error instanceof Error ? error.message : "Unknown error", 500);
  }
}
