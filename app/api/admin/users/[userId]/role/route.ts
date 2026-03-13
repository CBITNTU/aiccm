import { NextRequest } from "next/server";
import { apiResponse, checkSuperadminRole } from "@/lib/api";
import { requireAuth, handleApiError, AuthError } from "@/lib/api/validation";
import { createUserRole, deleteUserRole } from "@/lib/db/queries";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { userId } = await params;
    const body = await request.json();
    const { role } = body as { role: "superadmin" | "sme-owner" | "sme-member" | "individual" };

    const data = await createUserRole(userId, role);

    return apiResponse({ role: data });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user } = await requireAuth(request);
    const isAdmin = await checkSuperadminRole(user.id);
    if (!isAdmin) throw new AuthError("Admin access required");

    const { userId } = await params;

    const { searchParams } = new URL(request.url);
    const role = (searchParams.get("role") || "superadmin") as "superadmin" | "sme-owner" | "sme-member" | "individual";

    await deleteUserRole(userId, role);

    return apiResponse({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
