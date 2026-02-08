#!/usr/bin/env node

/**
 * Script to help add event logging to API routes
 * Usage: node scripts/add-event-logging.js <file-path>
 *
 * This script checks if event logging is present and suggests where to add it
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: node scripts/add-event-logging.js <file-path>");
  process.exit(1);
}

const fullPath = path.resolve(filePath);
const content = fs.readFileSync(fullPath, "utf-8");

// Check for logApiEvent import
const hasImport =
  content.includes("from '@/lib/services/eventLogger'") ||
  content.includes('from "@/lib/services/eventLogger"');

// Check for logApiEvent usage
const hasUsage = content.includes("logApiEvent");

// Check for exported handlers
const hasPOST = content.includes("export async function POST");
const hasGET = content.includes("export async function GET");
const hasPUT = content.includes("export async function PUT");
const hasDELETE = content.includes("export async function DELETE");
const hasPATCH = content.includes("export async function PATCH");

const hasHandlers = hasPOST || hasGET || hasPUT || hasDELETE || hasPATCH;

console.log(`\n📋 Event Logging Check for: ${filePath}\n`);

if (!hasHandlers) {
  console.log("✅ No API handlers found - skipping");
  process.exit(0);
}

if (hasImport && hasUsage) {
  console.log("✅ Event logging is present");
  process.exit(0);
}

console.log("⚠️  Event logging is MISSING!\n");

if (!hasImport) {
  console.log("📝 Add this import at the top:");
  console.log("   import { logApiEvent } from '@/lib/services/eventLogger';\n");
}

if (!hasUsage) {
  console.log("📝 Add event logging in your handlers:");
  console.log(`
   // For success cases:
   await logApiEvent(request, {
     actionType: "your_action_type",
     userId: user?.id,
     userEmail: user?.email || undefined,
     entityType: "entity_type",
     entityId: entityId,
     details: { /* relevant context */ },
   });

   // For error cases:
   await logApiEvent(request, {
     actionType: "your_action_type",
     userId: user?.id,
     status: "error",
     errorMessage: error.message,
   });
  `);
}

console.log("\n📚 See EVENT_LOGGING_GUIDE.md for more details\n");
process.exit(1);
