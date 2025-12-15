import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =========================
   KONFIGURASI SUPABASE
========================= */
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_PUBLIC_ANON_KEY";

let supabaseInstance = null;

/* =========================
   SAFE SUPABASE INIT
========================= */
export async function getSupabase() {
    if (supabaseInstance) return supabaseInstance;

    if (!window.crypto || !window.fetch) {
        throw new Error("Browser tidak mendukung Supabase (crypto/fetch missing)");
    }

    supabaseInstance = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
        },
    });

    return supabaseInstance;
}

/* =========================
   AUTH
========================= */
export async function requireAuth() {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();

    if (!data.session) {
        window.location.href = "/login.html";
    }
}

export async function getCurrentUser() {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser();
    return data.user;
}

export async function logoutUser() {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
    window.location.href = "/login.html";
}

/* =========================
   ONLINE USERS
========================= */
export async function getOnlineUsers() {
    const supabase = await getSupabase();
    const { data } = await supabase
        .from("users")
        .select("username")
        .eq("is_online", true);

    return data || [];
}

export async function updateUserActivity() {
    const supabase = await getSupabase();
    const user = await getCurrentUser();
    if (!user) return;

    await supabase
        .from("users")
        .update({
            last_active: new Date().toISOString(),
            is_online: true,
        })
        .eq("id", user.id);
}

export function subscribeToOnlineUsers(callback) {
    getSupabase().then((supabase) => {
        supabase
            .channel("online-users")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "users" },
                callback
            )
            .subscribe();
    });
}

/* =========================
   ACTIVITY LOGS
========================= */
export async function getActivityLogs(limit = 50) {
    const supabase = await getSupabase();

    const { data, error } = await supabase
        .from("activity_logs")
        .select(`
            id,
            activity_type,
            description,
            created_at,
            users ( username )
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

/* 🔴 INI YANG KEMARIN HILANG */
export async function testActivityLogsAccess() {
    try {
        const supabase = await getSupabase();
        const { error } = await supabase
            .from("activity_logs")
            .select("id")
            .limit(1);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

export function subscribeToActivityLogs(callback) {
    getSupabase().then((supabase) => {
        supabase
            .channel("activity-logs")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "activity_logs" },
                (payload) => callback(payload.new)
            )
            .subscribe();
    });
}

export async function trackNavigation(menuName) {
    const supabase = await getSupabase();
    const user = await getCurrentUser();
    if (!user) return;

    await supabase.from("activity_logs").insert({
        user_id: user.id,
        activity_type: "NAVIGATION",
        description: `Membuka menu ${menuName}`,
    });
}
