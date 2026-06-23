import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // ===========================
  // CORS PRE-FLIGHT
  // ===========================
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ===========================
    // INIT SUPABASE
    // ===========================
    const supabaseAdmin = createClient(
      "https://cjrpjekmqrckozrbtwps.supabase.co",
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    // ===========================
    // AUTH CHECK
    // ===========================
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: corsHeaders }
      );
    }

    // ===========================
    // ROLE CHECK
    // ===========================
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowedRoles = ["mudeer", "assistant_mudeer"];

    if (!allowedRoles.includes(profile?.role)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Forbidden: insufficient permissions",
        }),
        { status: 403, headers: corsHeaders }
      );
    }

    // ===========================
    // GET STAFF ID
    // ===========================
    const { staffId } = await req.json();

    if (!staffId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing staffId" }),
        { status: 400, headers: corsHeaders }
      );
    }

    console.log("Deleting staff:", staffId);

    // ===========================
    // GET PROFILE DATA
    // ===========================
    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("passport_path")
      .eq("id", staffId)
      .single();

    // ===========================
    // 1. DELETE AUTH USER (SAFE)
    // ===========================
    console.log("Attempting auth delete:", staffId);

    const { error: authError } =
      await supabaseAdmin.auth.admin.deleteUser(staffId);

    if (authError) {
      console.warn("Auth delete issue (continuing):", authError.message);
    } else {
      console.log("Auth deleted successfully");
    }

    // ===========================
    // 2. DELETE PROFILE
    // ===========================
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", staffId);

    if (profileError) {
      console.warn("Profile delete error:", profileError.message);
    }

    // ===========================
    // 3. DELETE STORAGE (BEST EFFORT)
    // ===========================
    if (profileData?.passport_path) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("passports")
        .remove([profileData.passport_path]);

      if (storageError) {
        console.warn("Storage delete error:", storageError.message);
      }
    }

    // ===========================
    // SUCCESS RESPONSE
    // ===========================
    return new Response(
      JSON.stringify({
        success: true,
        message: "Staff deleted successfully",
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (err) {
    console.error("Unexpected error:", err);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});