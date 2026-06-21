// ===========================================================
// SUPABASE EDGE FUNCTION: invite-staff
// ===========================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Redirect after invite confirmation
const DEFAULT_REDIRECT_URL = "https://albayaninstitute.netlify.app/staff-register.html";

Deno.serve(async (req) => {
  // Handle preflight
 if (req.method === "OPTIONS") {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("ANON_KEY");

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
      throw new Error("Missing environment variables");
    }

    // --------------------------------------------
    // Auth check (who is calling this function)
    // --------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: caller }, error: callerErr } =
      await callerClient.auth.getUser();

    if (callerErr || !caller) {
      return new Response(
        JSON.stringify({ error: "Invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------
    // Admin client (full power)
    // --------------------------------------------
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Check role
    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileErr || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedRoles = ["mudeer", "assistant_mudeer"];
    if (!allowedRoles.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Not authorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------
    // Safe request parsing
    // --------------------------------------------
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invite_id, email, redirect_origin } = body;
    
    const redirectTo = redirect_origin
  ? `${redirect_origin}/staff-register.html`
  : DEFAULT_REDIRECT_URL;

    if (!invite_id || !email) {
      return new Response(
        JSON.stringify({ error: "invite_id and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------
    // Send invite email
    // --------------------------------------------
    const { data: inviteData, error: inviteErr } =
  await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: redirectTo,
  });

    if (inviteErr) {
      return new Response(
        JSON.stringify({ error: inviteErr.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --------------------------------------------
    // Update database
    // --------------------------------------------
    await adminClient
      .from("staff_invites")
      .update({
        invited_by: caller.id,
        registered: false
      })
      .eq("id", invite_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invite sent successfully",
        user: inviteData.user
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("invite-staff error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
